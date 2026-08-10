/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27
 * @FilePath: \electron\services\build-tool\adapters\vue-cli.ts
 * @Description: Vue CLI 构建工具适配器
 */
import type { BuildToolAdapter } from '@electron/services/project-type/npm/build-tool/index'

const CONFIG_FILES = ['vue.config.js']

export class VueCliAdapter implements BuildToolAdapter {
  readonly name = 'vue-cli'
  readonly label = 'Vue CLI'
  readonly configFiles = CONFIG_FILES

  detect(pkg: Record<string, any> | null, rootFiles: string[]): boolean {
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if ((deps as Record<string, string>)['@vue/cli-service']) return true
    }
    return rootFiles.some((f) => CONFIG_FILES.includes(f))
  }
}
