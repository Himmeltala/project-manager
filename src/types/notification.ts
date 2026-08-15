/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\types\notification.ts
 * @Description: 通知数据结构与类型定义
 */

// Notification type enum
export type NotificationType = 'vcs_remote' | 'vcs_conflict' | 'local_changes' | 'info' | 'warning' | 'error'

// Single notification item
export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message: string
  projectName: string
  timestamp: number
  read: boolean
}

// Display label and color per notification type
export const NOTIFICATION_TYPE_META: Record<string, { label: string; color: string }> = {
  vcs_remote: { label: '远程更新', color: 'var(--el-color-primary)' },
  vcs_conflict: { label: '版本冲突', color: 'var(--el-color-danger)' },
  local_changes: { label: '本地变更', color: 'var(--el-color-warning)' },
  info: { label: '信息', color: 'var(--el-color-success)' },
  warning: { label: '警告', color: 'var(--el-color-warning)' },
  error: { label: '错误', color: 'var(--el-color-danger)' },
}
