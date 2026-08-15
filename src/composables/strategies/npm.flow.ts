/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\composables\strategies\npm.flow.ts
 * @Description: npm 项目流程策略
 */

import type { ProjectFlowAdapter } from '@/composables/strategies/types'

export const npmFlow: ProjectFlowAdapter = {
  type: 'npm',

  label: 'npm',

  getStartMode: () => 'direct',

  buildStartCommand: () => '',

  buildCommands: [],

  installCommands: ['npm install', 'pnpm install', 'yarn install'],

  supportsBuildToolDetection: true,

  getTaskCommandTemplate: (taskName?: string) => `npm run ${taskName || '{script}'}`,

  defaultBuildCommand: 'npm run build',

  menu: {
    buildGroup: {
      key: 'build',
      label: '构建',
      items: [
        { action: 'build', label: '构建项目' },
        { action: 'install', label: '安装依赖' },
        { action: 'clean', label: '清理构建产物' },
        { action: 'cleanModules', label: '清理依赖目录' },
      ],
    },
    configItems: [
      { action: 'proxy', label: '修改代理' },
      { action: 'proxyPort', label: '修改端口' },
    ],
  },
}
