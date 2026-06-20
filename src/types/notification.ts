/** 通知类型枚举 */
export type NotificationType = 'vcs_remote' | 'vcs_conflict' | 'local_changes' | 'info' | 'warning' | 'error'

/** 单条通知数据 */
export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message: string
  projectName: string
  timestamp: number
  read: boolean
}

/** 通知类型对应的显示标签和颜色 */
export const NOTIFICATION_TYPE_META: Record<string, { label: string; color: string }> = {
  vcs_remote: { label: '远程更新', color: 'var(--el-color-primary)' },
  vcs_conflict: { label: '版本冲突', color: 'var(--el-color-danger)' },
  local_changes: { label: '本地变更', color: 'var(--el-color-warning)' },
  info: { label: '信息', color: 'var(--el-color-success)' },
  warning: { label: '警告', color: 'var(--el-color-warning)' },
  error: { label: '错误', color: 'var(--el-color-danger)' },
}
