/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\build-tool\adapters\vite.ts
 * @Description: Vite 构建工具适配器
 */
import type { BuildToolAdapter } from '@electron/services/project-type/npm/build-tool/index'

function hasViteDep(pkg: Record<string, any>): boolean {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return !!(deps as Record<string, string>)['vite']
}

const CONFIG_FILES = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts']

export class ViteAdapter implements BuildToolAdapter {
  readonly name = 'vite'
  readonly label = 'Vite'
  readonly configFiles = CONFIG_FILES

  detect(pkg: Record<string, any> | null, rootFiles: string[]): boolean {
    if (pkg && hasViteDep(pkg)) return true
    return rootFiles.some((f) => CONFIG_FILES.includes(f))
  }
}
