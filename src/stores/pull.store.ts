/*
 * @Author: zhengrenfu
 * @Date: 2026-09-03
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \src\stores\pull.store.ts
 * @Description: 拉取项目任务状态管理
 */
import { defineStore } from 'pinia'

import { ref } from 'vue'

export const usePullStore = defineStore('pull', () => {
  // 是否正在拉取项目
  const pulling = ref(false)
  // 当前拉取任务的任务 ID，无拉取任务时为空
  const taskId = ref<string | null>(null)
  // 已确认中断、等待主进程生效的标记
  const cancelling = ref(false)

  /**
   * 记录拉取任务开始
   * @param id 主进程返回的拉取任务 ID
   */
  function markStart(id: string) {
    pulling.value = true
    taskId.value = id
    cancelling.value = false
  }

  /**
   * 拉取任务结束，重置全部状态
   */
  function markEnd() {
    pulling.value = false
    taskId.value = null
    cancelling.value = false
  }

  /**
   * 设置中断等待标记
   * @param value 是否正在等待中断生效
   */
  function markCancelling(value: boolean) {
    cancelling.value = value
  }

  return { pulling, taskId, cancelling, markStart, markEnd, markCancelling }
})
