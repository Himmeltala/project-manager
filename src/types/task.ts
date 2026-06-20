/** 后台任务状态（如构建、更新等耗时操作） */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

/** 后台任务完整信息 */
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

/** 任务报告回调，带进度百分比 */
export type TaskReport = (message: string, progress?: number) => void
