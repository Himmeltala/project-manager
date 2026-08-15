/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\types\task.ts
 * @Description: 后台任务数据结构定义
 */

// Background task status (build, update, etc.)
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

// Full background task info
export interface BackgroundTask {
  taskId: string
  name: string
  status: TaskStatus
  progress: number
  message: string
  logLines: string[]
  error: string | null
  createdAt: number
  finishedAt: number | null
}

// Task report callback with progress percentage
export type TaskReport = (message: string, progress?: number) => void

// 任务状态显示元数据
export interface TaskStatusMeta {
  // 显示文本
  text: string
  // 文本颜色
  color: string
  // 进度条状态（Element Plus）
  progress: 'success' | 'exception' | 'warning' | ''
}

// 任务状态显示元数据注册表，组件共用同一份定义
export const TASK_STATUS_META: Record<TaskStatus, TaskStatusMeta> = {
  pending: { text: '等待中', color: 'var(--el-text-color-secondary)', progress: 'warning' },
  running: { text: '运行中', color: 'var(--el-color-primary)', progress: '' },
  completed: { text: '已完成', color: 'var(--el-color-success)', progress: 'success' },
  failed: { text: '失败', color: 'var(--el-color-danger)', progress: 'exception' },
}

/**
 * 获取任务状态显示元数据
 * @param status 任务状态
 * @returns 显示元数据，未知状态回退原值
 */
export function getTaskStatusMeta(status: string): TaskStatusMeta {
  return (
    TASK_STATUS_META[status as TaskStatus] ?? { text: status, color: 'var(--el-text-color-secondary)', progress: '' }
  )
}
