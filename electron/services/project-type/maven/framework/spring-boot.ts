/**
 * Spring Boot 框架
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { JavaFramework } from './interface'

export class SpringBootFramework implements JavaFramework {
  readonly name = 'spring-boot'

  detect(path: string): boolean {
    const pomPath = join(path, 'pom.xml')
    if (!existsSync(pomPath)) return false
    try {
      const content = readFileSync(pomPath, 'utf-8')
      return /org\.springframework\.boot:spring-boot-maven-plugin/.test(content)
    } catch {
      return false
    }
  }

  getStartCommand(_path: string, modulePath?: string): string {
    if (modulePath) return `mvn spring-boot:run -pl ${modulePath}`
    return 'mvn spring-boot:run'
  }

  getDeployMethod(): 'spring-boot' {
    return 'spring-boot'
  }
}
