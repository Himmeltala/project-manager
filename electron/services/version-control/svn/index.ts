/*
 * @Author: zhengrenfu
 * @Date: 2026-07-21
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \electron\services\version-control\svn\index.ts
 * @Description: SVN 版本控制提供者，支持可配置的 SVN/TortoiseSVN 路径
 */
import { exec, execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import type {
  VcsProvider,
  VcsUpdateResult,
  VcsInfo,
  VcsCheckResult,
  VcsProgressHook,
  SettingsGetter,
} from '@electron/services/version-control/registry'
import * as iconv from 'iconv-lite'
import { runSpawnStream } from '@electron/services/version-control/spawn-stream'

/* svn 常规命令的超时毫秒数，大仓库更新耗时较长 */
const SVN_COMMAND_TIMEOUT = 60000
/* svn checkout 迁移的超时毫秒数 */
const SVN_CHECKOUT_TIMEOUT = 300000

const CHANGE_PREFIXES = new Set(['M', 'A', 'D', '!', '?', 'C', '~', 'I', 'R'])
const TYPE_NAMES: Record<string, string> = {
  M: '已修改',
  A: '已添加',
  D: '已删除',
  '!': '缺失',
  '?': '未版本化',
  C: '冲突',
  '~': '类型变更',
  I: '忽略',
  R: '已替换',
}

export class SvnProvider implements VcsProvider {
  readonly name = 'svn'
  readonly label = 'SVN'
  private settingsGetter: SettingsGetter | null = null

  setSettingsGetter(getter: SettingsGetter): void {
    this.settingsGetter = getter
  }

  private getSvnPath(): string {
    return this.settingsGetter ? this.settingsGetter('svn.path', 'svn') : 'svn'
  }

  private getTortoisePath(): string | null {
    const configured = this.settingsGetter ? this.settingsGetter('svn.tortoise_path', '') : ''
    if (configured) {
      return existsSync(configured) ? configured : null
    }
    const candidates = [
      process.env.ProgramFiles + '\\TortoiseSVN\\bin\\TortoiseProc.exe',
      process.env['ProgramFiles(x86)'] + '\\TortoiseSVN\\bin\\TortoiseProc.exe',
    ]
    for (const exe of candidates) {
      if (existsSync(exe)) return exe
    }
    return null
  }

  private execSvn(
    path: string,
    args: string[],
    timeout = SVN_COMMAND_TIMEOUT,
  ): Promise<{ ok: boolean; stdout: string }> {
    const svnPath = this.getSvnPath()
    // 路径包含空格时用引号包裹，避免 shell 解析错误
    const quotedSvn = svnPath.includes(' ') ? `"${svnPath}"` : svnPath
    return new Promise((resolve) => {
      exec(
        [quotedSvn, ...args].join(' '),
        { cwd: path, timeout, windowsHide: true, encoding: 'buffer' },
        (err, stdout: Buffer, stderr: Buffer) => {
          let text = stdout.toString('utf-8')
          if (text.includes('�')) {
            try {
              const cp = execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 1000 })
              // Node Buffer 不支持 gbk，用 iconv-lite 解码
              text = iconv.decode(stdout, cp.includes('936') ? 'gbk' : 'latin1')
            } catch {
              /* keep utf-8 */
            }
          }
          // stderr 回退内容同样进行 GBK 编码检测
          if (!text && stderr.length > 0) {
            let errText = stderr.toString('utf-8')
            if (errText.includes('�')) {
              try {
                const cp = execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 1000 })
                // Node Buffer 不支持 gbk，用 iconv-lite 解码
                errText = iconv.decode(stderr, cp.includes('936') ? 'gbk' : 'latin1')
              } catch {
                /* keep utf-8 */
              }
            }
            resolve({ ok: !err, stdout: errText })
            return
          }
          resolve({ ok: !err, stdout: text })
        },
      )
    })
  }

  isProject(path: string): boolean {
    path = resolve(path)
    while (true) {
      if (existsSync(join(path, '.svn'))) return true
      const parent = dirname(path)
      if (parent === path) break
      path = parent
    }
    return false
  }

  /**
   * 以流式方式执行 svn 命令，stdout 与 stderr 的每行输出实时回调
   * 同时收集完整文本用于结果分类，超时后强制结束子进程
   * @param {string} path 工作目录
   * @param {string[]} args svn 命令参数
   * @param {number} timeout 超时毫秒数
   * @param {VcsProgressHook} [hooks] 更新过程回调，仅使用其中的逐行输出回调
   * @returns {Promise<{ ok: boolean; stdout: string; stderr: string }>} 退出状态与完整输出
   */
  private spawnSvnStream(
    path: string,
    args: string[],
    timeout: number,
    hooks?: VcsProgressHook,
  ): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return runSpawnStream({
      command: this.getSvnPath(),
      args,
      cwd: path,
      timeout,
      onLine: hooks
        ? (line) => {
            const text = line.trim()
            // SVN 无进度百分比，非空行全部作为实时文本行
            if (text) hooks.onLine?.(text)
          }
        : undefined,
    })
  }

  /**
   * 更新工作副本到最新版本，输出行实时透传给调用方
   * stdout 为空时回退使用 stderr 内容，与 exec 通道的历史文本语义一致
   * @param {string} path 工作副本路径
   * @param {VcsProgressHook} [hooks] 更新过程回调
   * @returns {Promise<VcsUpdateResult>} 更新结果
   */
  async update(path: string, hooks?: VcsProgressHook): Promise<VcsUpdateResult> {
    const { ok, stdout, stderr } = await this.spawnSvnStream(
      path,
      ['update', '--accept', 'postpone'],
      SVN_COMMAND_TIMEOUT,
      hooks,
    )
    const text = stdout || stderr
    if (!text.trim()) return { status: 'error', text }

    const lower = text.toLowerCase()
    if (lower.includes('conflict') || lower.includes('合并冲突')) {
      return { status: 'conflict', text }
    }
    if (lower.includes('revision') || lower.includes('updated') || lower.includes('checkout')) {
      return { status: 'ok', text }
    }
    return ok ? { status: 'ok', text } : { status: 'error', text }
  }

  async log(path: string, limit = 20): Promise<boolean> {
    const { ok } = await this.execSvn(path, ['log', `-l ${limit}`])
    return ok
  }

  getInfo(path: string): VcsInfo | null {
    if (!this.isProject(path)) return null
    const svnPath = this.getSvnPath()
    try {
      const result = execSync(`"${svnPath}" info "${path}"`, {
        encoding: 'buffer',
        timeout: 10000,
        windowsHide: true,
      }) as Buffer
      let text = result.toString('utf-8')
      if (text.includes('�')) {
        // Node Buffer 不支持 gbk，用 iconv-lite 解码
        text = iconv.decode(result, 'gbk')
      }
      const info: Record<string, string> = {}
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('URL:')) info.url = trimmed.slice(4).trim()
        else if (trimmed.startsWith('Relative URL:')) info.relativeUrl = trimmed.slice(13).trim()
        else if (trimmed.startsWith('Working Copy Root Path:')) info.root = trimmed.slice(23).trim()
        else if (trimmed.startsWith('Revision:')) info.revision = trimmed.slice(9).trim()
        else if (trimmed.startsWith('Last Changed Rev:')) info.revisionRemote = trimmed.slice(17).trim()
      }
      return info.url ? (info as VcsInfo) : null
    } catch {
      return null
    }
  }

  async getRevisionInfo(path: string): Promise<{ revision: string; revisionRemote: string } | null> {
    if (!this.isProject(path)) return null
    try {
      const [localRes, remoteRes] = await Promise.all([
        this.execSvn(path, ['info', '--show-item', 'last-changed-revision']),
        this.execSvn(path, ['info', '-r', 'HEAD', '--show-item', 'last-changed-revision']),
      ])
      const local = localRes.stdout.trim()
      const remote = remoteRes.stdout.trim()
      return local ? { revision: local, revisionRemote: remote || local } : null
    } catch {
      return null
    }
  }

  async checkRemote(projects: { name: string; path: string }[]): Promise<VcsCheckResult[]> {
    const results: VcsCheckResult[] = []
    for (const { name, path } of projects) {
      if (!this.isProject(path)) continue
      const { ok, stdout } = await this.execSvn(path, ['status', '-u'])
      if (!ok) continue
      const remoteFiles: string[] = []
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.length > 7 && trimmed[0] === '*') remoteFiles.push(trimmed)
      }
      if (remoteFiles.length > 0) {
        results.push({
          projectName: name,
          projectPath: path,
          files: remoteFiles.slice(0, 20),
          count: remoteFiles.length,
          summary: `${remoteFiles.length}个文件有新的远程版本`,
        })
      }
    }
    return results
  }

  async checkLocal(projects: { name: string; path: string }[]): Promise<VcsCheckResult[]> {
    const results: VcsCheckResult[] = []
    for (const { name, path } of projects) {
      if (!this.isProject(path)) continue
      const { ok, stdout } = await this.execSvn(path, ['status'])
      if (!ok) continue
      const changes: string[] = []
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (CHANGE_PREFIXES.has(trimmed[0])) changes.push(trimmed)
      }
      if (changes.length > 0) {
        const typeCounts: Record<string, number> = {}
        for (const line of changes) typeCounts[line[0]] = (typeCounts[line[0]] || 0) + 1
        const typeDesc = Object.entries(typeCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([t, cnt]) => `${cnt} ${TYPE_NAMES[t] || t}`)
          .join('，')
        results.push({
          projectName: name,
          projectPath: path,
          files: changes.slice(0, 20),
          count: changes.length,
          changeTypes: typeDesc,
          summary: `${changes.length}个未提交变更: ${typeDesc}`,
        })
      }
    }
    return results
  }

  private execTortoise(path: string, command: string): boolean {
    const exe = this.getTortoisePath()
    if (!exe) return false
    try {
      execSync(`"${exe}" /command:${command} /path:"${path}"`)
      return true
    } catch {
      return false
    }
  }

  openCommitGui(path: string): boolean {
    return this.execTortoise(path, 'commit')
  }

  openLogGui(path: string): boolean {
    return this.execTortoise(path, 'log')
  }

  openRepoBrowser(path: string): boolean {
    return this.execTortoise(path, 'repobrowser')
  }

  /**
   * 使用 svn checkout 将远程仓库检出到目标目录，输出行实时透传给调用方
   * @param {string} url SVN 仓库地址
   * @param {string} targetDir 目标目录路径
   * @param {VcsProgressHook} [hooks] 更新过程回调
   * @returns {Promise<boolean>} 操作是否成功
   */
  async migrate(url: string, targetDir: string, hooks?: VcsProgressHook): Promise<boolean> {
    const result = await this.spawnSvnStream(
      dirname(targetDir),
      ['checkout', url, targetDir],
      SVN_CHECKOUT_TIMEOUT,
      hooks,
    )
    return result.ok
  }
}
