/**
 * Vite 框架检测
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { FrameworkDetector } from '@electron/services/project-type/npm/framework/interface'

export class ViteFramework implements FrameworkDetector {
  readonly name = 'vite'

  detect(path: string): boolean {
    return existsSync(join(path, 'vite.config.ts')) || existsSync(join(path, 'vite.config.js'))
  }

  getDevScript(): string {
    return 'dev'
  }

  getConfigFiles(): string[] {
    return ['vite.config.ts', 'vite.config.js']
  }
}
