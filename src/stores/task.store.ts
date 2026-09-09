/*
 * @Author: zhengrenfu
 * @Date: 2026-07-21 22:33:12
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03 22:33:12
 * @FilePath: \src\stores\task.store.ts
 * @Description: 后台任务状态管理
 */
import { defineStore } from 'pinia'
import { IPC, IPC_EVENT } from '@/ipc/channels'

import { ref, computed } from 'vue'
import type { BackgroundTask } from '@/types/task'

// 主进程推送的任务进度事件负载，任务执行期间的每次上报都会实时送达
interface TaskProgressEvent {
  taskId: string
  name: string
  progress: number
  message: string
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<BackgroundTask[]>([])
  let loaded = false
  let cleanups: (() => void)[] = []

  async function refresh() {
    tasks.value = await window.electronAPI.invoke(IPC.task.getAll)
  }

  /**
   * 将拉取到的任务按创建时间倒序插入列表，与主进程 getAll 的返回顺序保持一致
   * @param task 待插入的任务完整记录
   */
  function insertByCreatedAt(task: BackgroundTask) {
    const index = tasks.value.findIndex((t) => t.createdAt < task.createdAt)
    if (index === -1) {
      tasks.value.push(task)
    } else {
      tasks.value.splice(index, 0, task)
    }
  }

  /**
   * 处理任务进度事件，原地更新对应任务的运行状态、进度与提示信息
   * @param event 主进程推送的任务进度事件
   */
  async function handleTaskProgress(event: TaskProgressEvent) {
    const task = tasks.value.find((t) => t.taskId === event.taskId)
    if (task) {
      // 已完成或失败的任务保留终态与最终进度，仅待执行或执行中的任务更新实时进度
      if (task.status === 'pending' || task.status === 'running') {
        task.status = 'running'
        task.progress = event.progress
        task.message = event.message
      }
      return
    }
    // 列表缺失该任务时拉取完整记录后补入，避免刷新尚未完成时进度事件被丢弃
    const full = (await window.electronAPI.invoke(IPC.task.get, event.taskId)) as BackgroundTask | undefined
    if (full && !tasks.value.some((t) => t.taskId === full.taskId)) {
      insertByCreatedAt(full)
    }
  }

  async function clearFinished() {
    await window.electronAPI.invoke(IPC.task.clearFinished)
    await refresh()
  }

  /**
   * 请求主进程取消指定任务
   * @param taskId 任务 ID
   */
  async function cancelTask(taskId: string) {
    await window.electronAPI.invoke(IPC.task.cancel, taskId)
  }

  /**
   * 拉取任务完整详情（含执行日志），供详情弹窗使用
   * @param taskId 任务 ID
   * @returns 任务完整记录，不存在时返回 null
   */
  async function getDetail(taskId: string) {
    return (await window.electronAPI.invoke(IPC.task.get, taskId)) as BackgroundTask | null
  }

  // 未终态任务数（待执行或运行中），状态栏徽标直接消费
  const activeCount = computed(() => tasks.value.filter((t) => t.status === 'pending' || t.status === 'running').length)

  async function init() {
    if (loaded) return
    loaded = true
    // 先注册订阅再拉取，避免拉取在途时 destroy 后重挂出现双订阅窗口
    cleanups.push(window.electronAPI.on(IPC_EVENT.taskStarted, refresh))
    cleanups.push(window.electronAPI.on(IPC_EVENT.taskCompleted, refresh))
    cleanups.push(window.electronAPI.on(IPC_EVENT.taskFailed, refresh))
    cleanups.push(window.electronAPI.on(IPC_EVENT.taskProgress, handleTaskProgress))
    await refresh().catch(() => {
      // 首拉失败依赖后续任务事件自愈
    })
  }

  function destroy() {
    cleanups.forEach((fn) => fn())
    cleanups = []
    loaded = false
  }

  return { tasks, activeCount, refresh, clearFinished, cancelTask, getDetail, init, destroy }
})
