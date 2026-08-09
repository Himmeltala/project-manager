/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-09
 * @FilePath: \src\composables\strategies\npm.flow.ts
 * @Description: npm 项目流程策略
 */

import type { ProjectFlowAdapter } from './types'

export const npmFlow: ProjectFlowAdapter = {
  type: 'npm',

  getStartMode: () => 'direct',

  buildStartCommand: () => '',

  buildCommands: [],

  installCommands: ['npm install', 'pnpm install', 'yarn install'],

  extraActions: [
    { key: 'proxy', label: '代理配置' },
    { key: 'proxyPort', label: '修改端口' },
  ],
}
