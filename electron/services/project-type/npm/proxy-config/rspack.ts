/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\proxy-config\adapters\rspack.ts
 * @Description: Rspack 代理配置适配器 — 检测 rspack.config.js/ts 并读取 proxy 配置
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProxyConfigAdapter } from './index'
import { parseProxyConfig } from './parser'

const CONFIG_FILES = ['rspack.config.js', 'rspack.config.ts']

export class RspackAdapter implements ProxyConfigAdapter {
  readonly name = 'rspack'
  readonly label = 'Rspack'

  detect(projectPath: string): boolean {
    return CONFIG_FILES.some((f) => existsSync(join(projectPath, f)))
  }

  private getConfigPath(projectPath: string): string | null {
    for (const f of CONFIG_FILES) {
      const full = join(projectPath, f)
      if (existsSync(full)) return full
    }
    return null
  }

  readProxies(projectPath: string): {
    configPath: string
    proxies: ReturnType<typeof parseProxyConfig>['proxies']
    envVars?: Record<string, string>
  } | null {
    const configPath = this.getConfigPath(projectPath)
    if (!configPath) return null
    try {
      const content = readFileSync(configPath, 'utf-8')
      if (!content.includes('proxy')) return null
      return {
        configPath,
        ...parseProxyConfig(configPath),
      }
    } catch {
      return null
    }
  }
}
