/**
 * Maven 项目类型提供者
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider, RunnableModule } from '@electron/services/project-type/interface'
import type { CommandProfile, ProjectMenu, Project } from '@/types/project'
import { homePathValue } from '@electron/services/project-type/value'
import { PROFILE } from '@electron/services/project-type/maven/profile'
import { resolveStartCommand, detectRunnableModules } from '@electron/services/project-type/maven/start'
import { getTaskList } from '@electron/services/project-type/maven/tasks'

export class MavenProvider implements ProjectTypeProvider {
  readonly type = 'maven'
  readonly label = 'Maven'
  readonly startMode = 'module-select'
  readonly buildStartCommandTemplate = 'mvn spring-boot:run -pl {module}'
  readonly modulePathSeparator = ''
  readonly buildCommands = ['mvn package -DskipTests', 'mvn package', 'mvn clean package', 'mvn install -DskipTests']
  readonly installCommands = ['mvn install', 'mvn clean install']
  readonly installFlags = [
    { value: '-DskipTests', label: '-DskipTests', default: true },
    { value: '-U', label: '-U (强制更新快照)' },
  ]
  readonly installExtraPlaceholder = '如: -Dmaven.test.skip=true -o'
  readonly taskCommandTemplate = 'mvn {script}'
  readonly defaultBuildCommand = 'mvn package -DskipTests'
  readonly supportsBuildToolDetection = false
  readonly nestedBuildOutputDirs = ['target']

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
        { id: 'maven', label: 'Maven 版本' },
        { id: 'tomcat', label: 'Tomcat 版本' },
        { id: 'warName', label: 'WAR 名称' },
      ],
    }
  }

  resolveMenuValue(id: string, proj: Project): string | null {
    // WAR 名称由 pom.xml 检测，其余取项目配置的主目录路径末段
    if (id === 'warName') return this.readArtifactName(proj.path) || '自动检测'
    const homes: Record<string, string> = { java: proj.javaHome, maven: proj.mavenHome, tomcat: proj.tomcatHome }
    return id in homes ? homePathValue(homes[id]) : null
  }

  getConfigFilePath(path: string): string | null {
    const pomPath = join(path, 'pom.xml')
    return existsSync(pomPath) ? pomPath : null
  }
}
