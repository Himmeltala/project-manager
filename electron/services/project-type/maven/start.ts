/**
 * Maven 启动命令解析
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { RunnableModule } from '@electron/services/project-type/interface'
import { PROFILE } from './profile'
import { detectRunnableModules } from './modules'

export function resolveStartCommand(path?: string, module?: RunnableModule): string {
  if (module) {
    return `mvn spring-boot:run -pl ${module.modulePath}`
  }
  if (!path) return PROFILE.start
  return detectMavenPlugin(path) || PROFILE.start
}

function detectMavenPlugin(path: string): string | null {
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
    if (plugins.has('org.springframework.boot:spring-boot-maven-plugin')) return 'mvn spring-boot:run'
    if (/<groupId>org\.springframework\.cloud<\/groupId>/.test(content)) return 'mvn spring-boot:run'
  } catch {
    /* ignore */
  }
  return null
}

export { detectRunnableModules }
