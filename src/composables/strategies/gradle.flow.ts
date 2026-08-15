/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
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

  installCommands: ['gradle build', 'gradle clean build'],

  supportsBuildToolDetection: false,

  getTaskCommandTemplate: (taskName?: string) => `gradle ${taskName || '{script}'}`,

  defaultBuildCommand: 'gradle build -x test',

  menu: {
    buildGroup: {
      key: 'build',
      label: '构建',
      items: [
        { action: 'install', label: '安装依赖' },
        { action: 'clean', label: '清理构建产物' },
      ],
    },
    typeActions: [
      { action: 'java', label: 'Java 版本' },
      { action: 'gradle', label: 'Gradle 版本' },
    ],
  },
}
