/**
 * npm 项目类型提供者
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider } from '@electron/services/project-type/interface'
import type { CommandProfile, ContextMenuItem } from '@/types/project'
import { PROFILE } from '@electron/services/project-type/npm/profile'
import { resolveStartCommand } from '@electron/services/project-type/npm/start'
import { getTaskList } from '@electron/services/project-type/npm/tasks'

export class NpmProvider implements ProjectTypeProvider {
  readonly type = 'npm'
  readonly label = 'npm'

  detect(path: string): boolean {
    return existsSync(join(path, 'package.json'))
  }

  getProfile(): CommandProfile {
    return PROFILE
  }

  resolveStartCommand(path?: string, _module?: any): string {
    return resolveStartCommand(path)
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
