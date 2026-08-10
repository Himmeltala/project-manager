/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\port-config\adapters\vue-cli.ts
 * @Description: Vue CLI 端口配置适配器 — 读取/写入 vue.config.js 的 devServer.port
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PortConfigAdapter } from '@electron/services/project-type/npm/port-config/index'

const CONFIG_FILE = 'vue.config.js'

export class VueCliAdapter implements PortConfigAdapter {
  readonly name = 'vue-cli'
  readonly label = 'Vue CLI'

  detect(projectPath: string): boolean {
    return existsSync(join(projectPath, CONFIG_FILE))
  }

  readPort(projectPath: string): number | null {
    const filePath = join(projectPath, CONFIG_FILE)
    try {
      const content = readFileSync(filePath, 'utf-8')
      const match = content.match(/devServer\s*:\s*\{[\s\S]*?port\s*:\s*(\d+)/)
      return match ? parseInt(match[1], 10) : null
    } catch {
      return null
    }
  }

  writePort(projectPath: string, newPort: number): boolean {
    const portNumber = parseInt(String(newPort), 10)
    if (!Number.isFinite(portNumber) || portNumber < 1 || portNumber > 65535) return false

    const filePath = join(projectPath, CONFIG_FILE)
    try {
      let content = readFileSync(filePath, 'utf-8')

      if (/port\s*:\s*\d+/.test(content)) {
        content = content.replace(/(port\s*:\s*)\d+/, `$1${portNumber}`)
      } else if (/devServer\s*:\s*\{/.test(content)) {
        content = content.replace(/(devServer\s*:\s*\{)/, `$1\n  port: ${portNumber},`)
      } else {
        return false
      }

      writeFileSync(filePath, content, 'utf-8')
      return true
    } catch {
      return false
    }
  }
}
