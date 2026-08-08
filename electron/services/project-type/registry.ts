import type { ProjectTypeProvider } from './interface'
import { NpmProvider } from './npm/index'
import { PnpmProvider } from './pnpm/index'
import { MavenProvider } from './maven/index'
import { GradleProvider } from './gradle/index'

/** 项目类型注册表 */
class ProjectTypeRegistryImpl {
  private providers: Map<string, ProjectTypeProvider> = new Map()

  register(provider: ProjectTypeProvider): void {
    this.providers.set(provider.type, provider)
  }

  get(type: string): ProjectTypeProvider | undefined {
    return this.providers.get(type)
  }

  /** 按路径自动检测 */
  detect(path: string): ProjectTypeProvider {
    for (const provider of this.providers.values()) {
      if (provider.detect(path)) return provider
    }
    // 默认返回第一个注册的（npm）
    return this.providers.values().next().value || this.providers.get('npm')!
  }
}

/** 全局单例 */
export const projectTypeRegistry = new ProjectTypeRegistryImpl()

// 注册内置类型（按检测优先级：pnpm > npm > maven > gradle）
projectTypeRegistry.register(new PnpmProvider())
projectTypeRegistry.register(new NpmProvider())
projectTypeRegistry.register(new MavenProvider())
projectTypeRegistry.register(new GradleProvider())
