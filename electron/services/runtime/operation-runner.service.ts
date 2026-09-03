/*
 * @Author: zhengrenfu
 * @Date: 2026-09-03
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \electron\services\runtime\operation-runner.service.ts
 * @Description: 后台操作编排器，统一任务注册、实时进度上报与结果通知的样板
 */
// #region Imports
import type { TaskService } from '@electron/services/runtime/task.service'
import type { NotificationService } from '@electron/services/notification.service'
import type { TaskReport } from '@/types/task'
// #endregion

/** VCS 更新结果 */
export interface VcsUpdateOutcome {
  status: string
  text?: string
}

/** 任务操作上下文，供操作主体实时上报单行输出与执行百分比 */
export interface TaskOpCtx {
  /** 上报一行输出，自动规范为单行并按节流节奏刷新任务卡片文案 */
  line(text: string): void
  /** 上报执行百分比，自动收敛到 1 至 99 且只升不降，仅推进任务进度条 */
  percent(p: number): void
}

/** 任务操作上下文控制接口，额外提供立即冲刷与停用能力 */
export interface TaskOpCtxController extends TaskOpCtx {
  /** 立即冲刷尚未发出的行与百分比，供收尾状态上报前使用 */
  flushNow(): void
  /** 停用上下文并清除遗留节流定时器，防止任务结束后仍上报 */
  dispose(): void
}

/** 任务操作上下文构造选项 */
export interface TaskOpCtxOptions {
  /** 上报节流间隔毫秒数，默认 200 毫秒，即每秒最多 5 次 */
  throttleMs?: number
  /** 尚无任何行消息时，百分比上报使用的兜底文案 */
  initialMessage?: string
  /** 行文本格式化器，可为原始输出叠加项目序号等前缀上下文 */
  formatLine?: (line: string) => string
  /** 百分比换算器，将操作内部进度映射为任务整体进度，如批量任务按项目数分摊 */
  mapPercent?: (percent: number) => number
}

/** 上报节流间隔默认值，对应每秒最多 5 次上报 */
const DEFAULT_THROTTLE_MS = 200
/** 单条行消息长度上限，避免超长输出拖累任务卡片与日志渲染 */
const MAX_TASK_LINE_LENGTH = 200
/** 进度上报最小值，0 或未知阶段不上报 */
const MIN_REPORT_PERCENT = 1
/** 进度上报最大值，100 一律由任务收尾上报给出 */
const MAX_REPORT_PERCENT = 99

/**
 * 将文本规范化为单行：合并空白与换行、去掉首尾空白并截断超长文本
 * @param raw 原始输出文本
 * @returns 规范后的单行文本
 */
function normalizeTaskLine(raw: string): string {
  const line = raw.replace(/\s+/g, ' ').trim()
  return line.slice(0, MAX_TASK_LINE_LENGTH)
}

/**
 * 构造节流的任务操作上下文
 * 行消息与百分比共用一条上报通道：节流窗口内保留最新值，按固定节奏刷入任务卡片，
 * 避免高频行输出打爆任务进度事件；取消导致的抛错只保留到主流程边界上报再抛出，
 * 防止定时器回调中的异常变成未捕获异常
 * @param report 任务进度上报函数
 * @param options 上下文构造选项，可省略
 * @returns 任务操作上下文控制接口
 */
