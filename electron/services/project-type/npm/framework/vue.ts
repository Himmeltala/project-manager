/**
 * Vue CLI 框架检测
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { FrameworkDetector } from './interface'

export class VueFramework implements FrameworkDetector {
  readonly name = 'vue'

  detect(path: string): boolean {
    return existsSync(join(path, 'vue.config.js'))
  }

  getDevScript(): string {
    return 'serve'
  }

  getConfigFiles(): string[] {
    return ['vue.config.js']
  }
}
