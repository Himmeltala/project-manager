/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14 10:45:54
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14 16:24:10
 * @FilePath: \src\stores\notification.store.ts
 * @Description: 通知面板唯一数据门面：增删改查与主进程事件订阅全在此文件
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { IPC, IPC_EVENT } from '@/ipc/channels'

import type { NotificationItem } from '@/types/notification'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<NotificationItem[]>([])
  const unreadCount = ref(0)
  let loaded = false
  let started = false
  // 并发 reload 合并为一次拉取，事件风暴时不产生交错请求
  let inFlight: Promise<void> | null = null

  async function load() {
    if (loaded) return
    await reload()
    // 首拉成功后才放行，失败保持可重试
    loaded = true
  }

  // 未读数由同一份列表派生，与主进程 filter(!read) 口径一致
  function reload() {
    if (!inFlight) {
      inFlight = (async () => {
        const list = (await window.electronAPI.invoke(IPC.notification.getAll)) as NotificationItem[]
        notifications.value = list
        unreadCount.value = list.filter((n) => !n.read).length
      })().finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }

  /**
   * 渲染侧创建通知；主进程会广播 notificationCreated，中央订阅负责刷新
   * @param type 通知类型
   * @param title 标题
   * @param message 正文
   */
  async function create(type: string, title: string, message: string) {
    await window.electronAPI.invoke(IPC.notification.create, type, title, message)
  }

  // 主进程不发事件的操作需自行刷新
  async function markRead(id: string) {
    await window.electronAPI.invoke(IPC.notification.markRead, id)
    await reload()
  }

  async function markAllRead() {
    await window.electronAPI.invoke(IPC.notification.markAllRead)
    await reload()
  }

  // 主进程会广播 notificationsCleared，中央订阅负责刷新
  async function clearAll() {
    await window.electronAPI.invoke(IPC.notification.clearAll)
  }

  // 主进程侧新增/清空通知的实时同步，进程级仅一份监听
  function subscribe() {
    if (started) return
    started = true
    window.electronAPI.on(IPC_EVENT.notificationCreated, () => reload())
    window.electronAPI.on(IPC_EVENT.notificationsCleared, () => reload())
  }

  // 首次实例化即订阅，其余消费者只管调用
  subscribe()

  return { notifications, unreadCount, load, reload, create, markRead, markAllRead, clearAll }
})
