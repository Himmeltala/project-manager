/**
 * Tomcat 部署框架
 * 构建 WAR → 复制到 webapps → 启动 catalina.bat
 */
import { existsSync, copyFileSync } from 'fs'
import { join } from 'path'
import type { JavaFramework } from '@electron/services/project-type/maven/framework/interface'

export class TomcatFramework implements JavaFramework {
  readonly name = 'tomcat'

  detect(path: string): boolean {
    return existsSync(join(path, 'pom.xml'))
  }

  getStartCommand(_path: string, _modulePath?: string): string {
    return 'mvn package -DskipTests'
  }

  getDeployMethod(): 'tomcat' {
    return 'tomcat'
  }

  /* 部署 WAR 到 Tomcat */
  deployWar(projectPath: string, tomcatHome: string, warName: string): boolean {
    const warFile = join(projectPath, 'target', `${warName}.war`)
    if (!existsSync(warFile)) return false
    const tomcatWebapps = join(tomcatHome, 'webapps')
    const destWar = join(tomcatWebapps, `${warName}.war`)
    try {
      copyFileSync(warFile, destWar)
      return true
    } catch {
      return false
    }
  }

  /* 获取 Tomcat 启动命令 */
  getTomcatCommand(tomcatHome: string): string {
    const catalina = join(tomcatHome, 'bin', 'catalina.bat')
    return `"${catalina}" run`
  }
}
