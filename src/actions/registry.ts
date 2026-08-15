/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\registry.ts
 * @Description: 动作策略注册表，策略独立注册、按动作名查询
 */

import type { ActionStrategy } from '@/actions/types'
import type { ProjectAction } from '@/types/project-action'

// 动作策略注册表，注册与消费解耦，新增动作不影响消费方
export class ActionRegistry {
  private strategies = new Map<ProjectAction, ActionStrategy>()

  // 注册策略，同动作重复注册时后者覆盖前者
  register(strategy: ActionStrategy): void {
    this.strategies.set(strategy.action, strategy)
  }

  // 按动作名查询策略
  get(action: ProjectAction): ActionStrategy | undefined {
    return this.strategies.get(action)
  }

  // 是否已注册该动作
  has(action: ProjectAction): boolean {
    return this.strategies.has(action)
  }
}

// 全局动作注册表单例
export const actionRegistry = new ActionRegistry()
