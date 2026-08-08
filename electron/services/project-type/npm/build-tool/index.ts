/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\build-tool\index.ts
 * @Description: 构建工具适配器 — 接口定义、注册表、工厂与批量检测
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { VueCliAdapter } from './vue-cli'
import { WebpackAdapter } from './webpack'
import { ViteAdapter } from './vite'
import { RspackAdapter } from './rspack'
import { RollupAdapter } from './rollup'
import { ParcelAdapter } from './parcel'
import type { AppSettings } from '@electron/services/core/settings.service'

/** 构建工具适配器接口 */
export interface BuildToolAdapter {
  readonly name: string
  readonly label: string

  /** 此构建工具对应的配置文件列表（按优先级排序），如 ['vite.config.ts', 'vite.config.js'] */
  readonly configFiles: string[]

  /**
   * 检测是否匹配此构建工具
   * @param pkg 已解析的 package.json 内容，无可解析为 null
   * @param rootFiles 项目根目录中文件名列表
   */
  detect(pkg: Record<string, any> | null, rootFiles: string[]): boolean
}

/** 构建工具注册表 */
class BuildToolRegistryImpl {
  private adapters: BuildToolAdapter[] = []

  /** 注册适配器，按注册顺序决定检测优先级 */
  register(adapter: BuildToolAdapter): void {
    this.adapters.push(adapter)
  }

  getAll(): BuildToolAdapter[] {
    return this.adapters
  }

  /** 遍历适配器检测，返回首个匹配项，无匹配返回 null */
  detect(pkg: Record<string, any> | null, rootFiles: string[]): string | null {
    for (const adapter of this.adapters) {
      if (adapter.detect(pkg, rootFiles)) {
        return adapter.name
      }
    }
    return null
  }
}

/** 全局单例 */
export const buildToolRegistry = new BuildToolRegistryImpl()

// 注册内置适配器（按优先级：vue-cli > webpack > vite > rspack > rollup > parcel）
buildToolRegistry.register(new VueCliAdapter())
buildToolRegistry.register(new WebpackAdapter())
buildToolRegistry.register(new ViteAdapter())
buildToolRegistry.register(new RspackAdapter())
buildToolRegistry.register(new RollupAdapter())
buildToolRegistry.register(new ParcelAdapter())

/**
 * 批量检测多个项目的构建工具
 * @param projectPaths 项目路径数组
 * @returns path -> 构建工具名称（或 null）的映射
 */
export function detectBuildTools(projectPaths: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {}

  for (const projectPath of projectPaths) {
    if (!projectPath) {
      result[projectPath] = null
      continue
    }

    let pkg: Record<string, any> | null = null
    const pkgPath = join(projectPath, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, 'utf-8')
        pkg = JSON.parse(raw)
      } catch {
        pkg = null
      }
    }

    let rootFiles: string[] = []
    try {
      rootFiles = readdirSync(projectPath)
    } catch {
      rootFiles = []
    }

    result[projectPath] = buildToolRegistry.detect(pkg, rootFiles)
  }

  return result
}

/**
 * 检测项目构建工具对应的配置文件路径
 * @param projectPath 项目根目录
 * @param settings 应用设置实例，用于读取自定义配置文件优先级
 * @returns 配置文件绝对路径，不存在返回 null
 */
export function detectBuildToolConfigPath(projectPath: string, settings?: AppSettings): string | null {
  let pkg: Record<string, any> | null = null
  const pkgPath = join(projectPath, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, 'utf-8')
      pkg = JSON.parse(raw)
    } catch {
      pkg = null
    }
  }

  let rootFiles: string[] = []
  try {
    rootFiles = readdirSync(projectPath)
  } catch {
    rootFiles = []
  }

  // 读取用户自定义的配置文件优先级
  let customPriority: Record<string, string[]> = {}
  if (settings) {
    try {
      customPriority = JSON.parse(settings.get('buildtool.config_priority', '{}'))
    } catch {
      customPriority = {}
    }
  }

  for (const adapter of buildToolRegistry.getAll()) {
    if (adapter.detect(pkg, rootFiles)) {
      // 优先使用自定义优先级，如果自定义列表的文件都不存在，则 fallback 使用默认列表
      const customFiles = customPriority[adapter.name]
      const filesToCheck = customFiles ? [...customFiles, ...adapter.configFiles] : adapter.configFiles
      // 去重，保持顺序
      const files = [...new Set(filesToCheck)]
      for (const file of files) {
        const fullPath = join(projectPath, file)
        if (existsSync(fullPath)) return fullPath
      }
      return null
    }
  }

  return null
}
