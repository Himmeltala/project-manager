/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \electron\services\project-type\maven\start.ts
 * @Description: Maven 启动命令解析 -- 通过 Java 框架注册表检测运行时框架，派发对应的启动命令
 */
import type { RunnableModule } from '@electron/services/project-type/interface'
import { PROFILE } from '@electron/services/project-type/maven/profile'
import { detectRunnableModules } from '@electron/services/project-type/maven/modules'
import { javaFrameworkRegistry } from '@electron/services/project-type/maven/framework/index'

/**
 * 解析 Maven 项目的启动命令
 * 优先通过 JavaFramework 注册表检测运行时框架（Spring Boot / Tomcat），
 * 匹配成功则使用框架提供的启动命令，否则回退到 profile 默认值
 * @param path 项目根目录
 * @param module 多模块项目中的子模块（可选）
 * @returns Maven 启动命令字符串
 */
export function resolveStartCommand(path?: string, module?: RunnableModule): string {
  if (module) {
    return `mvn spring-boot:run -pl ${module.modulePath}`
  }
  if (!path) return PROFILE.start

  const framework = javaFrameworkRegistry.detect(path)
  if (framework) {
    return framework.getStartCommand(path, module?.modulePath)
  }
  return PROFILE.start
}

export { detectRunnableModules }
