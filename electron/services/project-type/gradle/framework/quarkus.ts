/**
 * Gradle Quarkus 框架
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { JavaFramework } from '@electron/services/project-type/maven/framework/interface'

export class QuarkusFramework implements JavaFramework {
  readonly name = 'quarkus'

  detect(path: string): boolean {
    const gp = join(path, 'build.gradle')
    if (!existsSync(gp)) return false
    try {
      const content = readFileSync(gp, 'utf-8')
      return /io\.quarkus/.test(content)
    } catch {
      return false
    }
  }

  getStartCommand(_path: string, modulePath?: string): string {
    if (modulePath) return `gradle ${modulePath}:quarkusDev`
    return 'gradle quarkusDev'
  }

  getDeployMethod(): null {
    return null
  }
}
