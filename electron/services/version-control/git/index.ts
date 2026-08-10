/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-21
 * @FilePath: \electron\services\vcs\adapters\git.ts
 * @Description: Git 版本控制提供者（骨架实现）
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import type { VcsProvider, VcsUpdateResult, VcsInfo, VcsCheckResult } from '@electron/services/version-control/registry'

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

  async update(_path: string): Promise<VcsUpdateResult> {
    return { status: 'error', text: 'Git 更新尚未实现' }
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
   * 使用 git clone 将远程仓库克隆到目标目录
   * 使用 spawn 直接启动 git 进程，避免 shell 间接调用和输出缓冲
   * @param {string} url Git 仓库地址
   * @param {string} targetDir 目标目录路径
   * @returns {Promise<boolean>} 操作是否成功
   */
  async migrate(url: string, targetDir: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const child = spawn('git', ['clone', url, targetDir], {
        stdio: 'ignore',
        timeout: 300000,
        windowsHide: true,
      })
      child.on('error', () => resolve(false))
      child.on('close', (code) => resolve(code === 0))
    })
  }
}
