/*
 * @Author: zhengrenfu
 * @Date: 2026-07-21
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \src\stores\task.store.ts
 * @Description: 后台任务状态管理
 */
import { defineStore } from 'pinia'
import { IPC } from '@/ipc/channels'

import { ref } from 'vue'
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

  async function init() {
    if (loaded) return
    loaded = true
    await refresh()

    cleanups.push(window.electronAPI.on('event:taskStarted', refresh))
    cleanups.push(window.electronAPI.on('event:taskCompleted', refresh))
    cleanups.push(window.electronAPI.on('event:taskFailed', refresh))
    cleanups.push(window.electronAPI.on('event:taskProgress', handleTaskProgress))
  }

  function destroy() {
    cleanups.forEach((fn) => fn())
    cleanups = []
    loaded = false
  }

  return { tasks, refresh, clearFinished, init, destroy }
})
