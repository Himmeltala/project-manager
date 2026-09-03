/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \electron\services\task.service.ts
 * @Description: 后台任务队列服务
 */
// #region Imports
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { SETTINGS_KEYS } from '@/ipc/keys'
import type { BackgroundTask, TaskStatus, TaskReport } from '@/types/task'

// #endregion

export class TaskService extends EventEmitter {
  private queue: BackgroundTask[] = []
  private tasks: Map<string, BackgroundTask> = new Map()
  private activeTasks: Set<BackgroundTask> = new Set()
  private cancelEvents: Map<string, boolean> = new Map()
  private running = true
  private maxConcurrency: number
  private settingsGetter?: (key: string, defaultVal?: any) => any

  constructor(settingsGetter?: (key: string, defaultVal?: any) => any) {
    super()
    this.settingsGetter = settingsGetter
    this.maxConcurrency = settingsGetter ? settingsGetter(SETTINGS_KEYS.tasks.maxConcurrency, 5) : 5
  }

  /**
   * 更新后台任务并发上限，运行中实时生效，无需重启应用
   * @param value 新的并发上限，非数字或小于 1 时按 1 处理
   */
  setMaxConcurrency(value: number): void {
    const parsed = Math.floor(Number(value))
    this.maxConcurrency = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
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
    this.drainQueue()
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

  clearFinishedTasks(): void {
    for (const [taskId, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(taskId)
      }
    }
    this.queue = this.queue.filter((t) => t.status === 'pending')
    this.emit('tasksCleared')
  }

  cancelTask(taskId: string): boolean {
    if (this.tasks.has(taskId)) {
      this.cancelEvents.set(taskId, true)
      return true
    }
    return false
  }

  private drainQueue(): void {
    while (this.running && this.activeTasks.size < this.maxConcurrency) {
      const next = this.queue.find((t) => t.status === 'pending')
      if (!next) break
      next.status = 'running'
      this.activeTasks.add(next)
      this.executeTask(next)
    }
  }

  private async executeTask(task: BackgroundTask): Promise<void> {
    const cancelCheck = () => this.cancelEvents.get(task.taskId) || false

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
      this.activeTasks.delete(task)
      this.pruneOldTasks()
      this.drainQueue()
    }
  }

  private pruneOldTasks(): void {
    const maxCount = this.settingsGetter ? this.settingsGetter(SETTINGS_KEYS.tasks.maxCount, 50) : 50
    if (this.tasks.size <= maxCount) return
    const toRemove = Array.from(this.tasks.values())
      .filter((t) => t.status === 'completed' || t.status === 'failed')
      .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
      .slice(0, this.tasks.size - maxCount)
    for (const t of toRemove) {
      this.tasks.delete(t.taskId)
    }
  }
}

// #endregion
