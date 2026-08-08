/**
 * Nuxt.js 框架检测
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { FrameworkDetector } from './interface'

export class NuxtFramework implements FrameworkDetector {
  readonly name = 'nuxt'

  detect(path: string): boolean {
    return existsSync(join(path, 'nuxt.config.js')) || existsSync(join(path, 'nuxt.config.ts'))
  }

  getDevScript(): string {
    return 'dev'
  }

  getConfigFiles(): string[] {
    return ['nuxt.config.js', 'nuxt.config.ts']
  }
}
