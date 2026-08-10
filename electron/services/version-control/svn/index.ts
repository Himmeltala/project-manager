/*
 * @Author: zhengrenfu
 * @Date: 2026-07-21
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \electron\services\vcs\adapters\svn.ts
 * @Description: SVN 版本控制提供者，支持可配置的 SVN/TortoiseSVN 路径
 */
import { exec, execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import type { VcsProvider, VcsUpdateResult, VcsInfo, VcsCheckResult, SettingsGetter } from '@electron/services/version-control/registry'

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

  private execSvn(path: string, args: string[], timeout = 60000): Promise<{ ok: boolean; stdout: string }> {
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
              text = stdout.toString((cp.includes('936') ? 'gbk' : 'latin1') as BufferEncoding)
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
                errText = stderr.toString((cp.includes('936') ? 'gbk' : 'latin1') as BufferEncoding)
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

  async update(path: string): Promise<VcsUpdateResult> {
    const { stdout, ok } = await this.execSvn(path, ['update', '--accept', 'postpone'])
    if (!stdout.trim()) return { status: 'error', text: stdout }

    const lower = stdout.toLowerCase()
    if (lower.includes('conflict') || lower.includes('合并冲突')) {
      return { status: 'conflict', text: stdout }
    }
    if (lower.includes('revision') || lower.includes('updated') || lower.includes('checkout')) {
      return { status: 'ok', text: stdout }
    }
    return ok ? { status: 'ok', text: stdout } : { status: 'error', text: stdout }
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
        encoding: 'gbk' as any,
        timeout: 10000,
        windowsHide: true,
      })
      const info: Record<string, string> = {}
      for (const line of (result as string).split('\n')) {
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
   * 使用 svn checkout 将远程仓库检出到目标目录
   * 复用 execSvn 的统一编码检测和 Promise 封装
   * @param {string} url SVN 仓库地址
   * @param {string} targetDir 目标目录路径
   * @returns {Promise<boolean>} 操作是否成功
   */
  async migrate(url: string, targetDir: string): Promise<boolean> {
    const { ok } = await this.execSvn(dirname(targetDir), ['checkout', url, targetDir], 300000)
    return ok
  }
}
