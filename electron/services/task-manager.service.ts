import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type { BackgroundTask, TaskStatus, TaskReport } from '../../src/types/task'

export class TaskManager extends EventEmitter {
  private queue: BackgroundTask[] = []
  private tasks: Map<string, BackgroundTask> = new Map()
  private currentTask: BackgroundTask | null = null
  private cancelEvents: Map<string, boolean> = new Map()
  private running = true

  constructor() {
    super()
    this.startWorker()
  }

  addTask(name: string, target?: (report: TaskReport) => void): string {
    const taskId = randomUUID().slice(0, 12)
    const task: BackgroundTask = {
      taskId,
      name,
      status: 'pending',
      progress: 0,
      message: '',
      logLines: [],
      error: null,
      createdAt: Date.now(),
      finishedAt: null,
    }
    // 用非枚举属性存 _target，避免 IPC 序列化带函数导致抛错
    Object.defineProperty(task, '_target', { value: target, enumerable: false, writable: true })
    this.tasks.set(taskId, task)
    this.queue.push(task)
    this.processQueue()
    return taskId
  }

  setTaskTarget(taskId: string, fn: (report: TaskReport) => void): void {
    const task = this.tasks.get(taskId)
    if (task) {
      Object.defineProperty(task, '_target', { value: fn, enumerable: false, writable: true })
    }
  }

  getTask(taskId: string): BackgroundTask | undefined {
    const t = this.tasks.get(taskId)
    return t ? { ...t } : undefined
  }

  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values())
      .map((t) => ({ ...t }))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  getActiveTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values())
      .filter((t) => t.status === 'pending' || t.status === 'running')
      .map((t) => ({ ...t }))
  }

  cancelTask(taskId: string): boolean {
    if (this.tasks.has(taskId)) {
      this.cancelEvents.set(taskId, true)
      return true
    }
    return false
  }

  shutdown(): void {
    this.running = false
  }

  private async processQueue(): Promise<void> {
    if (this.currentTask) return
    const task = this.queue.shift()
    if (!task) return

    this.currentTask = task
    const cancelCheck = () => this.cancelEvents.get(task.taskId) || false

    task.status = 'running'
    this.emit('taskStarted', { taskId: task.taskId, name: task.name })

    const report: TaskReport = (message: string, progress?: number) => {
      if (cancelCheck()) {
        throw new Error('任务已取消')
      }
      task.message = message
      task.logLines.push(message)
      if (progress !== undefined) {
        task.progress = Math.max(0, Math.min(100, progress))
      }
      this.emit('taskProgress', {
        taskId: task.taskId,
        name: task.name,
        progress: task.progress,
        message,
      })
    }

    try {
      const target = (task as any)._target
      if (target) {
        await target(report)
      }
      task.status = 'completed'
      task.progress = 100
      task.finishedAt = Date.now()
      this.emit('taskCompleted', { taskId: task.taskId, name: task.name })
    } catch (e: any) {
      task.status = 'failed'
      task.error = e.message || '未知错误'
      task.logLines.push(`错误: ${task.error}`)
      task.finishedAt = Date.now()
      this.emit('taskFailed', { taskId: task.taskId, name: task.name, error: task.error })
    } finally {
      this.cancelEvents.delete(task.taskId)
      this.currentTask = null
      if (this.queue.length > 0) {
        this.processQueue()
      }
    }
  }

  private startWorker(): void {
    // Queue processing is triggered via addTask
  }
}
