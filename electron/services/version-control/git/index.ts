/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \electron\services\version-control\git\index.ts
 * @Description: Git 版本控制提供者，支持 git pull 拉取更新与仓库克隆
 */
import { existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import type {
  VcsProvider,
  VcsUpdateResult,
  VcsInfo,
  VcsCheckResult,
  VcsProgressHook,
} from '@electron/services/version-control/registry'
import { runSpawnStream } from '@electron/services/version-control/spawn-stream'

/* git pull 超时毫秒数，大仓库拉取耗时较长，放宽至 120 秒 */
const GIT_PULL_TIMEOUT = 120000
/* git clone 迁移的超时毫秒数 */
const GIT_CLONE_TIMEOUT = 300000
/* 远程检查命令的超时毫秒数，网络拉取参考信息超时 */
const GIT_FETCH_TIMEOUT = 60000
/* 分离头指针状态下 rev-parse 输出的占位分支名 */
const DETACHED_HEAD_BRANCH = 'HEAD'
/* 远程文件清单的 diff 参数，禁用路径转义以输出原始文件名 */
const DIFF_NAME_ONLY_ARGS = ['-c', 'core.quotepath=false', 'diff', '--name-only']
/* 单项目检查结果中文件列表的上限，与 SVN 提供者的展示规格保持一致 */
const MAX_RESULT_FILE_COUNT = 20
/* 失败条目中单条原因文本的长度上限，防止异常输出撑开展示面板 */
const MAX_REASON_LENGTH = 200
/* 当前分支解析失败且无有效输出时的兜底原因 */
const REASON_BRANCH_PARSE_FAILED = '无法解析当前分支'
/* 拉取远端失败且无有效输出时的兜底原因，网络与鉴权失败居多 */
const REASON_FETCH_FAILED = '无法连接远程仓库'
/* 提交差异统计失败且无有效输出时的兜底原因 */
const REASON_UPSTREAM_UNRESOLVED = '无法解析上游分支'
/* 文件差异比较失败且无有效输出时的兜底原因 */
const REASON_DIFF_FAILED = '无法比较文件差异'
/* 进度帧百分比匹配，git 以一到三位数字加百分号的形式写入进度 */
const PROGRESS_PERCENT_RE = /(\d{1,3})\s*%/
/* 进度百分比上报上限，100 由任务层在完成时给出 */
const MAX_REPORT_PERCENT = 99
/* remote 前缀行来自远端传输日志，不属于就地刷新的进度帧 */
const REMOTE_PREFIX_RE = /^remote:\s/i
/* 以 done 结尾的总结行不属于就地刷新的进度帧 */
const DONE_SUFFIX_RE = /done\.?\s*$/i

/**
 * 解析 git 输出行中的进度百分比，状态总结行按普通文本处理
 * remote 前缀行与 done 结尾行是阶段性状态，直接解析会让进度提前跳到接近完成
 * @param {string} line 去除首尾空白后的输出行
 * @returns {number | null} 进度百分比，非进度帧返回 null
 */
function parseGitProgressPercent(line: string): number | null {
  if (REMOTE_PREFIX_RE.test(line) || DONE_SUFFIX_RE.test(line)) return null
  const matched = line.match(PROGRESS_PERCENT_RE)
  if (!matched) return null
  return Math.min(MAX_REPORT_PERCENT, Number(matched[1]))
}

/**
 * 创建 git 输出行路由函数：进度帧解析为百分比，其余文本行逐行回调
 * 百分比单调递增上报，同值或回退的进度帧直接丢弃，避免重复推送
 * @param {VcsProgressHook} [hooks] 更新过程回调
 * @returns {(line: string) => void} 输出行处理函数，未提供 hooks 时返回 undefined
 */
function createGitLineRouter(hooks?: VcsProgressHook): ((line: string) => void) | undefined {
  if (!hooks) return undefined
  let lastPercent = 0
  return (line: string): void => {
    const text = line.trim()
    if (!text) return
    const percent = parseGitProgressPercent(text)
    if (percent !== null) {
      // 进度帧不进入逐行文本，只推送更高百分比
      if (percent > lastPercent) {
        lastPercent = percent
        hooks.onPercent?.(percent)
      }
      return
    }
    hooks.onLine?.(text)
  }
}

/**
 * 从失败命令的输出中提取首行有效文本作为失败原因
 * 输出按错误流优先合并，进度帧与空行不构成失败原因，均无有效文本时回退为兜底文案
 * @param {{ stdout: string; stderr: string }} result 失败命令收集到的完整输出
 * @param {string} fallback 输出不含有效文本时的兜底原因
 * @returns {string} 单行失败原因，超出长度上限时截断保留开头
 */
function extractReasonLine(result: { stdout: string; stderr: string }, fallback: string): string {
  const output = `${result.stderr}\n${result.stdout}`
  for (const rawLine of output.split('\n')) {
    const line = rawLine.replace(/\r/g, '').trim()
    if (!line || PROGRESS_PERCENT_RE.test(line)) continue
    return line.length > MAX_REASON_LENGTH ? line.slice(0, MAX_REASON_LENGTH) : line
  }
  return fallback
}

/**
 * 构造远程检查失败的结果条目，count 记为 -1 供主进程区分失败与真实更新
 * 单行失败原因放入文件列表，上层可直接消费 summary 呈现错误
 * @param {string} projectName 项目名称
 * @param {string} projectPath 项目目录
 * @param {string} reasonLine 单行失败原因
 * @returns {VcsCheckResult} 失败条目
 */
function createCheckFailureEntry(projectName: string, projectPath: string, reasonLine: string): VcsCheckResult {
  return {
    projectName,
    projectPath,
    files: [reasonLine],
    count: -1,
    summary: `远程检查失败: ${reasonLine}`,
  }
}

export class GitProvider implements VcsProvider {
  readonly name = 'git'
  readonly label = 'Git'

  isProject(path: string): boolean {
    path = resolve(path)
    while (true) {
      if (existsSync(join(path, '.git'))) return true
      const parent = dirname(path)
      if (parent === path) break
      path = parent
    }
    return false
  }

  /**
   * 以流式方式执行 git 命令，stdout 与 stderr 的输出行实时回调
   * 非交互终端不打印进度，由调用方追加 --progress 参数强制输出进度帧
   * 同时收集完整文本用于结果分类，超时后强制结束子进程
   * @param {string} path 仓库目录，克隆到目标目录时传 undefined 沿用当前目录
   * @param {string[]} args git 命令参数
   * @param {number} timeout 超时毫秒数
   * @param {VcsProgressHook} [hooks] 更新过程回调
   * @returns {Promise<{ ok: boolean; stdout: string; stderr: string }>} 退出状态与完整输出
   */
  private spawnGitStream(
    path: string | undefined,
    args: string[],
    timeout: number,
    hooks?: VcsProgressHook,
  ): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return runSpawnStream({
      command: 'git',
      args,
      cwd: path,
      timeout,
      onLine: createGitLineRouter(hooks),
    })
  }

  /**
   * 拉取仓库最新代码，非零退出且输出含冲突标识时判定为冲突
   * 本地存在未提交改动时 git pull 会干净地失败，属于可接受的提示行为
   * @param {string} path 仓库目录
   * @param {VcsProgressHook} [hooks] 更新过程回调
   * @returns {Promise<VcsUpdateResult>} 更新结果
   */
  async update(path: string, hooks?: VcsProgressHook): Promise<VcsUpdateResult> {
    const { ok, stdout, stderr } = await this.spawnGitStream(path, ['pull', '--progress'], GIT_PULL_TIMEOUT, hooks)
    // stdout 与 stderr 合并后分类，与 exec 通道的历史文本语义一致
    const text = (stdout + stderr).trim()
    if (!ok) {
      // 冲突判定需要非零退出码，避免把正常输出误判为冲突
      if (/conflict|automatic merge failed|not possible because you have unmerged|合并冲突/i.test(text)) {
        return { status: 'conflict', text: text || 'git pull 存在合并冲突' }
      }
      return { status: 'error', text: text || 'git pull 执行失败' }
    }
    // 成功但无输出时返回占位文本，保证输出面板有内容可展示
    return { status: 'ok', text: text || '已完成' }
  }

  async log(_path: string, _limit = 20): Promise<boolean> {
    return false
  }

  getInfo(_path: string): VcsInfo | null {
    return null
  }

  /**
   * 检查仓库是否存在可拉取的远程更新，每个仓库独立探测
   * 无上游分支的仓库（含分离头指针）按本地仓库静默跳过，不产生任何条目；
   * 拉取、比较等命令执行失败时上报失败条目，count 为 -1 供上层区分，
   * 避免全部项目失败（离线、鉴权等）时被误报为"未发现远程更新"
   * 整个过程只读取引用信息与远端元数据，不修改工作区和索引
   * @param {Array<{ name: string; path: string }>} projects 待检查的项目列表
   * @returns {Promise<VcsCheckResult[]>} 真实更新与执行失败的项目检查结果
   */
  async checkRemote(projects: { name: string; path: string }[]): Promise<VcsCheckResult[]> {
    const results: VcsCheckResult[] = []
    for (const { name, path } of projects) {
      if (!this.isProject(path)) continue
      // 分支解析失败说明仓库元数据损坏或 git 无法执行，属于真实失败，按失败条目上报
      const branchResult = await this.spawnGitStream(path, ['rev-parse', '--abbrev-ref', 'HEAD'], GIT_FETCH_TIMEOUT)
      const branch = branchResult.stdout.trim()
      if (!branchResult.ok) {
        results.push(createCheckFailureEntry(name, path, extractReasonLine(branchResult, REASON_BRANCH_PARSE_FAILED)))
        continue
      }
      // 分离头指针没有可跟踪的上游分支，属正常检出状态而非失败，静默跳过
      if (branch === DETACHED_HEAD_BRANCH) continue
      // 上游解析失败仅表示未配置上游或上游引用不存在，属仓库配置状态而非执行失败，
      // 本地仓库正常存在，逐次上报会让每次检查结果被这类项目刷屏，因此与 SVN 的非仓库项目一样静默跳过
      const upstreamResult = await this.spawnGitStream(path, ['rev-parse', '--abbrev-ref', '@{u}'], GIT_FETCH_TIMEOUT)
      const upstream = upstreamResult.stdout.trim()
      const remoteSlashIndex = upstream.indexOf('/')
      if (!upstreamResult.ok || remoteSlashIndex <= 0) continue
      const remote = upstream.slice(0, remoteSlashIndex)
      const upstreamBranch = upstream.slice(remoteSlashIndex + 1)
      // 拉取远端分支的最新引用，仅写入远端跟踪引用与 FETCH_HEAD，不影响工作区
      // 拉取失败多为网络或鉴权问题，此前静默跳过会与"没有更新"混淆，现按失败条目上报
      const fetchResult = await this.spawnGitStream(path, ['fetch', remote, upstreamBranch], GIT_FETCH_TIMEOUT)
      if (!fetchResult.ok) {
        results.push(createCheckFailureEntry(name, path, extractReasonLine(fetchResult, REASON_FETCH_FAILED)))
        continue
      }
      // 统计本地落后于上游的提交数，统计失败属于执行异常按失败上报；无差异时视为没有远程更新
      const countResult = await this.spawnGitStream(path, ['rev-list', '--count', 'HEAD..@{u}'], GIT_FETCH_TIMEOUT)
      const commitCount = Number(countResult.stdout.trim())
      if (!countResult.ok || Number.isNaN(commitCount)) {
        results.push(createCheckFailureEntry(name, path, extractReasonLine(countResult, REASON_UPSTREAM_UNRESOLVED)))
        continue
      }
      if (commitCount === 0) continue
      // 三点比较只取上游自共同祖先以来的文件变更，避免混入仅本地领先的改动
      let diffResult = await this.spawnGitStream(path, [...DIFF_NAME_ONLY_ARGS, 'HEAD...@{u}'], GIT_FETCH_TIMEOUT)
      // 无共同祖先的仓库无法三点比较，回退为两端提交树的完整差异
      if (!diffResult.ok) {
        diffResult = await this.spawnGitStream(path, [...DIFF_NAME_ONLY_ARGS, 'HEAD', '@{u}'], GIT_FETCH_TIMEOUT)
      }
      // 两种比较方式均失败说明对象库异常，按失败条目上报而不是伪装成没有更新
      if (!diffResult.ok) {
        results.push(createCheckFailureEntry(name, path, extractReasonLine(diffResult, REASON_DIFF_FAILED)))
        continue
      }
      // 文件数按全量行数统计，与 SVN 按文件计数保持一致；仅列表内容截断展示
      const fileList = diffResult.stdout.split('\n').filter((line) => line.length > 0)
      if (fileList.length === 0) continue
      results.push({
        projectName: name,
        projectPath: path,
        files: fileList.slice(0, MAX_RESULT_FILE_COUNT),
        count: fileList.length,
        summary: `${commitCount} 个远程提交待拉取，涉及 ${fileList.length} 个文件`,
      })
    }
    return results
  }

  async checkLocal(_projects: { name: string; path: string }[]): Promise<VcsCheckResult[]> {
    return []
  }

  /**
   * 使用 git clone 将远程仓库克隆到目标目录，进度帧实时解析为百分比回调
   * 使用 spawn 直接启动 git 进程，避免 shell 间接调用和输出缓冲
   * @param {string} url Git 仓库地址
   * @param {string} targetDir 目标目录路径
   * @param {VcsProgressHook} [hooks] 更新过程回调
   * @returns {Promise<boolean>} 操作是否成功
   */
  async migrate(url: string, targetDir: string, hooks?: VcsProgressHook): Promise<boolean> {
    const result = await this.spawnGitStream(
      undefined,
      ['clone', '--progress', url, targetDir],
      GIT_CLONE_TIMEOUT,
      hooks,
    )
    return result.ok
  }
}
