import { existsSync } from 'fs'
import { join } from 'path'
import type { ProjectTypeProvider } from './project-type.interface'
import type { CommandProfile } from '../../../src/types/project'

const PROFILE: CommandProfile = {
  start: 'npm run dev',
  build: 'npm run build',
  install: 'npm install',
  runScript: 'npm run {script}',
  cleanDirs: ['dist', 'node_modules'],
  buildOutputDir: 'dist',
  taskListFile: 'package.json',
  taskListKey: 'scripts',
  contextMenuSections: [],
}

export class NpmProvider implements ProjectTypeProvider {
  readonly type = 'npm'
  readonly label = 'npm'

  detect(path: string): boolean {
    return existsSync(join(path, 'package.json'))
  }

  getProfile(): CommandProfile {
    return PROFILE
  }

  resolveStartCommand(): string {
    return PROFILE.start
  }

  getTaskList(path: string): import('../../../src/types/project').TaskInfo | null {
    const pkgPath = join(path, 'package.json')
    if (!existsSync(pkgPath)) {
      return { type: 'npm', tasks: {}, error: '未找到 package.json' }
    }
    try {
      const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'))
      return { type: 'npm', tasks: pkg.scripts || {}, file: pkgPath }
    } catch (e: any) {
      return { type: 'npm', tasks: {}, error: e.message }
    }
  }
}
