/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\port-config\index.ts
 * @Description: Dev Server 端口配置适配器 — 接口定义、注册表与工厂函数
 */
import { VueCliAdapter } from '@electron/services/project-type/npm/port-config/vue-cli'
import { ViteAdapter } from '@electron/services/project-type/npm/port-config/vite'
import { WebpackAdapter } from '@electron/services/project-type/npm/port-config/webpack'
import { RspackAdapter } from '@electron/services/project-type/npm/port-config/rspack'

/** Dev Server 端口配置适配器接口 */
export interface PortConfigAdapter {
  readonly name: string
  readonly label: string

  /**
   * 检测此适配器是否能处理指定项目
   * @param projectPath 项目根目录路径
   */
  detect(projectPath: string): boolean

  /**
   * 读取当前 dev server 端口号
   * @param projectPath 项目根目录路径
   * @returns 端口号，未配置时返回 null
   */
  readPort(projectPath: string): number | null

  /**
   * 写入新的 dev server 端口号
   * @param projectPath 项目根目录路径
   * @param newPort 新端口号
   * @returns 是否写入成功
   */
  writePort(projectPath: string, newPort: number): boolean
}

/** 端口配置注册表 */
class PortConfigRegistryImpl {
  private adapters: PortConfigAdapter[] = []

  /** 注册适配器，按注册顺序决定检测优先级 */
  register(adapter: PortConfigAdapter): void {
    this.adapters.push(adapter)
  }

  /**
   * 遍历适配器检测，返回首个匹配的适配器实例
   * @param projectPath 项目根目录路径
   * @returns 匹配的适配器实例，无匹配返回 null
   */
  detect(projectPath: string): PortConfigAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.detect(projectPath)) {
        return adapter
      }
    }
    return null
  }
}

/** 全局单例 */
export const portConfigRegistry = new PortConfigRegistryImpl()

// 注册内置适配器（优先级：vue-cli > vite > webpack > rspack）
portConfigRegistry.register(new VueCliAdapter())
portConfigRegistry.register(new ViteAdapter())
portConfigRegistry.register(new WebpackAdapter())
portConfigRegistry.register(new RspackAdapter())

/**
 * 检测项目类型并读取当前端口
 * @param projectPath 项目根目录路径
 * @returns 适配器信息与当前端口号
 */
export function detectAndReadPort(projectPath: string): {
  adapter: string | null
  label: string | null
  port: number | null
} {
  const adapter = portConfigRegistry.detect(projectPath)
  if (!adapter) {
    return { adapter: null, label: null, port: null }
  }
  const port = adapter.readPort(projectPath)
  return { adapter: adapter.name, label: adapter.label, port }
}

/**
 * 写入项目 dev server 端口号
 * @param projectPath 项目根目录路径
 * @param newPort 新端口号
 * @returns 是否写入成功
 */
export function updatePort(projectPath: string, newPort: number): boolean {
  const adapter = portConfigRegistry.detect(projectPath)
  if (!adapter) return false
  return adapter.writePort(projectPath, newPort)
}
