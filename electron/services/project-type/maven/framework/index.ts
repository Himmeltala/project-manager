/*
 * @Author: zhengrenfu
 * @Date: 2026-08-10
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \electron\services\project-type\maven\framework\index.ts
 * @Description: Java 框架注册表 -- 按优先级检测项目使用的运行时框架（Spring Boot / Tomcat），派发对应的启动命令和部署方法
 */
import type { JavaFramework } from '@electron/services/project-type/maven/framework/interface'
import { SpringBootFramework } from '@electron/services/project-type/maven/framework/spring-boot'
import { TomcatFramework } from '@electron/services/project-type/maven/framework/tomcat'

/* Java 框架注册表 */
class JavaFrameworkRegistryImpl {
  private frameworks: JavaFramework[] = []

  register(framework: JavaFramework): void {
    this.frameworks.push(framework)
  }

  /**
   * 检测项目路径对应的 Java 运行时框架
   * @param path 项目根目录
   * @returns 第一个匹配的 JavaFramework，无匹配返回 null
   */
  detect(path: string): JavaFramework | null {
    for (const framework of this.frameworks) {
      if (framework.detect(path)) return framework
    }
    return null
  }
}

/* 全局单例（Maven 和 Gradle 共用） */
export const javaFrameworkRegistry = new JavaFrameworkRegistryImpl()

// 按检测精确度注册（Spring Boot 通过 plugin 检测更精确，先匹配）
javaFrameworkRegistry.register(new SpringBootFramework())
javaFrameworkRegistry.register(new TomcatFramework())
