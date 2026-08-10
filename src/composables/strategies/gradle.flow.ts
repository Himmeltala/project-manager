/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \src\composables\strategies\gradle.flow.ts
 * @Description: Gradle 项目流程策略
 */

import type { ProjectFlowAdapter } from '@/composables/strategies/types'

export const gradleFlow: ProjectFlowAdapter = {
  type: 'gradle',

  label: 'Gradle',

  getStartMode: () => 'module-select',

  buildStartCommand: (modulePath: string) => `gradle :${modulePath.replace(/\\/g, ':')}:bootRun`,

  buildCommands: ['gradle build -x test', 'gradle build', 'gradle clean build'],

  installCommands: [],

  extraActions: [{ key: 'java', label: 'Java 版本' }],

  supportsBuildToolDetection: false,

  getTaskCommandTemplate: (taskName?: string) => `gradle ${taskName || '{script}'}`,

  defaultBuildCommand: 'gradle build -x test',
}
