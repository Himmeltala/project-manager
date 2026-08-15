/**
 * 后台操作编排器：统一 任务注册 + 进度报告 + 结果通知 样板
 */
import type { TaskService } from '@electron/services/runtime/task.service'
import type { NotificationService } from '@electron/services/notification.service'

/** VCS 更新结果 */
export interface VcsUpdateOutcome {
  status: string
  text?: string
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
   * @param opts.work 操作主体，返回 false 表示失败
   * @param opts.doneMsg 成功进度文案
   * @param opts.failMsg 失败原因
   */
  run(
    name: string,
    opts: {
      startMsg: string
      work: () => Promise<unknown>
      doneMsg: string
      failMsg: string
    },
  ): void {
    this.taskService.addTask(name, async (report) => {
      report(opts.startMsg, 5)
      const ok = await opts.work()
      if (ok === false) throw new Error(opts.failMsg)
      report(opts.doneMsg, 100)
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
   * @param taskName 任务名
   * @param displayName 项目显示名
   * @param vcsLabel VCS 类型标签
   * @param run 更新主体
   */
  runVcsUpdate(taskName: string, displayName: string, vcsLabel: string, run: () => Promise<VcsUpdateOutcome>): void {
    this.taskService.addTask(taskName, async (report) => {
      report(`正在更新 [${displayName}] ...`, 5)
      const result = await run()
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
    })
  }
}
