/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\types\task.ts
 * @Description: 后台任务数据结构定义
 */

/** Background task status (build, update, etc.) */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

/** Full background task info */
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

/** Task report callback with progress percentage */
export type TaskReport = (message: string, progress?: number) => void
