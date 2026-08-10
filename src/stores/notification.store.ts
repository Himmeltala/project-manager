/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\stores\notification.store.ts
 * @Description: 通知消息状态管理
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { NotificationItem } from '@/types/notification'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<NotificationItem[]>([])
  const unreadCount = ref(0)
  let loaded = false

  async function load() {
    if (loaded) return
    loaded = true
    notifications.value = await window.electronAPI.invoke('notification:getAll')
    unreadCount.value = await window.electronAPI.invoke('notification:getUnreadCount')
  }

  async function reload() {
    loaded = true
    notifications.value = await window.electronAPI.invoke('notification:getAll')
    unreadCount.value = await window.electronAPI.invoke('notification:getUnreadCount')
  }

  async function markRead(id: string) {
    await window.electronAPI.invoke('notification:markRead', id)
    await reload()
  }

  async function markAllRead() {
    await window.electronAPI.invoke('notification:markAllRead')
    await reload()
  }

  async function clearAll() {
    await window.electronAPI.invoke('notification:clearAll')
    await reload()
  }

  return { notifications, unreadCount, load, reload, markRead, markAllRead, clearAll }
})
