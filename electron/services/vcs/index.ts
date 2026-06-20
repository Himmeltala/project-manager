import type { VcsProvider } from './vcs-provider.interface'
import { SvnProvider } from './svn-provider'
import { GitProvider } from './git-provider'

/** 注册表：管理所有 VCS 提供者，按名称查找，按路径自动检测 */
class VcsRegistryImpl {
  private providers: Map<string, VcsProvider> = new Map()

  register(provider: VcsProvider): void {
    this.providers.set(provider.name, provider)
  }

  get(name: string): VcsProvider | undefined {
    return this.providers.get(name)
  }

  getAll(): VcsProvider[] {
    return Array.from(this.providers.values())
  }

  /** 按路径检测所属 VCS 类型 */
  detect(path: string): VcsProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.isProject(path)) return provider
    }
    return null
  }

  /** 统计项目中有多少个属于各 VCS，未检测到的归为 none */
  countByType(projects: { name: string; path: string }[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const p of projects) {
      const provider = this.detect(p.path)
      const key = provider?.name || 'none'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }
}

/** 全局单例 */
export const vcsRegistry = new VcsRegistryImpl()

// 注册内置提供者
vcsRegistry.register(new SvnProvider())
vcsRegistry.register(new GitProvider())
