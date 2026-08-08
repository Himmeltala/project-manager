/**
 * pnpm 项目类型提供者（复用 npm 生态的 framework/build-tool/proxy/port）
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider } from '@electron/services/project-type/interface'
import type { CommandProfile, ContextMenuItem } from '@/types/project'
import { getTaskList } from '../npm/tasks'

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

  resolveStartCommand(_path?: string, _module?: any): string {
    return 'pnpm run dev'
  }

  getTaskList(path: string) {
    return getTaskList(path)
  }

  getContextMenuItems(): ContextMenuItem[] {
    return []
  }

  getConfigFilePath(path: string): string | null {
    const pkgPath = join(path, 'package.json')
    return existsSync(pkgPath) ? pkgPath : null
  }
}
