/**
 * Gradle Spring Boot 框架
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { JavaFramework } from '@electron/services/project-type/maven/framework/interface'

export class GradleSpringBootFramework implements JavaFramework {
  readonly name = 'spring-boot'

  detect(path: string): boolean {
    const gp = join(path, 'build.gradle')
    if (!existsSync(gp)) return false
    try {
      const content = readFileSync(gp, 'utf-8')
      return /org\.springframework\.boot/.test(content)
    } catch {
      return false
    }
  }

  getStartCommand(_path: string, modulePath?: string): string {
    if (modulePath) return `gradle ${modulePath}:bootRun`
    return 'gradle bootRun'
  }

  getDeployMethod(): 'spring-boot' {
    return 'spring-boot'
  }
}
