import { exec } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import type { VcsProvider, VcsFileChange, VcsUpdateResult, VcsInfo, VcsCheckResult } from './vcs-provider.interface'

function execSvn(path: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    exec(
      ['svn', ...args].join(' '),
      { cwd: path, timeout: 60000, windowsHide: true, encoding: 'buffer' },
      (err, stdout: Buffer, stderr: Buffer) => {
        let text = stdout.toString('utf-8')
        if (text.includes('�')) {
          try {
            const cp = require('child_process').execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 1000 })
            text = stdout.toString((cp.includes('936') ? 'gbk' : 'latin1') as BufferEncoding)
          } catch {
            /* keep utf-8 */
          }
        }
        resolve({ ok: !err, stdout: text || stderr.toString('utf-8') })
      },
    )
  })
}

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

  isProject(path: string): boolean {
    path = require('path').resolve(path)
    while (true) {
      if (existsSync(join(path, '.svn'))) return true
      const parent = require('path').dirname(path)
      if (parent === path) break
      path = parent
    }
    return false
  }

  async update(path: string): Promise<VcsUpdateResult> {
    const { stdout, ok } = await execSvn(path, ['update', '--accept', 'postpone'])
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
    const { ok } = await execSvn(path, ['log', `-l ${limit}`])
    return ok
  }

  getInfo(path: string): VcsInfo | null {
    if (!this.isProject(path)) return null
    try {
      const result = require('child_process').execSync(`svn info "${path}"`, {
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
      }
      return info.url ? info : null
    } catch {
      return null
    }
  }

  async checkRemote(projects: { name: string; path: string }[]): Promise<VcsCheckResult[]> {
    const results: VcsCheckResult[] = []
    for (const { name, path } of projects) {
      if (!this.isProject(path)) continue
      const { ok, stdout } = await execSvn(path, ['status', '-u'])
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
      const { ok, stdout } = await execSvn(path, ['status'])
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

  openCommitGui(path: string): boolean {
    const candidates = [
      process.env.ProgramFiles + '\\TortoiseSVN\\bin\\TortoiseProc.exe',
      process.env['ProgramFiles(x86)'] + '\\TortoiseSVN\\bin\\TortoiseProc.exe',
    ]
    for (const exe of candidates) {
      if (existsSync(exe)) {
        require('child_process').execSync(`"${exe}" /command:commit /path:"${path}"`)
        return true
      }
    }
    return false
  }

  openLogGui(path: string): boolean {
    const candidates = [
      process.env.ProgramFiles + '\\TortoiseSVN\\bin\\TortoiseProc.exe',
      process.env['ProgramFiles(x86)'] + '\\TortoiseSVN\\bin\\TortoiseProc.exe',
    ]
    for (const exe of candidates) {
      if (existsSync(exe)) {
        require('child_process').execSync(`"${exe}" /command:log /path:"${path}"`)
        return true
      }
    }
    return false
  }
}
