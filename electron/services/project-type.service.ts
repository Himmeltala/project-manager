/**
 * 项目类型服务 -- 兼容层，底层使用 ProjectTypeProvider 注册表
 * 新代码建议直接使用 projectTypeRegistry
 */
import type { CommandProfile, TaskInfo } from '../../src/types/project'
import { projectTypeRegistry } from './project-type/index'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

export type { ProjectTypeProvider } from './project-type/project-type.interface'

/** 标记文件列表（用于扫描发现） */
export const MARKER_FILES: Set<string> = new Set(['package.json', 'pom.xml'])

/** 检测项目类型 */
export function detectType(projectPath: string): string {
  const provider = projectTypeRegistry.detect(projectPath)
  return provider.type
}

/** 获取命令模板 */
export function getProfile(projectType: string): CommandProfile {
  const provider = projectTypeRegistry.get(projectType)
  return provider ? provider.getProfile() : projectTypeRegistry.get('npm')!.getProfile()
}

/** 解析启动命令 */
export function resolveStartCommand(projectType: string, projectPath?: string): string {
  const provider = projectTypeRegistry.get(projectType)
  return provider ? provider.resolveStartCommand(projectPath) : projectTypeRegistry.get('npm')!.resolveStartCommand()
}

/** 读取产物名称 */
export function readPomFinalName(projectPath: string): string | null {
  const provider = projectTypeRegistry.detect(projectPath)
  return provider.readArtifactName ? provider.readArtifactName(projectPath) : null
}

// 以下为辅助发现工具（不属于项目类型，但用了同样的目录结构）

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

  unique.sort((a, b) => parseTomcatVersion(b.label) - parseTomcatVersion(a.label))
  return unique
}

function parseTomcatVersion(label: string): number[] {
  const nums = label.match(/\d+/g)
  return nums ? nums.map(Number) : [0]
}

function readdirSafe(dir: string): { name: string; isDirectory: () => boolean }[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}
