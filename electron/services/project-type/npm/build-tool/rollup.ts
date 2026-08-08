/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\build-tool\adapters\rollup.ts
 * @Description: Rollup 构建工具适配器
 */
import type { BuildToolAdapter } from './index'

function hasRollupDep(pkg: Record<string, any>): boolean {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return !!(deps as Record<string, string>)['rollup']
}

const CONFIG_FILES = ['rollup.config.js', 'rollup.config.ts', 'rollup.config.mjs']

export class RollupAdapter implements BuildToolAdapter {
  readonly name = 'rollup'
  readonly label = 'Rollup'
  readonly configFiles = CONFIG_FILES

  detect(pkg: Record<string, any> | null, rootFiles: string[]): boolean {
    if (pkg && hasRollupDep(pkg)) return true
    return rootFiles.some((f) => CONFIG_FILES.includes(f))
  }
}
