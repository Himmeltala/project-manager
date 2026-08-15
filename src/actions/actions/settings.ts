/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\actions\settings.ts
 * @Description: 项目配置动作策略：代理、端口、Java/Maven/Gradle/Tomcat 版本、WAR 名称
 */

import type { ActionContext, ActionStrategy } from '@/actions/types'
import { IPC } from '@/ipc/channels'

import { getCapabilities } from '@/composables/useProjectType'

// 主目录选择器的目标配置，在 open 与 confirm 回调之间共享
let selectorTarget = { idx: 0, key: '' as string }

async function onSelectorConfirm(ctx: ActionContext, path: string): Promise<void> {
  const { idx, key } = selectorTarget
  const configPath = await ctx.invoke(IPC.project.getDefaultConfigPath)
  const existing = await ctx.invoke<any[]>(IPC.project.load, configPath)
  const proj = existing[idx - 1]
  if (!proj) return
  ;(proj as any)[key] = path
  await ctx.invoke(IPC.project.save, configPath, existing)
  await ctx.reloadProjects()
  ctx.success('已保存')
}

async function runProxy(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  ctx.modals.proxy.open({ projectName: proj.name, projectPath: proj.path })
}

async function runProxyPort(ctx: ActionContext, idx: number): Promise<void> {
  const proj = ctx.getProject(idx)
  if (!proj) return
  ctx.modals.port.open({ projectName: proj.name, projectPath: proj.path })
}

async function runSetJava(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('修改 Java 版本')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  const homes = await ctx.invoke(IPC.system.getJavaHomes)
  if (homes.length === 0) {
    ctx.warning('未发现已安装的 JDK')
    return
  }
  selectorTarget = { idx, key: 'javaHome' }
  ctx.modals.selector.open(
    { dialogTitle: 'Java 版本', currentValue: proj.javaHome || '', homes },
    { confirm: (path: string) => onSelectorConfirm(ctx, path) },
  )
}

async function runSetMaven(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('修改 Maven 版本')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  const homes = await ctx.invoke(IPC.system.getMavenHomes)
  selectorTarget = { idx, key: 'mavenHome' }
  ctx.modals.selector.open(
    { dialogTitle: 'Maven 版本', currentValue: proj.mavenHome || '', homes },
    { confirm: (path: string) => onSelectorConfirm(ctx, path) },
  )
}

async function runSetGradle(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('修改 Gradle 版本')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  const homes = await ctx.invoke(IPC.system.getGradleHomes)
  selectorTarget = { idx, key: 'gradleHome' }
  ctx.modals.selector.open(
    { dialogTitle: 'Gradle 版本', currentValue: proj.gradleHome || '', homes },
    { confirm: (path: string) => onSelectorConfirm(ctx, path) },
  )
}

async function runSetTomcat(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('修改 Tomcat 版本')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  const homes = await ctx.invoke(IPC.system.getTomcatHomes)
  selectorTarget = { idx, key: 'tomcatHome' }
  ctx.modals.selector.open(
    { dialogTitle: 'Tomcat 版本', currentValue: proj.tomcatHome || '', homes },
    { confirm: (path: string) => onSelectorConfirm(ctx, path) },
  )
}

async function runSetWarName(ctx: ActionContext, idx: number): Promise<void> {
  if (ctx.warnAllSources('修改 WAR 名称')) return
  const proj = ctx.getProject(idx)
  if (!proj) return
  // 仅 flow 声明了 warName 设置项的项目类型允许修改
  const flow = getCapabilities(proj.projectType)
  if (!flow.menu.typeActions?.some((a) => a.id === 'warName')) return
  const name = await ctx.prompt('WAR 名称', `WAR 名称（不含 .war 后缀）:`, proj.tomcatWarName)
  if (name === null) return
  const configPath = await ctx.invoke(IPC.project.getDefaultConfigPath)
  const existing = await ctx.invoke<any[]>(IPC.project.load, configPath)
  const p = existing[idx - 1]
  if (!p) return
  p.tomcatWarName = name
  await ctx.invoke(IPC.project.save, configPath, existing)
  await ctx.reloadProjects()
  ctx.success('WAR 名称已修改')
}

// 打开代理配置弹窗
export const proxyAction: ActionStrategy = {
  action: 'proxy',
  run: runProxy,
}

// 打开端口配置弹窗
export const proxyPortAction: ActionStrategy = {
  action: 'proxyPort',
  run: runProxyPort,
}

// 选择 Java 版本
export const setJavaAction: ActionStrategy = {
  action: 'java',
  run: runSetJava,
}

// 选择 Maven 版本
export const setMavenAction: ActionStrategy = {
  action: 'maven',
  run: runSetMaven,
}

// 选择 Gradle 版本
export const setGradleAction: ActionStrategy = {
  action: 'gradle',
  run: runSetGradle,
}

// 选择 Tomcat 版本
export const setTomcatAction: ActionStrategy = {
  action: 'tomcat',
  run: runSetTomcat,
}

// 设置 WAR 名称
export const setWarNameAction: ActionStrategy = {
  action: 'warName',
  run: runSetWarName,
}
