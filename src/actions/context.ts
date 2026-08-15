/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\context.ts
 * @Description: 动作执行上下文适配器，统一封装 IPC 通道、弹窗与消息提示
 */

import type { Ref } from 'vue'
import { IPC } from '@/ipc/channels'

import type { Project } from '@/types/project'
import type { ActionContext, ModalInstance } from '@/actions/types'
import { useProjectStore } from '@/stores/project.store'
import { useNotificationStore } from '@/stores/notification.store'
import { useInfo, useError, useSuccess, useWarning, useConfirm, usePrompt } from '@/composables/useMessage'

// 上下文装配依赖
export interface ActionContextDeps {
  // 所有源模式开关
  allSourcesMode: Ref<boolean>
  // 所有源模式下的项目列表
  allProjects: Ref<any[]>
  // 弹窗实例集合
  modals: Record<string, ModalInstance>
}

/**
 * 创建动作执行上下文
 * @param deps 装配依赖
 * @returns 动作策略可用的执行上下文
 */
export function createActionContext(deps: ActionContextDeps): ActionContext {
  const store = useProjectStore()
  const notifyStore = useNotificationStore()

  function warnAllSources(op: string): boolean {
    if (deps.allSourcesMode.value) {
      useWarning(`"所有源"模式下暂不支持${op}，请先切换到具体项目源`)
      return true
    }
    return false
  }

  return {
    get allSourcesMode() {
      return deps.allSourcesMode.value
    },

    getProject(idx: number): Project | null {
      const list = deps.allSourcesMode.value ? deps.allProjects.value : store.projects
      return list[idx - 1] || null
    },

    getSources() {
      return store.sources
    },

    getRunningInfo() {
      return store.runningInfo
    },

    warnAllSources,

    modals: deps.modals as ActionContext['modals'],

    info: useInfo,
    warning: useWarning,
    error: useError,
    success: useSuccess,

    confirm: useConfirm,
    prompt: usePrompt,

    log(level: string, msg: string): void {
      window.electronAPI.invoke(IPC.system.log, level, msg)
    },

    async runScript(idx: number, command: string): Promise<void> {
      if (warnAllSources('运行脚本')) return
      await window.electronAPI.invoke(IPC.projectMgr.runScript, idx, command)
      window.electronAPI.invoke(IPC.notification.create, 'info', '脚本已启动', command)
    },

    async refreshRunningInfo(): Promise<void> {
      await store.refreshRunningInfo()
    },

    async refreshNotifications(): Promise<void> {
      await notifyStore.load()
    },

    async reloadProjects(): Promise<void> {
      await store.loadProjects()
    },

    invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
      return window.electronAPI.invoke(channel, ...args)
    },
  }
}