export function createTaskOpCtx(report: TaskReport, options: TaskOpCtxOptions = {}): TaskOpCtxController {
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS
  const formatLine = options.formatLine
  const mapPercent = options.mapPercent
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingLine: string | null = null
  let lastPercent = 0
  let sentPercent = 0
  let message = options.initialMessage ?? ''

  // 定时器回调中的抛错会成为未捕获异常，取消错误统一留到主流程下一次上报时抛出
  const safeReport = (text: string, progress?: number): void => {
    try {
      report(text, progress)
    } catch {
      /* 忽略取消错误，任务框架在主流程边界上报时会再次抛出 */
    }
  }

  const doFlush = (): void => {
    timer = null
    if (stopped) return
    const line = pendingLine
    pendingLine = null
    if (line !== null) {
      message = line
    }
    const mapped = mapPercent ? mapPercent(lastPercent) : lastPercent
    const progress = mapped > sentPercent ? mapped : undefined
    if (progress !== undefined) sentPercent = mapped
    if (line === null && progress === undefined) return
    const text = message || (progress !== undefined ? `${progress}%` : '')
    safeReport(text, progress)
  }

  const kick = (): void => {
    if (stopped || timer !== null) return
    timer = setTimeout(doFlush, throttleMs)
  }

  return {
    line(raw: string): void {
      if (stopped) return
      const line = normalizeTaskLine(raw)
      if (!line) return
      pendingLine = formatLine ? formatLine(line) : line
      kick()
    },
    percent(p: number): void {
      if (stopped) return
      if (!Number.isFinite(p)) return
      const clamped = Math.max(MIN_REPORT_PERCENT, Math.min(MAX_REPORT_PERCENT, Math.floor(p)))
      if (clamped <= lastPercent) return
      lastPercent = clamped
      kick()
    },
    flushNow(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      doFlush()
    },
    dispose(): void {
      stopped = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

/**
 * 后台操作编排器
 * 消除 main.ts 中重复的 addTask + report + 通知样板
 */
export class OperationRunner {
  constructor(
    private taskService: TaskService,
    private notificationService: NotificationService,
    private sendOutput: (payload: { type: string; text: string }) => void,
  ) {}

  /**
   * 以后台任务方式运行操作
   * @param name 任务名（显示在前端任务面板）
   * @param opts.startMsg 开始进度文案
   * @param opts.work 操作主体，可借助 ctx 实时上报行输出与百分比，返回 false 表示失败
   * @param opts.doneMsg 成功进度文案
   * @param opts.failMsg 失败原因
   */
  run(
    name: string,
    opts: {
      startMsg: string
      work: (ctx: TaskOpCtx) => Promise<unknown>
      doneMsg: string
      failMsg: string
    },
  ): void {
    this.taskService.addTask(name, async (report) => {
      report(opts.startMsg, 5)
      const ctx = createTaskOpCtx(report, { initialMessage: opts.startMsg })
      try {
        const ok = await opts.work(ctx)
        ctx.flushNow()
        if (ok === false) throw new Error(opts.failMsg)
        report(opts.doneMsg, 100)
      } finally {
        ctx.dispose()
      }
    })
  }

  /**
   * 运行命令并统一成功/失败通知与错误输出
   * @param name 项目名
   * @param command 命令文本
   * @param label 操作标签，如 脚本 / 任务
   * @param run 命令执行主体
   */
  runCommand(name: string, command: string, label: string, run: () => Promise<boolean>): void {
    run().then((ok) => {
      if (ok) {
        this.notificationService.createNotification('info', `${label}完成: ${name}`, command, name)
        return
      }
      this.notificationService.createNotification('error', `${label}失败: ${name}`, `${command}\n退出码非零`, name)
      this.sendOutput({ type: 'error', text: `${name}: ${label}失败 (退出码非零) ${command}` })
    })
  }

  /**
   * 运行 VCS 更新，统一处理 成功 / 冲突 / 失败 三种结果
   * 操作主体可通过 ctx 实时上报逐行输出与执行百分比，编排器按节流节奏刷入任务卡片
   * @param taskName 任务名
   * @param displayName 项目显示名
   * @param vcsLabel VCS 类型标签
   * @param run 更新主体，接收任务操作上下文 ctx
   */
  runVcsUpdate(
    taskName: string,
    displayName: string,
    vcsLabel: string,
    run: (ctx: TaskOpCtx) => Promise<VcsUpdateOutcome>,
  ): void {
    const startMsg = `正在更新 [${displayName}] ...`
    this.taskService.addTask(taskName, async (report) => {
      report(startMsg, 5)
      const ctx = createTaskOpCtx(report, { initialMessage: startMsg })
      try {
        const result = await run(ctx)
        // 冲刷最后一行与百分比后，再给出终态文案
        ctx.flushNow()
        if (result.status === 'ok') {
          report(`${vcsLabel}更新完成: ${displayName}`, 100)
        } else if (result.status === 'conflict') {
          report(`${vcsLabel}更新完成，存在合并冲突: ${displayName}`, 100)
          this.notificationService.createNotification(
            'vcs_conflict',
            `${vcsLabel} 冲突: ${displayName}`,
            '更新完成后存在合并冲突，请手动解决',
            displayName,
            true,
          )
        } else {
          throw new Error(`${vcsLabel}更新失败: ${displayName}\n${result.text || ''}`)
        }
      } finally {
        ctx.dispose()
      }
    })
  }
}
