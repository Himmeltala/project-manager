/**
 * npm 命令模板
 */
import type { CommandProfile } from '@/types/project'

export const PROFILE: CommandProfile = {
  start: 'npm run dev',
  build: 'npm run build',
  install: 'npm install',
  runScript: 'npm run {script}',
  cleanDirs: ['dist', 'node_modules'],
  buildOutputDir: 'dist',
  taskListFile: 'package.json',
  taskListKey: 'scripts',
}
