/*
 * @Author: zhengrenfu
 * @Date: 2026-08-10
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \electron\services\project-type\npm\framework\index.ts
 * @Description: 前端框架注册表 -- 按优先级检测项目使用的脚手架，派发对应的 dev script 和配置文件信息
 */
import type { FrameworkDetector } from '@electron/services/project-type/npm/framework/interface'
import { ViteFramework } from '@electron/services/project-type/npm/framework/vite'
import { NextFramework } from '@electron/services/project-type/npm/framework/next'
import { NuxtFramework } from '@electron/services/project-type/npm/framework/nuxt'
import { VueFramework } from '@electron/services/project-type/npm/framework/vue'
import { ReactFramework } from '@electron/services/project-type/npm/framework/react'

/** 前端框架注册表 */
class FrameworkRegistryImpl {
  private detectors: FrameworkDetector[] = []

  register(detector: FrameworkDetector): void {
    this.detectors.push(detector)
  }

  /**
   * 检测项目路径对应的前端框架
   * @param path 项目根目录
   * @returns 第一个匹配的 FrameworkDetector，无匹配返回 null
   */
  detect(path: string): FrameworkDetector | null {
    for (const detector of this.detectors) {
      if (detector.detect(path)) return detector
    }
    return null
  }
}

/** 全局单例 */
export const frameworkRegistry = new FrameworkRegistryImpl()

// 按检测精确度注册（高优先级在前：有独立配置文件的优先于仅通过依赖检测的）
frameworkRegistry.register(new ViteFramework())
frameworkRegistry.register(new NextFramework())
frameworkRegistry.register(new NuxtFramework())
frameworkRegistry.register(new VueFramework())
frameworkRegistry.register(new ReactFramework())
