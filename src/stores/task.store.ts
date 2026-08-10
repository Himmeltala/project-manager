/*
 * @Author: zhengrenfu
 * @Date: 2026-07-21
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-21
 * @FilePath: \src\stores\task.store.ts
 * @Description: 后台任务状态管理
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BackgroundTask } from '@/types/task'

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<BackgroundTask[]>([])
  let loaded = false
  let cleanups: (() => void)[] = []

  async function refresh() {
    tasks.value = await window.electronAPI.invoke('task:getAll')
  }

  async function clearFinished() {
    await window.electronAPI.invoke('task:clearFinished')
    await refresh()
  }

  async function init() {
    if (loaded) return
    loaded = true
    await refresh()

    cleanups.push(window.electronAPI.on('event:taskStarted', refresh))
    cleanups.push(window.electronAPI.on('event:taskCompleted', refresh))
    cleanups.push(window.electronAPI.on('event:taskFailed', refresh))
  }

  function destroy() {
    cleanups.forEach((fn) => fn())
    cleanups = []
    loaded = false
  }

  return { tasks, refresh, clearFinished, init, destroy }
})
