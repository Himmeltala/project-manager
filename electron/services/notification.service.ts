/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-20
 * @FilePath: \electron\services\notification.service.ts
 * @Description: 通知持久化服务
 */
import { EventEmitter } from 'events'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { randomUUID } from 'crypto'
import type { NotificationItem, NotificationType } from '@/types/notification'

const TYPE_SETTING_MAP: Record<string, string> = {
  vcs_remote: 'notifications.show_vcs_remote',
  vcs_conflict: 'notifications.show_vcs_conflict',
  local_changes: 'notifications.show_local_changes',
  info: 'notifications.show_info',
  warning: 'notifications.show_warning',
  error: 'notifications.show_error',
}

export class NotificationService extends EventEmitter {
  private filePath: string
  private notifications: NotificationItem[] = []
  private settingsGetter?: (key: string, defaultVal?: any) => any

  constructor(filePath: string, settingsGetter?: (key: string, defaultVal?: any) => any) {
    super()
    this.filePath = filePath
    this.settingsGetter = settingsGetter
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    try {
      this.notifications = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    } catch {
      // ignore
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.notifications, null, 2), 'utf-8')
  }

  private isTypeEnabled(ntype: NotificationType): boolean {
    if (!this.settingsGetter) return true
    if (!this.settingsGetter('notifications.enabled', true)) return false
    const key = TYPE_SETTING_MAP[ntype]
    if (key) return this.settingsGetter(key, true)
    return true
  }

  createNotification(
    type: NotificationType,
    title: string,
    message: string,
    projectName: string = '',
    skipIfUnreadDuplicate: boolean = false,
  ): string | null {
    if (!this.isTypeEnabled(type)) return null
    if (skipIfUnreadDuplicate && this.hasUnreadDuplicate(type, projectName)) return null

    const notification: NotificationItem = {
      id: randomUUID().slice(0, 12),
      type,
      title,
      message,
      projectName,
      timestamp: Date.now(),
      read: false,
    }

    this.notifications.unshift(notification)
    const maxCount = this.settingsGetter ? this.settingsGetter('notifications.max_count', 100) : 100
    if (this.notifications.length > maxCount) {
      const readItems = this.notifications.filter((n) => n.read)
      for (const item of readItems.slice(-(this.notifications.length - maxCount))) {
        const idx = this.notifications.indexOf(item)
        if (idx >= 0) this.notifications.splice(idx, 1)
      }
    }

    this.save()
    this.emit('notificationCreated', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      projectName: notification.projectName,
      timestamp: notification.timestamp,
    })

    return notification.id
  }

  private hasUnreadDuplicate(type: NotificationType, projectName: string): boolean {
    return this.notifications.some((n) => n.type === type && n.projectName === projectName && !n.read)
  }

  getAll(): NotificationItem[] {
    return [...this.notifications]
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length
  }

  markRead(id: string): boolean {
    const n = this.notifications.find((item) => item.id === id)
    if (n && !n.read) {
      n.read = true
      this.save()
      return true
    }
    return false
  }

  markAllRead(): void {
    let changed = false
    for (const n of this.notifications) {
      if (!n.read) {
        n.read = true
        changed = true
      }
    }
    if (changed) this.save()
  }

  clearAll(): void {
    this.notifications = []
    this.save()
    this.emit('notificationsCleared')
  }
}
