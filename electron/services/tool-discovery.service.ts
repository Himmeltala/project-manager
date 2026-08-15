/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \electron\services\tool-discovery.service.ts
 * @Description: 工具发现与配置文件检测（项目类型检测请直接使用 projectTypeRegistry）
 */
import { projectTypeRegistry } from '@electron/services/project-type/registry'
import { detectBuildToolConfigPath } from '@electron/services/project-type/npm/build-tool/index'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '@electron/services/core/settings.service'

export type { ProjectTypeProvider } from '@electron/services/project-type/interface'

/* 标记文件列表（用于扫描发现） */
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

// #region 工具发现注册表（工具入口项与提供者）

/* 发现的工具入口 */
export interface ToolEntry {
  label: string
  path: string
}

/* 工具提供者，声明工具发现的全部规则 */
interface ToolProvider {
  /* 工具标识，如 'java' / 'maven' */
  name: string
  /* 环境变量名，设置且含标记二进制时直接命中 */
  envVar?: string
  /* 标记二进制相对路径，如 'bin\\java.exe' */
  markerExe: string
  /* 候选搜索根目录 */
  roots: string[]
  /* 盘符根目录模板，{drive} 会被盘符替换 */
  driveRoots?: string[]
  /* 目录名是否匹配该工具 */
  matchesDir(dirname: string): boolean
  /* 生成显示标签 */
  makeLabel(dirname: string): string
  /* 排序比较 */
  compare(a: ToolEntry, b: ToolEntry): number
}

/* 工具注册表 */
class ToolRegistry {
  private providers = new Map<string, ToolProvider>()

  register(provider: ToolProvider): void {
    this.providers.set(provider.name, provider)
  }

  /* 按工具发现入口 */
  discover(name: string): ToolEntry[] {
    const provider = this.providers.get(name)
    return provider ? discoverTools(provider) : []
  }
}

/* 通用发现逻辑：环境变量命中 + 候选根目录扫描标记二进制 */
function discoverTools(provider: ToolProvider): ToolEntry[] {
  const found: ToolEntry[] = []
  const seen = new Set<string>()

  // 环境变量命中
  if (provider.envVar) {
    const envPath = process.env[provider.envVar]
    if (envPath && existsSync(join(envPath, provider.markerExe))) {
      seen.add(envPath.toLowerCase())
      found.push({ label: `${provider.envVar}: ${envPath}`, path: envPath })
    }
  }

  // 候选根目录 + 盘符根目录扫描
  const roots = [...provider.roots]
  for (const template of provider.driveRoots ?? []) {
    for (const drive of ['C', 'D', 'E', 'F', 'G']) {
      const root = template.replace('{drive}', drive)
      if (existsSync(root) && !roots.includes(root)) {
        roots.push(root)
      }
    }
  }

  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const entry of readdirSafe(root)) {
      const fullPath = join(root, entry.name)
      if (!entry.isDirectory()) continue
      if (!provider.matchesDir(entry.name)) continue
      if (!existsSync(join(fullPath, provider.markerExe))) continue
      const key = fullPath.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ label: provider.makeLabel(entry.name), path: fullPath })
    }
  }

  found.sort(provider.compare)
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

// #region 内置工具提供者

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

function parseTomcatVersion(label: string): number[] {
  const nums = label.match(/\d+/g)
  return nums ? nums.map(Number) : [0]
}

function compareTomcat(a: ToolEntry, b: ToolEntry): number {
  const va = parseTomcatVersion(a.label)
  const vb = parseTomcatVersion(b.label)
  for (let i = 0; i < Math.min(va.length, vb.length); i++) {
    if (va[i] !== vb[i]) return vb[i] - va[i]
  }
  return vb.length - va.length
}

const javaProvider: ToolProvider = {
  name: 'java',
  markerExe: join('bin', 'java.exe'),
  roots: [
    'C:\\Program Files\\Java',
    'C:\\Program Files (x86)\\Java',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\OpenJDK',
    'C:\\Program Files\\Microsoft',
  ],
  matchesDir: (dirname) => {
    const name = dirname.toLowerCase()
    return name.includes('jdk') || name.includes('openjdk')
  },
  makeLabel: makeJavaLabel,
  compare: (a, b) => parseJavaVersion(b.label) - parseJavaVersion(a.label),
}

const mavenProvider: ToolProvider = {
  name: 'maven',
  markerExe: join('bin', 'mvn.cmd'),
  roots: ['E:\\Maven', 'C:\\Program Files\\Apache\\Maven', 'C:\\Program Files (x86)\\Apache\\Maven', 'D:\\Maven'],
  driveRoots: ['{drive}:\\Maven'],
  matchesDir: () => true,
  makeLabel: (dirname) => dirname,
  compare: (a, b) => b.label.localeCompare(a.label),
}

const tomcatProvider: ToolProvider = {
  name: 'tomcat',
  markerExe: join('bin', 'catalina.bat'),
  roots: [],
  driveRoots: ['{drive}:\\', '{drive}:\\Tomcat', '{drive}:\\programFiles'],
  matchesDir: (dirname) => {
    const name = dirname.toLowerCase()
    return name.startsWith('apache-tomcat') || name.startsWith('tomcat')
  },
  makeLabel: (dirname) => dirname,
  compare: compareTomcat,
}

const gradleProvider: ToolProvider = {
  name: 'gradle',
  envVar: 'GRADLE_HOME',
  markerExe: join('bin', 'gradle.bat'),
  roots: [],
  driveRoots: ['{drive}:\\', '{drive}:\\Gradle', '{drive}:\\Program Files'],
  matchesDir: (dirname) => {
    const name = dirname.toLowerCase()
    return name.includes('gradle') && !name.includes('gradle-caches')
  },
  makeLabel: (dirname) => dirname,
  compare: () => 0,
}

const toolRegistry = new ToolRegistry()
toolRegistry.register(javaProvider)
toolRegistry.register(mavenProvider)
toolRegistry.register(tomcatProvider)
toolRegistry.register(gradleProvider)

// #endregion

/** 发现已安装的 JDK */
export function discoverJavaHomes(): ToolEntry[] {
  return toolRegistry.discover('java')
}

/** 发现已安装的 Maven */
export function discoverMavenHomes(): ToolEntry[] {
  return toolRegistry.discover('maven')
}

/** 发现已安装的 Tomcat */
export function discoverTomcatHomes(): ToolEntry[] {
  return toolRegistry.discover('tomcat')
}

/** 发现已安装的 Gradle */
export function discoverGradleHomes(): ToolEntry[] {
  return toolRegistry.discover('gradle')
}
