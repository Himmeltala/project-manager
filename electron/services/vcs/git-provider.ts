import { existsSync } from 'fs'
import { join } from 'path'
import type { VcsProvider, VcsUpdateResult, VcsInfo, VcsCheckResult } from './vcs-provider.interface'

/** Git 提供者 -- 基本实现，供后续扩展 */
export class GitProvider implements VcsProvider {
  readonly name = 'git'
  readonly label = 'Git'

  isProject(path: string): boolean {
    path = require('path').resolve(path)
    while (true) {
      if (existsSync(join(path, '.git'))) return true
      const parent = require('path').dirname(path)
      if (parent === path) break
      path = parent
    }
    return false
  }

  async update(path: string): Promise<VcsUpdateResult> {
    // TODO: git pull
    return { status: 'error', text: 'Git 更新尚未实现' }
  }

  async log(path: string, _limit = 20): Promise<boolean> {
    // TODO: git log
    return false
  }

  getInfo(path: string): VcsInfo | null {
    // TODO: git remote -v, git rev-parse
    return null
  }

  async checkRemote(_projects: { name: string; path: string }[]): Promise<VcsCheckResult[]> {
    // TODO: git fetch + git status
    return []
  }

  async checkLocal(_projects: { name: string; path: string }[]): Promise<VcsCheckResult[]> {
    // TODO: git status
    return []
  }
}
