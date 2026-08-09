/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-09
 * @FilePath: \src\composables\strategies\types.ts
 * @Description: 项目流程策略接口定义
 */
import type { Project } from '../../types/project'

// 右键菜单扩展项
export interface MenuAction {
  key: string
  label: string
  visible?: (proj: Project) => boolean
}

// 项目流程适配器
export interface ProjectFlowAdapter {
  readonly type: string

  getStartMode(): 'direct' | 'module-select'

  buildStartCommand(modulePath: string): string

  readonly buildCommands: string[]

  readonly installCommands: string[]

  readonly extraActions: MenuAction[]
}
