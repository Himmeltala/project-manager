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

  async checkRemote(_projects: { name: string; path: string }[]): Promise<VcsCheckResult[]> {
    return []
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
