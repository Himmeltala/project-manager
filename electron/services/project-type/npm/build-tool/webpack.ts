/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\build-tool\adapters\webpack.ts
 * @Description: webpack 构建工具适配器
 */
import type { BuildToolAdapter } from './index'

/** 检查依赖中是否包含 webpack */
function hasWebpackDep(pkg: Record<string, any>): boolean {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return !!(deps as Record<string, string>)['webpack']
}

const CONFIG_FILES = [
  'webpack.config.js',
  'webpack.config.ts',
  'webpack.dev.config.js',
  'webpack.prod.config.js',
  'webpack.common.config.js',
  'webpack.config.mjs',
]

export class WebpackAdapter implements BuildToolAdapter {
  readonly name = 'webpack'
  readonly label = 'Webpack'
  readonly configFiles = CONFIG_FILES

  detect(pkg: Record<string, any> | null, rootFiles: string[]): boolean {
    if (pkg && hasWebpackDep(pkg)) return true
    return rootFiles.some((f) => CONFIG_FILES.includes(f))
  }
}
