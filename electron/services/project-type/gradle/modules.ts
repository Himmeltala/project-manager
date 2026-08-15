/**
 * Gradle 多项目解析
 * 从 settings.gradle 解析子项目，返回可运行的 Spring Boot 模块列表
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { RunnableModule } from '@electron/services/project-type/interface'
import { javaFrameworkRegistry } from '@electron/services/project-type/maven/framework/index'

/* 通过 Java 框架注册表检测子项目是否为 Spring Boot 项目 */
function hasSpringBootPlugin(projectPath: string): boolean {
  const framework = javaFrameworkRegistry.detect(projectPath)
  return framework?.name === 'spring-boot'
}

function parseSubprojects(settingsPath: string): string[] {
  try {
    const content = readFileSync(settingsPath, 'utf-8')
    const re = /['"](:[a-zA-Z0-9_-]+)['"]|include\s*['"]([^'"]+)['"]/g
    const subs: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const name = (m[2] || m[1]?.replace(':', ''))?.trim()
      if (name) subs.push(name)
    }
    return subs
  } catch {
    return []
  }
}

export function detectRunnableModules(rootPath: string): RunnableModule[] {
  const settingsPath = join(rootPath, 'settings.gradle')
  if (!existsSync(settingsPath)) {
    // 单项目
    if (hasSpringBootPlugin(rootPath)) {
      return [{ name: 'root', modulePath: ':root', framework: 'spring-boot' }]
    }
    return []
  }

  const subs = parseSubprojects(settingsPath)
  const result: RunnableModule[] = []

  for (const sub of subs) {
    const subPath = join(rootPath, sub)
    if (hasSpringBootPlugin(subPath)) {
      result.push({ name: sub, modulePath: `:${sub}`, framework: 'spring-boot' })
    }
  }

  return result
}
