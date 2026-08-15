/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\actions\build.ts
 * @Description: 构建、安装依赖与清理动作策略
 */

import type { ActionContext, ActionStrategy } from '@/actions/types'
import { IPC } from '@/ipc/channels'

import { getCapabilities } from '@/composables/useProjectType'

async function runBuild(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('构建操作')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  // 构建目标在 open 与 confirm 回调之间传递
  const target = {
    idx,
    name: proj.name,
    path: proj.path,
    type: proj.projectType,
    scripts: {} as Record<string, string>,
  }
  try {
    const taskInfo = await ctx.invoke(IPC.projectMgr.getTaskList, idx)
    target.scripts = taskInfo?.tasks || {}
  } catch {
    // ignore
  }
  const flow = getCapabilities(target.type)
  const buildCommands = flow.buildCommands.length > 0 ? flow.buildCommands : undefined
  ctx.modals.build.open(
    {
      projectName: target.name,
      projectPath: target.path,
      projectType: target.type,
      scripts: target.scripts,
      buildCommands,
    },
    {
      confirm: (_cmd: string, _zip: string) => {
        ctx.log('info', `[${target.name}] 构建命令: ${_cmd}`)
        ctx.invoke(IPC.projectMgr.build, target.idx, _cmd, _zip || undefined)
        ctx.log('success', `[${target.name}] 构建任务已启动`)
      },
    },
  )
}

async function runInstall(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('安装依赖')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  // 安装目标在 open 与 confirm 回调之间传递
  const target = { idx, name: proj.name, type: proj.projectType }
  ctx.modals.install.open(
    { projectName: target.name, projectType: target.type },
    {
      confirm: (_cmd: string) => {
        ctx.log('info', `[${target.name}] 安装命令: ${_cmd}`)
        ctx.invoke(IPC.projectMgr.runTask, target.idx, _cmd)
        ctx.log('success', `[${target.name}] 安装依赖已启动`)
      },
    },
  )
}

async function runClean(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('清理操作')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  const artifacts = await ctx.invoke(IPC.projectMgr.scanBuildArtifacts, idx)
  if (artifacts.length === 0) {
    ctx.info('没有可清理的构建产物')
    return
  }
  // 清理目标序号在 open 与 confirm 回调之间传递
  const cleanIdx = idx
  ctx.modals.clean.open(
    { projectName: proj.name, items: artifacts },
    {
      confirm: (_paths: string[]) => {
        ctx.invoke(IPC.projectMgr.cleanArtifacts, cleanIdx, _paths)
        ctx.log('success', `已清理 ${_paths.length} 项`)
      },
    },
  )
}

async function runCleanModules(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('清理依赖')) return
  const dirs = await ctx.invoke(IPC.projectMgr.getDependencyDirs, idx)
  if (dirs.length === 0) {
    ctx.info('没有可清理的依赖目录')
    return
  }
  const dirList = dirs.map((d: any) => `${d.name}: ${d.path}`).join('\n')
  const ok = await ctx.confirm('确认清理', `确认删除以下依赖目录？\n\n${dirList}`)
  if (!ok) return
  await ctx.invoke(IPC.projectMgr.cleanDependencies, idx)
  ctx.log('success', '依赖目录清理完成')
}

// 构建项目策略
export const buildAction: ActionStrategy = {
  action: 'build',
  run: runBuild,
}

// 安装依赖策略
export const installAction: ActionStrategy = {
  action: 'install',
  run: runInstall,
}

// 清理构建产物策略
export const cleanAction: ActionStrategy = {
  action: 'clean',
  run: runClean,
}

// 清理依赖目录策略
export const cleanModulesAction: ActionStrategy = {
  action: 'cleanModules',
  run: runCleanModules,
}
