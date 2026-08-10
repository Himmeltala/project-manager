/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-09
 * @FilePath: \src\composables\strategies\registry.ts
 * @Description: 项目流程策略注册表
 */

import type { ProjectFlowAdapter } from '@/composables/strategies/types'
import { npmFlow } from '@/composables/strategies/npm.flow'
import { mavenFlow } from '@/composables/strategies/maven.flow'
import { gradleFlow } from '@/composables/strategies/gradle.flow'
import { pnpmFlow } from '@/composables/strategies/pnpm.flow'

const flowMap: Record<string, ProjectFlowAdapter> = {
  npm: npmFlow,
  maven: mavenFlow,
  gradle: gradleFlow,
  pnpm: pnpmFlow,
}

// 获取项目类型对应的 UI 流程策略
export function getFlow(type: string): ProjectFlowAdapter {
  return flowMap[type] ?? npmFlow
}

// 所有已注册的策略类型
export function getFlowTypes(): string[] {
  return Object.keys(flowMap)
}
