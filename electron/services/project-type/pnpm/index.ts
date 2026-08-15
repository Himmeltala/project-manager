/**
 * pnpm 项目类型提供者（复用 npm 生态的 framework/build-tool/proxy/port）
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider } from '@electron/services/project-type/interface'
import type { CommandProfile, ProjectMenu } from '@/types/project'
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
  readonly taskCommandTemplate = 'pnpm run {script}'
  readonly defaultBuildCommand = 'pnpm run build'
  readonly supportsBuildToolDetection = true
  readonly nestedBuildOutputDirs: string[] = []

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
