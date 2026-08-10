/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\build-tool\adapters\parcel.ts
 * @Description: Parcel 构建工具适配器
 */
import type { BuildToolAdapter } from '@electron/services/project-type/npm/build-tool/index'

function hasParcelDep(pkg: Record<string, any>): boolean {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const d = deps as Record<string, string>
  return !!d['@parcel/core'] || !!d['@parcel/config-default'] || !!d['parcel-bundler']
}

const CONFIG_FILES = ['.parcelrc']

export class ParcelAdapter implements BuildToolAdapter {
  readonly name = 'parcel'
  readonly label = 'Parcel'
  readonly configFiles = CONFIG_FILES

  detect(pkg: Record<string, any> | null, rootFiles: string[]): boolean {
    if (pkg && hasParcelDep(pkg)) return true
    return rootFiles.some((f) => CONFIG_FILES.includes(f))
  }
}
