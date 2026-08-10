/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \electron\services\project-type\npm\start.ts
 * @Description: npm 启动命令解析 -- 通过框架检测派发脚手架对应的 dev script
 */
import { frameworkRegistry } from '@electron/services/project-type/npm/framework/index'

/**
 * 解析项目的启动命令
 * 优先通过 framework 注册表检测脚手架类型，匹配成功则使用对应的 dev script
 * @param path 项目根目录
 * @returns npm/pnpm dev 启动命令字符串
 */
export function resolveStartCommand(path?: string): string {
  if (path) {
    const framework = frameworkRegistry.detect(path)
    if (framework) {
      return `npm run ${framework.getDevScript()}`
    }
  }
  return 'npm run dev'
}
