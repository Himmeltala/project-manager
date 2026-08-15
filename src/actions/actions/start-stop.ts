/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\actions\start-stop.ts
 * @Description: 启动与停止动作策略
 */

import type { ActionContext, ActionStrategy } from '@/actions/types'
import { IPC } from '@/ipc/channels'

import { getCapabilities, buildStartCommand } from '@/composables/useProjectType'

async function runStart(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return

  const flow = getCapabilities(proj.projectType)

  // 多模块项目 - 弹窗选模块
  if (flow.startMode === 'module-select') {
    const modules = await ctx.invoke(IPC.project.getRunnableModules, proj.path, proj.projectType)
    if (modules && modules.length > 1) {
      const runningScripts: Record<string, string[]> = await ctx.invoke(IPC.process.getAllRunningScripts)
      const runningCmds = runningScripts[proj.path] || []
      ctx.modals.startModule.open(
        { projectName: proj.name, modules, runningCommands: runningCmds },
        {
          confirm: async (mods: any[]) => {
            for (const mod of mods) {
              const cmd = buildStartCommand(flow.type, mod.modulePath)
              ctx.log('info', `启动 [${proj.name}] - ${mod.name} ...`)
              if (ctx.allSourcesMode) {
                await ctx.invoke(IPC.process.startByPath, proj.path, cmd)
              } else {
                await ctx.invoke(IPC.process.start, idx, cmd)
              }
            }
            await ctx.refreshRunningInfo()
          },
          stop: async (mod: any) => {
            const cmd = buildStartCommand(flow.type, mod.modulePath)
            ctx.log('warning', `停止 [${proj.name}] - ${mod.name} ...`)
            await ctx.invoke(IPC.process.stopScript, idx, cmd)
            await ctx.refreshRunningInfo()
            await runStart(ctx, idx)
          },
        },
      )
      return
    }
  }

  // 单模块 / npm 项目 - 直接启动
  ctx.log('info', `启动 [${proj.name}] ...`)
  if (ctx.allSourcesMode) {
    await ctx.invoke(IPC.process.startByPath, proj.path)
  } else {
    await ctx.invoke(IPC.process.start, idx)
  }
  await ctx.refreshRunningInfo()
}

async function runStop(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return

  const flow = getCapabilities(proj.projectType)

  // 多模块项目 - 复用启动弹窗显示运行状态
  if (flow.startMode === 'module-select') {
    const modules = await ctx.invoke(IPC.project.getRunnableModules, proj.path, proj.projectType)
    if (modules && modules.length > 1) {
      const runningScripts = await ctx.invoke(IPC.process.getAllRunningScripts)
      const runningCmds = (runningScripts?.[proj.path] || []) as string[]
      if (runningCmds.length === 0) {
        ctx.log('warning', `停止 [${proj.name}] — 无运行中的模块`)
        return
      }
      ctx.modals.startModule.open(
        { projectName: proj.name, modules, runningCommands: runningCmds, mode: 'stop' },
        {
          stop: async (mod: any) => {
            const cmd = buildStartCommand(flow.type, mod.modulePath)
            ctx.log('warning', `停止 [${proj.name}] - ${mod.name} ...`)
            await ctx.invoke(IPC.process.stopScript, idx, cmd)
            await ctx.refreshRunningInfo()
            await runStop(ctx, idx)
          },
          stopAll: async () => {
            ctx.log('warning', `停止 [${proj.name}] 全部模块 ...`)
            await ctx.invoke(IPC.process.stop, idx)
            await ctx.refreshRunningInfo()
          },
        },
      )
      return
    }
  }

  ctx.log('warning', `停止 [${proj.name}] ...`)
  if (ctx.allSourcesMode) {
    await ctx.invoke(IPC.process.stopByPath, proj.path)
  } else {
    await ctx.invoke(IPC.process.stop, idx)
  }
  await ctx.refreshRunningInfo()
}

// 启动项目策略
export const startAction: ActionStrategy = {
  action: 'start',
  run: runStart,
}

// 停止项目策略
export const stopAction: ActionStrategy = {
  action: 'stop',
  run: runStop,
}
