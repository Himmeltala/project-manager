/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\build-tool\adapters\rspack.ts
 * @Description: Rspack 构建工具适配器（字节跳动，Rust 重写 webpack）
 */
import type { BuildToolAdapter } from './index'

function hasRspackDep(pkg: Record<string, any>): boolean {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return !!(deps as Record<string, string>)['@rspack/core']
}

const CONFIG_FILES = ['rspack.config.js', 'rspack.config.ts']

export class RspackAdapter implements BuildToolAdapter {
  readonly name = 'rspack'
  readonly label = 'Rspack'
  readonly configFiles = CONFIG_FILES

  detect(pkg: Record<string, any> | null, rootFiles: string[]): boolean {
    if (pkg && hasRspackDep(pkg)) return true
    return rootFiles.some((f) => CONFIG_FILES.includes(f))
  }
}
