/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \electron\services\proxy-config\index.ts
 * @Description: Proxy 代理配置适配器 — 接口定义、注册表与工厂函数
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { VueCliAdapter } from './vue-cli'
import { ViteAdapter } from './vite'
import { WebpackAdapter } from './webpack'
import { RspackAdapter } from './rspack'
import { parseProxyConfig, parseProxyLines, applySingleChange } from './parser'
import type { ProxyEntry } from './parser'

/** Proxy 代理配置适配器接口 */
export interface ProxyConfigAdapter {
  readonly name: string
  readonly label: string

  /**
   * 检测此适配器是否能处理指定项目
   * @param projectPath 项目根目录路径
   */
  detect(projectPath: string): boolean

  /**
   * 读取代理配置
   * @param projectPath 项目根目录路径
   * @returns 配置文件路径和代理条目列表，未找到时返回 null
   */
  readProxies(projectPath: string): {
    configPath: string
    proxies: ProxyEntry[]
    envVars?: Record<string, string>
  } | null
}

/** 代理配置注册表 */
class ProxyConfigRegistryImpl {
  private adapters: ProxyConfigAdapter[] = []

  /** 注册适配器，按注册顺序决定检测优先级 */
  register(adapter: ProxyConfigAdapter): void {
    this.adapters.push(adapter)
  }

  /**
   * 遍历适配器检测，返回首个匹配的适配器实例
   * @param projectPath 项目根目录路径
   * @returns 匹配的适配器实例，无匹配返回 null
   */
  detect(projectPath: string): ProxyConfigAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.detect(projectPath)) {
        return adapter
      }
    }
    return null
  }
}

/** 全局单例 */
export const proxyConfigRegistry = new ProxyConfigRegistryImpl()

// 注册内置适配器（优先级：vue-cli > vite > webpack > rspack）
proxyConfigRegistry.register(new VueCliAdapter())
proxyConfigRegistry.register(new ViteAdapter())
proxyConfigRegistry.register(new WebpackAdapter())
proxyConfigRegistry.register(new RspackAdapter())

/** .env 文件查找路径 */
const ENV_FILES = ['.env.development', '.env']

function findEnvVars(projectPath: string): Record<string, string> | null {
  for (const name of ENV_FILES) {
    const full = join(projectPath, name)
    if (existsSync(full)) {
      try {
        const content = readFileSync(full, 'utf-8')
        const vars: Record<string, string> = {}
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx === -1) continue
          const key = trimmed.slice(0, eqIdx).trim()
          let val = trimmed.slice(eqIdx + 1).trim()
          if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
            val = val.slice(1, -1)
          }
          if ((key.startsWith('VITE_') || key.startsWith('VUE_APP_')) && /^https?:\/\//.test(val)) {
            vars[key] = val
          }
        }
        if (Object.keys(vars).length > 0) return vars
      } catch {
        // 静默失败
      }
    }
  }
  return null
}

/**
 * 检测并读取项目代理配置
 * @param projectPath 项目根目录路径
 * @returns 适配器信息、配置文件路径和代理条目
 */
export function detectAndReadProxies(projectPath: string): {
  adapter: string | null
  label: string | null
  configPath: string | null
  proxies: ProxyEntry[]
  envVars?: Record<string, string>
} {
  const adapter = proxyConfigRegistry.detect(projectPath)
  if (!adapter) {
    return { adapter: null, label: null, configPath: null, proxies: [] }
  }

  const result = adapter.readProxies(projectPath)
  if (!result) {
    return { adapter: adapter.name, label: adapter.label, configPath: null, proxies: [] }
  }

  // 扫描 .env 文件
  const envVars = findEnvVars(projectPath)

  return {
    adapter: adapter.name,
    label: adapter.label,
    configPath: result.configPath,
    proxies: result.proxies,
    envVars: envVars || undefined,
  }
}

/**
 * 批量修改项目的代理目标地址
 * @param projectPath 项目根目录路径
 * @param changes 代理路径 -> 新 URL 的映射
 * @returns 失败的代理路径列表和更新后的代理条目
 */
export function updateProxyTargets(
  projectPath: string,
  changes: Record<string, string>,
): { failed: string[]; proxies: ProxyEntry[] } {
  const adapter = proxyConfigRegistry.detect(projectPath)
  if (!adapter) {
    return { failed: Object.keys(changes), proxies: [] }
  }

  const result = adapter.readProxies(projectPath)
  if (!result) {
    return { failed: Object.keys(changes), proxies: [] }
  }

  // 每次修改后重算行号，防止 splice 插入导致后续定位偏移
  let { lines, proxies } = parseProxyConfig(result.configPath)
  const failed: string[] = []

  for (const [proxyPath, newUrl] of Object.entries(changes)) {
    if (applySingleChange(lines, proxies, proxyPath, newUrl)) {
      proxies = parseProxyLines(lines)
    } else {
      failed.push(proxyPath)
    }
  }

  writeFileSync(result.configPath, lines.join('\n'), 'utf-8')
  const updated = parseProxyConfig(result.configPath)
  return { failed, proxies: updated.proxies }
}
