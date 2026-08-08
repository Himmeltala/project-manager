/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\port-config\adapters\rspack.ts
 * @Description: Rspack 端口配置适配器 — 读取/写入 rspack.config.js 的 devServer.port
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PortConfigAdapter } from './index'

const CONFIG_FILES = ['rspack.config.js', 'rspack.config.ts']

export class RspackAdapter implements PortConfigAdapter {
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

  readPort(projectPath: string): number | null {
    const configPath = this.getConfigPath(projectPath)
    if (!configPath) return null
    try {
      const content = readFileSync(configPath, 'utf-8')
      const match = content.match(/devServer\s*:\s*\{[\s\S]*?port\s*:\s*(\d+)/)
      return match ? parseInt(match[1], 10) : null
    } catch {
      return null
    }
  }

  writePort(projectPath: string, newPort: number): boolean {
    const portNumber = parseInt(String(newPort), 10)
    if (!Number.isFinite(portNumber) || portNumber < 1 || portNumber > 65535) return false

    const configPath = this.getConfigPath(projectPath)
    if (!configPath) return false
    try {
      let content = readFileSync(configPath, 'utf-8')

      if (/port\s*:\s*\d+/.test(content)) {
        content = content.replace(/(port\s*:\s*)\d+/, `$1${portNumber}`)
      } else if (/devServer\s*:\s*\{/.test(content)) {
        content = content.replace(/(devServer\s*:\s*\{)/, `$1\n  port: ${portNumber},`)
      } else {
        return false
      }

      writeFileSync(configPath, content, 'utf-8')
      return true
    } catch {
      return false
    }
  }
}
