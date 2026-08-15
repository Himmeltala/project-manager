/**
 * pnpm 项目类型提供者（复用 npm 生态的 framework/build-tool/proxy/port）
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider } from '@electron/services/project-type/interface'
import type { CommandProfile, ContextMenuItem } from '@/types/project'
import { getTaskList } from '@electron/services/project-type/npm/tasks'
import { frameworkRegistry } from '@electron/services/project-type/npm/framework/index'

const PROFILE: CommandProfile = {
  start: 'pnpm run dev',
  build: 'pnpm run build',
  install: 'pnpm install',
  runScript: 'pnpm run {script}',
  cleanDirs: ['dist', 'node_modules'],
  buildOutputDir: 'dist',
  taskListFile: 'package.json',
  taskListKey: 'scripts',
}

export class PnpmProvider implements ProjectTypeProvider {
  readonly type = 'pnpm'
  readonly label = 'pnpm'

  detect(path: string): boolean {
    return existsSync(join(path, 'package.json')) && existsSync(join(path, 'pnpm-lock.yaml'))
  }

  getProfile(): CommandProfile {
    return PROFILE
  }

  resolveStartCommand(path?: string, _module?: any): string {
    if (path) {
      const framework = frameworkRegistry.detect(path)
      if (framework) {
        return `pnpm run ${framework.getDevScript()}`
      }
    }
    return 'pnpm run dev'
  }

  getTaskList(path: string) {
    // npm/tasks 返回的任务类型固定为 npm，此处改写为 pnpm，保证前端命令模板前缀正确
    const info = getTaskList(path)
    return info ? { ...info, type: 'pnpm' } : info
  }

  getContextMenuItems(): ContextMenuItem[] {
    return []
  }

  getConfigFilePath(path: string): string | null {
    const pkgPath = join(path, 'package.json')
    return existsSync(pkgPath) ? pkgPath : null
  }
}
