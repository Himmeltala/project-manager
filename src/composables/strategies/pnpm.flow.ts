/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \src\composables\strategies\pnpm.flow.ts
 * @Description: pnpm 项目流程策略（复用 npm 策略，覆盖 pnpm 差异）
 */

import type { ProjectFlowAdapter } from '@/composables/strategies/types'
import { npmFlow } from '@/composables/strategies/npm.flow'

export const pnpmFlow: ProjectFlowAdapter = {
  ...npmFlow,
  type: 'pnpm',
  label: 'pnpm',
  getTaskCommandTemplate: (taskName?: string) => `pnpm run ${taskName || '{script}'}`,
  defaultBuildCommand: 'pnpm run build',
}
