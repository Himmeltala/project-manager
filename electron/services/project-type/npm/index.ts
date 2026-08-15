/**
 * npm 项目类型提供者
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider } from '@electron/services/project-type/interface'
import type { CommandProfile, ProjectMenu, TaskInfo } from '@/types/project'
import { PROFILE } from '@electron/services/project-type/npm/profile'
import { resolveStartCommand } from '@electron/services/project-type/npm/start'
import { getTaskList } from '@electron/services/project-type/npm/tasks'

export class NpmProvider implements ProjectTypeProvider {
  readonly type = 'npm'
  readonly label = 'npm'
  readonly startMode = 'direct'
  readonly buildStartCommandTemplate = ''
  readonly modulePathSeparator = ''
  readonly buildCommands: string[] = []
  readonly installCommands = ['npm install', 'pnpm install', 'yarn install']
  readonly installFlags = [
    { value: '--legacy-peer-deps', label: '--legacy-peer-deps', default: true },
    { value: '--force', label: '--force' },
  ]
  readonly installExtraPlaceholder = '如: --prefer-offline --no-audit'
  readonly taskCommandTemplate = 'npm run {script}'
  readonly defaultBuildCommand = 'npm run build'
  readonly supportsBuildToolDetection = true
  readonly nestedBuildOutputDirs: string[] = []

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

  getMenu(): ProjectMenu {
    return {
      buildGroup: {
        key: 'build',
        label: '构建',
        items: [
          { id: 'build', label: '构建项目' },
          { id: 'install', label: '安装依赖' },
          { id: 'clean', label: '清理构建产物' },
          { id: 'cleanModules', label: '清理依赖目录' },
        ],
      },
      configItems: [
        { id: 'proxy', label: '修改代理' },
        { id: 'proxyPort', label: '修改端口' },
      ],
    }
  }

  getConfigFilePath(path: string): string | null {
    const pkgPath = join(path, 'package.json')
    return existsSync(pkgPath) ? pkgPath : null
  }
}
