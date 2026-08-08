/**
 * Maven 命令模板
 */
import type { CommandProfile } from '@/types/project'

export const PROFILE: CommandProfile = {
  start: 'mvn spring-boot:run',
  build: 'mvn package -DskipTests',
  install: 'mvn install -DskipTests',
  runScript: 'mvn {script}',
  cleanDirs: ['target'],
  buildOutputDir: 'target',
  taskListFile: null,
  taskListKey: null,
}
