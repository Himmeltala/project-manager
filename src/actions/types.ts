/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\types.ts
 * @Description: 动作策略与执行上下文的接口定义
 */

import type { Project, ProjectSource } from '@/types/project'
import type { RunningInfo } from '@/types/process'
import type { ProjectAction } from '@/types/project-action'
import type { useModal } from '@/composables/useModal'

// 函数式弹窗实例类型
export type ModalInstance = ReturnType<typeof useModal>

// 动作执行上下文，适配器模式封装 IPC 通道、弹窗与消息提示
export interface ActionContext {
  // 是否处于所有源模式
  readonly allSourcesMode: boolean
  // 按项目序号获取项目
  getProject(idx: number): Project | null
  // 所有源模式下拦截操作并提示，返回是否已拦截
  warnAllSources(op: string): boolean
  // 获取项目源列表
  getSources(): ProjectSource[]
  // 获取运行中进程信息
  getRunningInfo(): RunningInfo[]
  // 弹窗实例集合
  readonly modals: {
    build: ModalInstance
    clean: ModalInstance
    install: ModalInstance
    migrate: ModalInstance
    proxy: ModalInstance
    port: ModalInstance
    startModule: ModalInstance
    submodulePort: ModalInstance
    selector: ModalInstance
  }
  // 消息提示
  info(msg: string): void
  warning(msg: string): void
  error(msg: string): void
  success(msg: string): void
  // 确认对话框，danger 为真时红色强调
  confirm(title: string, message: string, danger?: boolean): Promise<boolean>
  // 输入对话框，取消返回 null
  prompt(title: string, message: string, defaultValue?: string): Promise<string | null>
  // 写入日志面板
  log(level: string, msg: string): void
  // 运行脚本并创建通知
  runScript(idx: number, command: string): Promise<void>
  // 刷新运行信息与脚本状态
  refreshRunningInfo(): Promise<void>
  // 刷新通知面板
  refreshNotifications(): Promise<void>
  // 重新加载项目列表（配置落盘后调用）
  reloadProjects(): Promise<void>
  // IPC 调用兜底通道
  invoke<T = any>(channel: string, ...args: any[]): Promise<T>
}

// 动作策略，每个动作独立注册进注册表
export interface ActionStrategy {
  // 动作标识，与 flow 菜单声明及 ProjectAction 类型一一对应
  readonly action: ProjectAction
  /**
   * 执行动作
   * @param ctx 执行上下文
   * @param idx 项目序号
   */
  run(ctx: ActionContext, idx: number): void | Promise<void>
}
