/**
 * Gradle 项目类型提供者
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider, RunnableModule } from '@electron/services/project-type/interface'
import type { CommandProfile, ContextMenuItem } from '@/types/project'
import { detectRunnableModules } from '@electron/services/project-type/gradle/modules'
import { PROFILE } from '@electron/services/project-type/gradle/profile'
import { getTaskList } from '@electron/services/project-type/gradle/tasks'
import { javaFrameworkRegistry } from '@electron/services/project-type/maven/framework/index'
import { GradleSpringBootFramework } from '@electron/services/project-type/gradle/framework/spring-boot'
import { QuarkusFramework } from '@electron/services/project-type/gradle/framework/quarkus'

// 将 Gradle 专属的 Java 框架注册到共享注册表（在 Maven 框架之后注册，检测优先级靠后）
javaFrameworkRegistry.register(new GradleSpringBootFramework())
javaFrameworkRegistry.register(new QuarkusFramework())

export class GradleProvider implements ProjectTypeProvider {
  readonly type = 'gradle'
  readonly label = 'Gradle'

  detect(path: string): boolean {
    return existsSync(join(path, 'build.gradle')) || existsSync(join(path, 'build.gradle.kts'))
  }

  getProfile(): CommandProfile {
    return PROFILE
  }

  resolveStartCommand(path?: string, module?: RunnableModule): string {
    if (module) {
      return `gradle ${module.modulePath}:bootRun`
    }
    if (path) {
      const framework = javaFrameworkRegistry.detect(path)
      if (framework) {
        return framework.getStartCommand(path, module?.modulePath)
      }
    }
    return 'gradle bootRun'
  }

  detectRunnableModules(path: string): RunnableModule[] {
    return detectRunnableModules(path)
  }

  readArtifactName(path: string): string | null {
    try {
      const settingsPath = join(path, 'settings.gradle')
      if (existsSync(settingsPath)) {
        const content = readFileSync(settingsPath, 'utf-8')
        const m = /rootProject\.name\s*=\s*['"]([^'"]+)['"]/.exec(content)
        if (m) return m[1]
      }
    } catch {
      /* ignore */
    }
    return null
  }

  getTaskList(path: string) {
    return getTaskList(path)
  }

  getContextMenuItems(): ContextMenuItem[] {
    return [
      { id: 'java', label: 'Java 版本', value: null },
      { id: 'gradle', label: 'Gradle 版本', value: null },
    ]
  }

  getConfigFilePath(path: string): string | null {
    const gp = join(path, 'build.gradle')
    if (existsSync(gp)) return gp
    const gpk = join(path, 'build.gradle.kts')
    if (existsSync(gpk)) return gpk
    return null
  }
}
