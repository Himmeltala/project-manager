/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-09
 * @FilePath: \src\composables\strategies\pnpm.flow.ts
 * @Description: pnpm 项目流程策略（复用 npm）
 */

import type { ProjectFlowAdapter } from './types'
import { npmFlow } from './npm.flow'

export const pnpmFlow: ProjectFlowAdapter = {
  ...npmFlow,
  type: 'pnpm',
}
