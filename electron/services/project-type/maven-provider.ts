import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider } from './project-type.interface'
import type { CommandProfile, TaskInfo } from '../../../src/types/project'

const PROFILE: CommandProfile = {
  start: 'mvn spring-boot:run',
  build: 'mvn package -DskipTests',
  install: 'mvn install -DskipTests',
  runScript: 'mvn {script}',
  cleanDirs: ['target'],
  buildOutputDir: 'target',
  taskListFile: null,
  taskListKey: null,
  contextMenuSections: ['java_home', 'maven_home', 'tomcat_home', 'war_name'],
}

export class MavenProvider implements ProjectTypeProvider {
  readonly type = 'maven'
  readonly label = 'Maven'

  detect(path: string): boolean {
    return existsSync(join(path, 'pom.xml'))
  }

  getProfile(): CommandProfile {
    return PROFILE
  }

  resolveStartCommand(path?: string): string {
    if (!path) return PROFILE.start
    return this.detectMavenPlugin(path) || PROFILE.start
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

  getTaskList(): TaskInfo | null {
    return {
      type: 'maven',
      tasks: {
        compile: '编译项目',
        test: '运行测试',
        package: '打包',
        install: '安装到本地仓库',
        clean: '清理构建产物',
        'spring-boot:run': '运行 Spring Boot',
        verify: '验证',
        site: '生成站点',
      },
      taskListKey: null,
    }
  }

  private detectMavenPlugin(path: string): string | null {
    const pomPath = join(path, 'pom.xml')
    if (!existsSync(pomPath)) return null

    try {
      const content = readFileSync(pomPath, 'utf-8')
      const pluginRegex = /<plugin>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g
      const plugins = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = pluginRegex.exec(content)) !== null) {
        plugins.add(`${m[1]}:${m[2]}`)
      }

      if (plugins.has('org.springframework.boot:spring-boot-maven-plugin')) {
        return 'mvn spring-boot:run'
      }
      if (/<groupId>org\.springframework\.cloud<\/groupId>/.test(content)) {
        return 'mvn spring-boot:run'
      }
    } catch {
      /* ignore */
    }
    return null
  }
}
