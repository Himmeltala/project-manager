/**
 * Gradle 项目类型提供者
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider, RunnableModule } from '@electron/services/project-type/interface'
import type { CommandProfile, ProjectMenu, Project } from '@/types/project'
import { homePathValue } from '@electron/services/project-type/value'
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
  readonly startMode = 'module-select'
  readonly buildStartCommandTemplate = 'gradle :{module}:bootRun'
  readonly modulePathSeparator = ':'
  readonly buildCommands = ['gradle build -x test', 'gradle build', 'gradle clean build']
  readonly installCommands = ['gradle build', 'gradle clean build']
  readonly installFlags = [
    { value: '-x test', label: '-x test', default: true },
    { value: '--refresh-dependencies', label: '--refresh-dependencies (强制刷新依赖)' },
  ]
  readonly installExtraPlaceholder = '如: -Dmaven.test.skip=true -o'
  readonly taskCommandTemplate = 'gradle {script}'
  readonly defaultBuildCommand = 'gradle build -x test'
  readonly supportsBuildToolDetection = false
  readonly nestedBuildOutputDirs = ['build']

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

  getMenu(): ProjectMenu {
    return {
      buildGroup: {
        key: 'build',
        label: '构建',
        items: [
          { id: 'install', label: '安装依赖' },
          { id: 'clean', label: '清理构建产物' },
        ],
      },
      typeActions: [
        { id: 'java', label: 'Java 版本' },
        { id: 'gradle', label: 'Gradle 版本' },
      ],
    }
  }

  resolveMenuValue(id: string, proj: Project): string | null {
    const homes: Record<string, string> = { java: proj.javaHome, gradle: proj.gradleHome }
    return id in homes ? homePathValue(homes[id]) : null
  }

  getConfigFilePath(path: string): string | null {
    const gp = join(path, 'build.gradle')
    if (existsSync(gp)) return gp
    const gpk = join(path, 'build.gradle.kts')
    if (existsSync(gpk)) return gpk
    return null
  }
}
