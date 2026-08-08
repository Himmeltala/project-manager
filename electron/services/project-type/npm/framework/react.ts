/**
 * React (CRA) 框架检测
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { FrameworkDetector } from './interface'

export class ReactFramework implements FrameworkDetector {
  readonly name = 'react'

  detect(path: string): boolean {
    const pkgPath = join(path, 'package.json')
    if (!existsSync(pkgPath)) return false
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      return !!(pkg.dependencies?.react || pkg.devDependencies?.react)
    } catch {
      return false
    }
  }

  getDevScript(): string {
    return 'start'
  }

  getConfigFiles(): string[] {
    return []
  }
}
