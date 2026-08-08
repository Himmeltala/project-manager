/**
 * Gradle 命令模板
 */
import type { CommandProfile } from '@/types/project'

export const PROFILE: CommandProfile = {
  start: 'gradle bootRun',
  build: 'gradle build -x test',
  install: 'gradle publishToMavenLocal',
  runScript: 'gradle {script}',
  cleanDirs: ['build', '.gradle'],
  buildOutputDir: 'build/libs',
  taskListFile: 'build.gradle',
  taskListKey: null,
}
