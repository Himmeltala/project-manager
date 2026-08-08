/**
 * Gradle 多项目解析
 * 从 settings.gradle 解析子项目，返回可运行的 Spring Boot 模块列表
 */
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import type { RunnableModule } from '@electron/services/project-type/interface'

function hasSpringBootPlugin(projectPath: string): boolean {
  const gp = join(projectPath, 'build.gradle')
  if (existsSync(gp)) {
    try {
      const content = readFileSync(gp, 'utf-8')
      return /org\.springframework\.boot/.test(content) || /id\s*['"]org\.springframework\.boot['"]/.test(content)
    } catch {
      /* ignore */
    }
  }
  const gpk = join(projectPath, 'build.gradle.kts')
  if (existsSync(gpk)) {
    try {
      const content = readFileSync(gpk, 'utf-8')
      return /org\.springframework\.boot/.test(content) || /id\(["']org\.springframework\.boot["']\)/.test(content)
    } catch {
      /* ignore */
    }
  }
  return false
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
