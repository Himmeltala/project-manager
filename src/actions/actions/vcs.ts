/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\actions\vcs.ts
 * @Description: 版本控制动作策略：更新、日志、提交、仓库浏览器、检查变更
 */

import type { ActionContext, ActionStrategy } from '@/actions/types'
import { IPC } from '@/ipc/channels'

async function runVcsUpdate(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  await ctx.invoke(IPC.vcs.updateByPath, proj.path, proj.name)
}

async function runVcsLog(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  const opened = await ctx.invoke(IPC.vcs.openLogGuiByPath, proj.path)
  if (!opened) {
    ctx.info(`[${proj.name}] 未发现 GUI 客户端，使用命令行输出`)
  }
}

async function runVcsCommit(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  const opened = await ctx.invoke(IPC.vcs.openCommitGuiByPath, proj.path)
  if (!opened) ctx.error(`[${proj.name}] 未发现 GUI 客户端`)
}

async function runVcsRepoBrowser(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  const opened = await ctx.invoke(IPC.vcs.openRepoBrowserByPath, proj.path)
  if (!opened) ctx.error(`[${proj.name}] 未发现 TortoiseSVN`)
}

async function runVcsCheck(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  const vcs = await ctx.invoke(IPC.vcs.detect, proj.path)
  if (!vcs) {
    ctx.info(`[${proj.name}] 不是版本控制项目`)
    return
  }
  const [remote, local] = await Promise.all([
    ctx.invoke(IPC.vcs.checkRemote, [{ name: proj.name, path: proj.path }]),
    ctx.invoke(IPC.vcs.checkLocal, [{ name: proj.name, path: proj.path }]),
  ])
  const total = remote.length + local.length
  if (total > 0) ctx.warning(`[${proj.name}] ${total} 项变更`)
  else ctx.info(`[${proj.name}] 没有发现变更`)
  await ctx.refreshNotifications()
}

// 获取更新策略
export const vcsUpdateAction: ActionStrategy = {
  action: 'vcsUpdate',
  run: runVcsUpdate,
}

// 查看提交日志策略
export const vcsLogAction: ActionStrategy = {
  action: 'vcsLog',
  run: runVcsLog,
}

// 查看提交策略
export const vcsCommitAction: ActionStrategy = {
  action: 'vcsCommit',
  run: runVcsCommit,
}

// 打开仓库浏览器策略
export const vcsRepoBrowserAction: ActionStrategy = {
  action: 'vcsRepoBrowser',
  run: runVcsRepoBrowser,
}

// 检查变更策略
export const vcsCheckAction: ActionStrategy = {
  action: 'vcsCheck',
  run: runVcsCheck,
}
