/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\proxy-config\adapters\vue-cli.ts
 * @Description: Vue CLI 代理配置适配器 — 检测 vue.config.js 并读取 proxy 配置
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProxyConfigAdapter } from './index'
import { parseProxyConfig } from './parser'

const CONFIG_FILE = 'vue.config.js'

export class VueCliAdapter implements ProxyConfigAdapter {
  readonly name = 'vue-cli'
  readonly label = 'Vue CLI'

  detect(projectPath: string): boolean {
    return existsSync(join(projectPath, CONFIG_FILE))
  }

  readProxies(projectPath: string): {
    configPath: string
    proxies: ReturnType<typeof parseProxyConfig>['proxies']
    envVars?: Record<string, string>
  } | null {
    const configPath = join(projectPath, CONFIG_FILE)
    if (!existsSync(configPath)) return null
    try {
      // 检查文件是否有 proxy 配置
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
