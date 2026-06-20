import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { NotificationItem } from '../types/notification'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<NotificationItem[]>([])
  const unreadCount = ref(0)

  async function load() {
    notifications.value = await window.electronAPI.getNotifications()
    unreadCount.value = await window.electronAPI.getUnreadCount()
  }

  async function markRead(id: string) {
    await window.electronAPI.markRead(id)
    await load()
  }

  async function markAllRead() {
    await window.electronAPI.markAllRead()
    await load()
  }

  async function clearAll() {
    await window.electronAPI.clearAllNotifications()
    await load()
  }

  return { notifications, unreadCount, load, markRead, markAllRead, clearAll }
})
