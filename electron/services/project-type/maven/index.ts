/**
 * Maven 项目类型提供者
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider, RunnableModule } from '@electron/services/project-type/interface'
import type { CommandProfile, ContextMenuItem } from '@/types/project'
import { PROFILE } from '@electron/services/project-type/maven/profile'
import { resolveStartCommand, detectRunnableModules } from '@electron/services/project-type/maven/start'
import { getTaskList } from '@electron/services/project-type/maven/tasks'

export class MavenProvider implements ProjectTypeProvider {
  readonly type = 'maven'
  readonly label = 'Maven'

  detect(path: string): boolean {
    return existsSync(join(path, 'pom.xml'))
  }

  getProfile(): CommandProfile {
    return PROFILE
  }

  resolveStartCommand(path?: string, module?: RunnableModule): string {
    return resolveStartCommand(path, module)
  }

  detectRunnableModules(path: string): RunnableModule[] {
    return detectRunnableModules(path)
  }

  readArtifactName(path: string): string | null {
    const pomPath = join(path, 'pom.xml')
    if (!existsSync(pomPath)) return null
    try {
      const content = readFileSync(pomPath, 'utf-8')
      const finalNameMatch = /<finalName>([^<]+)<\/finalName>/.exec(content)
      if (finalNameMatch) return finalNameMatch[1].trim()
      const artifactMatch = /<artifactId>([^<]+)<\/artifactId>/.exec(content)
      if (artifactMatch) return artifactMatch[1].trim()
    } catch {
      /* ignore */
    }
    return null
  }

  getTaskList(path: string) {
    return getTaskList(path)
  }

  getContextMenuItems(path: string): ContextMenuItem[] {
    let warName: string | null = null
    try {
      warName = this.readArtifactName(path)
    } catch {
      /* ignore */
    }
    return [
      { id: 'java', label: 'Java 版本', value: null },
      { id: 'maven', label: 'Maven 版本', value: null },
      { id: 'tomcat', label: 'Tomcat 版本', value: null },
      { id: 'warName', label: 'WAR 名称', value: warName || '自动检测' },
    ]
  }

  getConfigFilePath(path: string): string | null {
    const pomPath = join(path, 'pom.xml')
    return existsSync(pomPath) ? pomPath : null
  }
}
