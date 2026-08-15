/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\actions\project.ts
 * @Description: 项目管理类动作策略：打开目录、重命名、迁移、删除、端口详情
 */

import type { ActionContext, ActionStrategy } from '@/actions/types'
import { IPC } from '@/ipc/channels'

async function runOpen(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  await ctx.invoke(IPC.projectMgr.openFolder, proj.path)
}

async function runRename(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('重命名')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  const newName = await ctx.prompt('重命名项目', `修改 [${proj.name}] 的显示名称:`, proj.name)
  if (!newName || !newName.trim()) return
  const configPath = await ctx.invoke(IPC.project.getDefaultConfigPath)
  await ctx.invoke(IPC.projectMgr.rename, configPath, idx, newName.trim())
  await ctx.reloadProjects()
  ctx.success('项目已重命名')
}

async function runRemove(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('移除项目')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  const ok = await ctx.confirm('确认移除', `确认将 [${proj.name}] 从项目列表中移除？\n此操作不会删除项目文件。`)
  if (!ok) return
  const configPath = await ctx.invoke(IPC.project.getDefaultConfigPath)
  await ctx.invoke(IPC.projectMgr.remove, configPath, idx)
  await ctx.reloadProjects()
  ctx.success(`项目 [${proj.name}] 已从列表中移除`)
}

async function runDelete(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('物理删除')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  const ok = await ctx.confirm(
    '确认物理删除',
    `确认物理删除项目 [${proj.name}]？\n此操作将永久删除整个项目目录，不可恢复！`,
    true,
  )
  if (!ok) return
  const configPath = await ctx.invoke(IPC.project.getDefaultConfigPath)
  await ctx.invoke(IPC.projectMgr.delete, configPath, idx)
  await ctx.reloadProjects()
  ctx.success(`项目 [${proj.name}] 已物理删除`)
}

async function runMigrate(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('迁移项目')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  // 迁移目标在 open 与 confirm 回调之间传递
  const target = { idx, name: proj.name, path: proj.path }
  const vcsInfo = await ctx.invoke(IPC.vcs.info, idx)
  ctx.modals.migrate.open(
    { projectName: proj.name, projectPath: proj.path, svnInfo: vcsInfo, sources: ctx.getSources() },
    {
      confirm: (_mode: 'svn' | 'copy', _dir: string, _url: string) => {
        ctx.invoke(IPC.vcs.migrate, target.idx, {
          mode: _mode,
          targetDir: _dir,
          svnUrl: _url,
        })
      },
    },
  )
}

async function runViewPorts(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  const portList = ctx
    .getRunningInfo()
    .filter((r) => r.index === idx && r.port != null)
    .map((r) => ({ name: r.name, port: r.port!, modulePath: r.modulePath }))
  if (portList.length === 0) {
    ctx.log('info', `端口详情 [${proj.name}] — 无运行中的进程`)
    return
  }
  ctx.modals.submodulePort.open({ projectName: proj.name, portList })
}

// 打开项目目录策略
export const openAction: ActionStrategy = {
  action: 'open',
  run: runOpen,
}

// 重命名项目策略
export const renameAction: ActionStrategy = {
  action: 'rename',
  run: runRename,
}

// 移除项目策略
export const removeAction: ActionStrategy = {
  action: 'remove',
  run: runRemove,
}

// 物理删除项目策略
export const deleteAction: ActionStrategy = {
  action: 'delete',
  run: runDelete,
}

// 迁移项目策略
export const migrateAction: ActionStrategy = {
  action: 'migrate',
  run: runMigrate,
}

// 查看端口详情策略
export const viewPortsAction: ActionStrategy = {
  action: 'viewPorts',
  run: runViewPorts,
}
