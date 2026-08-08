/*
 * @Author: zhengrenfu
 * @Date: 2026-07-21
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-21
 * @FilePath: \electron\services\vcs\index.ts
 * @Description: VCS 提供者接口定义、注册表实现与全局单例
 */
export type { VcsProvider }
export type SettingsGetter = (key: string, defaultVal?: any) => any

/** 更新结果 */
export interface VcsUpdateResult {
  status: 'ok' | 'conflict' | 'error'
  text?: string
}

/** VCS 信息 */
export interface VcsInfo {
  url?: string
  root?: string
  relativeUrl?: string
  revision?: string
  revisionRemote?: string
}

/** VCS 版本信息 */
export interface VcsRevisionInfo {
  revision: string
  revisionRemote: string
}

/** 批量检查结果（主进程通知用） */
export interface VcsCheckResult {
  projectName: string
  projectPath: string
  files: string[]
  count: number
  summary: string
  changeTypes?: string
}

/** VCS 提供者接口 -- 每种版本控制系统实现一个 */
export interface VcsProvider {
  readonly name: string
  readonly label: string

  isProject(path: string): boolean
  update(path: string): Promise<VcsUpdateResult>
  log(path: string, limit?: number): Promise<boolean>
  getInfo(path: string): VcsInfo | null
  checkRemote(projects: { name: string; path: string }[]): Promise<VcsCheckResult[]>
  checkLocal(projects: { name: string; path: string }[]): Promise<VcsCheckResult[]>
  openCommitGui?(path: string): boolean
  openLogGui?(path: string): boolean
  openRepoBrowser?(path: string): boolean
  getRevisionInfo?(path: string): Promise<VcsRevisionInfo | null>
  /** 迁移：从远程仓库检出到目标目录 */
  migrate?(url: string, targetDir: string): Promise<boolean>
}

/** 注册表：管理所有 VCS 提供者，按名称查找，按路径自动检测 */
export class VcsRegistryImpl {
  private providers: Map<string, VcsProvider> = new Map()
  private detectCache: Map<string, VcsProvider | null> = new Map()

  register(provider: VcsProvider): void {
    this.providers.set(provider.name, provider)
  }

  get(name: string): VcsProvider | undefined {
    return this.providers.get(name)
  }

  getAll(): VcsProvider[] {
    return Array.from(this.providers.values())
  }

  clearDetectCache(): void {
    this.detectCache.clear()
  }

  detect(path: string): VcsProvider | null {
    if (this.detectCache.has(path)) {
      return this.detectCache.get(path) || null
    }
    for (const provider of this.providers.values()) {
      if (provider.isProject(path)) {
        this.detectCache.set(path, provider)
        return provider
      }
    }
    this.detectCache.set(path, null)
    return null
  }

  async detectBatch(projects: { name: string; path: string }[]): Promise<(VcsProvider | null)[]> {
    const uncached: string[] = []
    projects.forEach((p) => {
      if (!this.detectCache.has(p.path)) {
        uncached.push(p.path)
      }
    })

    for (const path of uncached) {
      for (const provider of this.providers.values()) {
        if (provider.isProject(path)) {
          this.detectCache.set(path, provider)
          break
        }
      }
      if (!this.detectCache.has(path)) {
        this.detectCache.set(path, null)
      }
    }

    return projects.map((p) => this.detectCache.get(p.path) || null)
  }
}

/** 全局单例 */
export const vcsRegistry = new VcsRegistryImpl()
