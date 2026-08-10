/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \electron\services\project-type\maven\modules.ts
 * @Description: Maven 多模块解析 -- 从 pom.xml 递归解析子模块，通过 Java 框架注册表检测可运行模块
 */
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import type { RunnableModule } from '@electron/services/project-type/interface'
import { javaFrameworkRegistry } from '@electron/services/project-type/maven/framework/index'

/** 通过 Java 框架注册表检测子模块是否为可运行的 Spring Boot 项目 */
function hasSpringBootPlugin(pomPath: string): boolean {
  const dir = dirname(pomPath)
  const framework = javaFrameworkRegistry.detect(dir)
  return framework?.name === 'spring-boot'
}

/** 解析 <modules> 子模块列表 */
function parseModules(pomPath: string): string[] {
  try {
    const content = readFileSync(pomPath, 'utf-8')
    const re = /<module>([^<]+)<\/module>/g
    const modules: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      modules.push(m[1].trim())
    }
    return modules
  } catch {
    return []
  }
}

/** 解析 artifactId（跳过 <parent> 块内的） */
function parseArtifactId(pomPath: string): string {
  try {
    const content = readFileSync(pomPath, 'utf-8')
    // 去掉 <parent>...</parent> 块，避免匹配到父级的 artifactId
    const withoutParent = content.replace(/<parent>[\s\S]*?<\/parent>/g, '')
    const m = /<artifactId>([^<]+)<\/artifactId>/.exec(withoutParent)
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}

/** 检查是否为聚合 POM */
function isAggregatorPom(pomPath: string): boolean {
  try {
    const content = readFileSync(pomPath, 'utf-8')
    return /<packaging>\s*pom\s*<\/packaging>/.test(content) && /<modules>/.test(content)
  } catch {
    return false
  }
}

/**
 * 从根 pom.xml 递归检测可运行的子模块
 * @param rootPath Maven 项目根目录
 * @returns 可运行的 Spring Boot 子模块列表（无则空数组）
 */
export function detectRunnableModules(rootPath: string): RunnableModule[] {
  const rootPom = join(rootPath, 'pom.xml')
  if (!existsSync(rootPom)) return []

  // 单模块项目：根 pom 直接有 spring-boot-maven-plugin
  if (!isAggregatorPom(rootPom)) {
    if (hasSpringBootPlugin(rootPom)) {
      return [
        {
          name: parseArtifactId(rootPom) || 'main',
          modulePath: '.',
          framework: 'spring-boot',
        },
      ]
    }
    return []
  }

  // 多模块项目：递归遍历 <modules>
  const result: RunnableModule[] = []
  const visited = new Set<string>()

  function walk(pomPath: string, modulePath: string) {
    const absPath = join(rootPath, pomPath)
    if (visited.has(absPath)) return
    visited.add(absPath)

    if (!existsSync(absPath)) return

    const children = parseModules(absPath)

    if (hasSpringBootPlugin(absPath)) {
      result.push({
        name: parseArtifactId(absPath),
        modulePath: modulePath || '.',
        framework: 'spring-boot',
      })
    }

    for (const child of children) {
      walk(join(dirname(pomPath), child, 'pom.xml'), join(modulePath, child).replace(/^\.\//, ''))
    }
  }

  const topModules = parseModules(rootPom)
  for (const mod of topModules) {
    walk(join(mod, 'pom.xml'), mod)
  }

  // 去重
  const seen = new Set<string>()
  return result.filter((m) => {
    const key = m.modulePath
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
