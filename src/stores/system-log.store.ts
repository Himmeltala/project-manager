/*
 * @Author: zhengrenfu
 * @Date: 2026-07-21 11:53:05
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-21 10:02:20
 * @FilePath: \src\stores\system-log.store.ts
 * @Description: 日志面板唯一数据门面：写入、事件订阅、行数上限、清空全在此文件
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { IPC, IPC_EVENT } from '@/ipc/channels'
import { SETTINGS_KEYS } from '@/ipc/keys'

// 展示用消息类型，着色映射在面板内完成
export type SystemLogType = 'success' | 'error' | 'warning' | 'info' | 'plain'

// 日志记录；seq 单调递增，头部裁剪后仍保证消费方按序增量同步
export interface SystemLogRecord {
  seq: number
  time: number
  type: SystemLogType
  label: string
  text: string
}

export const useSystemLogStore = defineStore('systemLog', () => {
  const records = ref<SystemLogRecord[]>([])
  // 面板最大行数，来自共享设置 output.max_lines
  const maxLines = ref(5000)
  let started = false
  let seqCounter = 0

  function trim() {
    if (records.value.length > maxLines.value) {
      records.value = records.value.slice(-maxLines.value)
    }
  }

  /**
   * 追加一条日志记录，达到上限时丢弃头部最旧记录
   * @param type 消息类型，决定标签与颜色
   * @param text 消息正文
   * @param label 自定义标签，为空时按 type 显示默认标签
   */
  function push(type: SystemLogType, text: string, label: string = '') {
    records.value.push({ seq: ++seqCounter, time: Date.now(), type, label, text })
    trim()
  }

  /**
   * 主进程侧捕获入口（Vue 错误、未捕获异常、console 劫持）
   * @param type 消息类型
   * @param message 消息正文
   * @param info 来源标签，为空时按 type 显示默认标签
   */
  function addEntry(type: SystemLogType, message: string, info: string = '') {
    push(type, message, info)
  }

  function clearAll() {
    records.value = []
  }

  /**
   * 渲染侧发送日志消息，经主进程 echo 后回到 push 统一入列
   * @param type 消息类型
   * @param text 消息正文
   */
  function notify(type: SystemLogType, text: string): void {
    window.electronAPI.invoke(IPC.system.log, type, text)
  }

  // 进程级单例，订阅仅初始化一次且随应用生命周期存在，无销毁路径
  function subscribe() {
    if (started) return
    started = true

    window.electronAPI
      .invoke(IPC.settings.get, SETTINGS_KEYS.systemLogMaxLines)
      .then((saved) => {
        const cap = Number(saved)
        if (Number.isFinite(cap) && cap >= 1) {
          maxLines.value = Math.floor(cap)
          trim()
        }
      })
      .catch(() => {
        // 读取失败保持默认上限
      })

    window.electronAPI.on(IPC_EVENT.output, ({ type, text }: { type: SystemLogType; text: string }) => {
      push(type, text)
    })

    window.electronAPI.on(IPC_EVENT.settingsChanged, ({ key, value }) => {
      if (key !== SETTINGS_KEYS.systemLogMaxLines) return
      const cap = Number(value)
      if (!Number.isFinite(cap) || cap < 1) return
      maxLines.value = Math.floor(cap)
      trim()
    })
  }

  // 首次实例化即订阅，进程级仅一份监听
  subscribe()

  return { records, maxLines, push, addEntry, clearAll, notify }
})
