/*
 * @Author: zhengrenfu
 * @Date: 2026-07-21
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-21
 * @FilePath: \src\stores\system-log.store.ts
 * @Description: 系统日志状态管理（控制台信息、Vue 错误、未捕获异常等）
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LogItem } from '../types/log'

export const useSystemLogStore = defineStore('systemLog', () => {
  const entries = ref<LogItem[]>([])
  const maxCount = 200

  /**
   * 添加一条日志条目
   */
  function addEntry(message: string, info: string = '') {
    entries.value.push({ timestamp: Date.now(), message, info })
    if (entries.value.length > maxCount) {
      entries.value = entries.value.slice(-maxCount)
    }
  }

  return { entries, addEntry }
})
