/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \src\composables\strategies\types.ts
 * @Description: 项目流程策略接口定义
 */
import type { Project } from '@/types/project'

/** 右键菜单扩展项 */
export interface MenuAction {
  key: string
  label: string
  visible?: (proj: Project) => boolean
}

/** 项目流程适配器 -- 每种项目类型实现一个 */
export interface ProjectFlowAdapter {
  /** 唯一标识，如 'npm' / 'maven' */
  readonly type: string

  /** 类型显示名称 */
  readonly label: string

  /** 启动模式：直接启动 或 选择子模块后启动 */
  getStartMode(): 'direct' | 'module-select'

  /** 构建子模块启动命令 */
  buildStartCommand(modulePath: string): string

  /** 构建命令候选列表 */
  readonly buildCommands: string[]

  /** 安装依赖命令候选列表 */
  readonly installCommands: string[]

  /** 类型专属的右键菜单操作项 */
  readonly extraActions: MenuAction[]

  /** 是否支持脚手架检测（build-tool） */
  readonly supportsBuildToolDetection: boolean

  /** 任务执行的命令模板，如 'npm run {script}' */
  getTaskCommandTemplate(taskName?: string): string

  /** 构建命令回退值（无 buildCommands 或 scripts 时使用） */
  readonly defaultBuildCommand: string
}
