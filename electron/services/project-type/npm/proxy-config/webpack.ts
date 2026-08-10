/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\proxy-config\adapters\webpack.ts
 * @Description: Webpack 代理配置适配器 — 检测 webpack.dev.config.js 并读取 proxy 配置
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProxyConfigAdapter } from '@electron/services/project-type/npm/proxy-config/index'
import { parseProxyConfig } from '@electron/services/project-type/npm/proxy-config/parser'

const CONFIG_FILES = ['webpack.dev.config.js', 'build/webpack.dev.config.js', 'webpack.config.js', 'webpack.config.ts']

export class WebpackAdapter implements ProxyConfigAdapter {
  readonly name = 'webpack'
  readonly label = 'Webpack'

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
