/**
 * Next.js 框架检测
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { FrameworkDetector } from './interface'

export class NextFramework implements FrameworkDetector {
  readonly name = 'next'

  detect(path: string): boolean {
    return existsSync(join(path, 'next.config.js')) || existsSync(join(path, 'next.config.ts'))
  }

  getDevScript(): string {
    return 'dev'
  }

  getConfigFiles(): string[] {
    return ['next.config.js', 'next.config.ts']
  }
}
