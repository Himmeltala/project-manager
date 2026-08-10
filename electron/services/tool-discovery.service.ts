/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-29
 * @FilePath: \electron\services\tool-discovery.service.ts
 * @Description: 工具发现与配置文件检测（项目类型检测请直接使用 projectTypeRegistry）
 */
import { projectTypeRegistry } from '@electron/services/project-type/registry'
import { detectBuildToolConfigPath } from '@electron/services/project-type/npm/build-tool/index'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '@electron/services/core/settings.service'

export type { ProjectTypeProvider } from '@electron/services/project-type/interface'

/** 标记文件列表（用于扫描发现） */
export const MARKER_FILES: Set<string> = new Set(['package.json', 'pom.xml'])

/**
 * 检测项目的主配置文件路径
 * 优先级：构建工具配置文件（vite.config.ts/vue.config.js 等）> 脚手架主文件（pom.xml/package.json 等）
 * @param projectPath 项目根目录
 * @param settings 应用设置实例，用于读取自定义配置文件优先级
 * @returns 配置文件绝对路径，不存在返回 null
 */
export function detectConfigFilePath(projectPath: string, settings?: AppSettings): string | null {
  const buildToolPath = detectBuildToolConfigPath(projectPath, settings)
  if (buildToolPath) return buildToolPath

  const provider = projectTypeRegistry.detect(projectPath)
  if (provider.getConfigFilePath) {
    return provider.getConfigFilePath(projectPath)
  }
  return null
}

// #region 工具发现（不属于项目类型，但用了同样的目录结构）

export function discoverJavaHomes(): { label: string; path: string }[] {
  const searchRoots = [
    'C:\\Program Files\\Java',
    'C:\\Program Files (x86)\\Java',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\OpenJDK',
    'C:\\Program Files\\Microsoft',
  ]

  const found: { label: string; path: string }[] = []
  for (const root of searchRoots) {
    if (!existsSync(root)) continue
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        const fullPath = join(root, entry.name)
        if (!entry.isDirectory()) continue
        const nameLower = entry.name.toLowerCase()
        if (!nameLower.includes('jdk') && !nameLower.includes('openjdk')) continue
        const javaExe = join(fullPath, 'bin', 'java.exe')
        if (existsSync(javaExe)) {
          found.push({ label: makeJavaLabel(entry.name), path: fullPath })
        }
      }
    } catch {
      /* ignore */
    }
  }

  found.sort((a, b) => parseJavaVersion(b.label) - parseJavaVersion(a.label))
  return found
}

function parseJavaVersion(label: string): number {
  const nums = label.match(/\d+/g)
  return nums ? parseInt(nums[0], 10) : 0
}

function makeJavaLabel(dirname: string): string {
  const m = dirname.match(/jdk[-\s]*(\d+)/i)
  if (m) {
    let ver = parseInt(m[1], 10)
    if (ver === 1) {
      const m2 = dirname.match(/jdk1\.(\d+)/i)
      if (m2) ver = parseInt(m2[1], 10)
    }
    return `JDK ${ver}`
  }
  return dirname
}

export function discoverMavenHomes(): { label: string; path: string }[] {
  const searchRoots = [
    'E:\\Maven',
    'C:\\Program Files\\Apache\\Maven',
    'C:\\Program Files (x86)\\Apache\\Maven',
    'D:\\Maven',
  ]
  for (const drive of ['C', 'D', 'E', 'F', 'G']) {
    const root = `${drive}:\\Maven`
    if (existsSync(root) && !searchRoots.includes(root)) {
      searchRoots.push(root)
    }
  }

  const found: { label: string; path: string }[] = []
  for (const root of searchRoots) {
    if (!existsSync(root)) continue
    try {
      for (const entry of readdirSafe(root)) {
        const fullPath = join(root, entry.name)
        if (!entry.isDirectory()) continue
        const mvnCmd = join(fullPath, 'bin', 'mvn.cmd')
        if (existsSync(mvnCmd)) {
          found.push({ label: entry.name, path: fullPath })
        }
      }
    } catch {
      /* ignore */
    }
  }
  found.sort((a, b) => b.label.localeCompare(a.label))
  return found
}

export function discoverTomcatHomes(): { label: string; path: string }[] {
  const found: { label: string; path: string }[] = []
  for (const drive of ['C', 'D', 'E', 'F', 'G']) {
    for (const root of [`${drive}:\\`, `${drive}:\\Tomcat`, `${drive}:\\programFiles`]) {
      if (!existsSync(root)) continue
      try {
        for (const entry of readdirSafe(root)) {
          const fullPath = join(root, entry.name)
          if (!entry.isDirectory()) continue
          const nameLower = entry.name.toLowerCase()
          if (nameLower.startsWith('apache-tomcat') || nameLower.startsWith('tomcat')) {
            const catalina = join(fullPath, 'bin', 'catalina.bat')
            if (existsSync(catalina)) {
              found.push({ label: entry.name, path: fullPath })
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  const seen = new Set<string>()
  const unique = found.filter((f) => {
    const key = join(f.path).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  unique.sort((a, b) => {
    const va = parseTomcatVersion(a.label)
    const vb = parseTomcatVersion(b.label)
    for (let i = 0; i < Math.min(va.length, vb.length); i++) {
      if (va[i] !== vb[i]) return vb[i] - va[i]
    }
    return vb.length - va.length
  })
  return unique
}

function parseTomcatVersion(label: string): number[] {
  const nums = label.match(/\d+/g)
  return nums ? nums.map(Number) : [0]
}

export function discoverGradleHomes(): { label: string; path: string }[] {
  const found: { label: string; path: string }[] = []
  const gradleHome = process.env.GRADLE_HOME
  if (gradleHome) {
    const gradleExe = join(gradleHome, 'bin', 'gradle.bat')
    if (existsSync(gradleExe)) found.push({ label: `GRADLE_HOME: ${gradleHome}`, path: gradleHome })
  }
  for (const drive of ['C', 'D', 'E']) {
    for (const root of [`${drive}:\\\\`, `${drive}:\\\\Gradle`, `${drive}:\\\\Program Files`]) {
      if (!existsSync(root)) continue
      try {
        for (const entry of readdirSafe(root)) {
          const fullPath = join(root, entry.name)
          if (!entry.isDirectory()) continue
          const nameLower = entry.name.toLowerCase()
          if (nameLower.includes('gradle') && !nameLower.includes('gradle-caches')) {
            const gradleExe = join(fullPath, 'bin', 'gradle.bat')
            if (existsSync(gradleExe)) found.push({ label: entry.name, path: fullPath })
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  return found
}

function readdirSafe(dir: string): { name: string; isDirectory: () => boolean }[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

// #endregion
