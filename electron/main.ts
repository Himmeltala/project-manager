/*
 * @Author: zhengrenfu
 * @Date: 2026-09-03
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \electron\main.ts
 * @Description: 主进程入口，负责窗口创建、IPC 注册与后台任务编排
 */
// #region Imports
import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron'
import { SETTINGS_KEYS } from '@/ipc/keys'
import { IPC, IPC_EVENT } from '@/ipc/channels'

import { join, resolve, dirname, basename } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdtempSync, readdirSync, rmSync, statSync } from 'fs'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

// 服务层
import { ProcessManager } from '@electron/services/runtime/process-manager.service'
import { isUncPath, wrapCmdForUnc } from '@electron/services/runtime/unc-shell'
import { ProjectService } from '@electron/services/project/project.service'
import { SourceManager } from '@electron/services/project/source-manager.service'
import { TaskService } from '@electron/services/runtime/task.service'
import { OperationRunner, createTaskOpCtx } from '@electron/services/runtime/operation-runner.service'
import { NotificationService } from '@electron/services/notification.service'
import { UpdateService } from '@electron/services/update.service'
import { AppSettings } from '@electron/services/core/settings.service'
import { ProjectRepository } from '@electron/services/project/project-repository.service'
import { vcsRegistry } from '@electron/services/version-control/registry'
import { SvnProvider } from '@electron/services/version-control/svn/index'
import { GitProvider } from '@electron/services/version-control/git/index'
import type { SettingsGetter, VcsUpdateResult, VcsCheckResult } from '@electron/services/version-control/registry'
import { ensureDataDir, getSourceRoot, scanDataDir, deleteItem } from '@electron/services/core/data-dir.service'
import { createStore, storeGet, storeSet, storeDelete, storeKeys } from '@electron/services/core/store.service'
import type { Store } from '@electron/services/core/store.service'
import { detectBuildTools } from '@electron/services/project-type/npm/build-tool/index'
import {
  discoverJavaHomes,
  discoverMavenHomes,
  discoverTomcatHomes,
  discoverGradleHomes,
} from '@electron/services/tool-discovery.service'
import { detectConfigFilePath } from '@electron/services/tool-discovery.service'
import { detectAndReadPort, updatePort } from '@electron/services/project-type/npm/port-config/index'
import { detectAndReadProxies, updateProxyTargets } from '@electron/services/project-type/npm/proxy-config/index'
import { projectTypeRegistry } from '@electron/services/project-type/registry'
// #endregion

/* ESM 下 __dirname 不可用，通过 import.meta.url 派生 */
const __dirname = dirname(fileURLToPath(import.meta.url))

// 开发环境用项目根目录，打包后用 resources 目录
function getSourceRootDir(): string {
  if (app.isPackaged) return process.resourcesPath
  return resolve(__dirname, '..')
}

const APP_NAME = '项目管理器'
// #region Services & State
let mainWindow: BrowserWindow | null = null
let settings: AppSettings
let sourceMgr: SourceManager
let projectService: ProjectService
let taskService: TaskService
let processMgr: ProcessManager
let notificationService: NotificationService
let opRunner: OperationRunner
let updateService: UpdateService
let appVersion: string
let store: Store

// 输出缓冲（50ms 窗口批量发送）
let outputBuffer: any[] = []
let outputFlushTimer: NodeJS.Timeout | null = null
let droppedOutputCount = 0
const MAX_OUTPUT_BUFFER = 500

// VCS 定时检查
let remoteCheckTimer: NodeJS.Timeout | null = null
let localCheckTimer: NodeJS.Timeout | null = null

// 拉取项目执行标记，为 true 时禁止切换、刷新或扫描项目源，避免与拉取快照错位
let vcsPullInProgress = false

// 手动检查更新执行标记，为 true 时拒绝重复触发；与定时自动检查并发运行无副作用，不做互斥
let vcsCheckInProgress = false

function flushOutputBuffer() {
  if (outputBuffer.length > 0) {
    mainWindow?.webContents.send(IPC_EVENT.outputBatch, outputBuffer)
    outputBuffer = []
  }
  outputFlushTimer = null
}
// #endregion

// #region Helpers
function parseArgs(input: string): string[] {
  const result: string[] = []
  const re = /[^\s"']+|"([^"]*)"|'([^']*)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    result.push(m[1] || m[2] || m[0])
  }
  return result
}

function cleanOldTermScripts(): void {
  try {
    const tmp = tmpdir()
    for (const name of readdirSync(tmp)) {
      if (!name.startsWith('term-')) continue
      const full = join(tmp, name)
      try {
        const stat = statSync(full)
        if (Date.now() - stat.mtimeMs > 3600000) rmSync(full, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * 判断终端程序是否依赖 cmd 解释器执行（cmd.exe 本体或以 .bat/.cmd 脚本作为入口），
 * cmd 无法将 UNC 网络路径作为当前目录使用，此类终端在 UNC 项目下需要 pushd 包装
 * @param termPath 终端可执行文件路径
 * @returns 是否为 cmd 家族终端
 */
function isCmdTerminal(termPath: string): boolean {
  const base = basename(termPath).toLowerCase()
  return base === 'cmd' || base === 'cmd.exe' || base.endsWith('.bat') || base.endsWith('.cmd')
}

/**
 * 将 UNC 网络路径转换为 msys 环境可识别的正斜杠路径，
 * 首段双反斜杠改写为双正斜杠，其余反斜杠改写为正斜杠
 * @param uncPath UNC 网络路径，调用方需保证以双反斜杠开头
 * @returns msys 环境使用的路径
 */
function toMsysPath(uncPath: string): string {
  return `//${uncPath.slice(2).replace(/\\/g, '/')}`
}

/**
 * 按版本控制类型分组执行批量检查，每个命中项目生成一条持久通知，
 * count 小于 0 的检查失败标记条目不生成通知，保持自动检查对失败静默的既有行为
 * @param checkFn 具体检查函数，按提供者分组后调用，返回命中与失败结果列表
 * @param notificationType 命中项目的通知类型，如 vcs_remote、local_changes
 * @param titlePrefix 命中项目通知标题的前缀
 * @param onResults 可选回调，逐组透出本轮完整结果（含失败标记条目），供调用方区分命中与失败
 * @returns 所有分组检查全部完成后结束
 */
async function executeVcsChecks(
  checkFn: (vcs: any, projects: { name: string; path: string }[]) => Promise<VcsCheckResult[]>,
  notificationType: string,
  titlePrefix: string,
  onResults?: (results: VcsCheckResult[]) => void,
): Promise<void> {
  const projects = projectService.projects.map((p) => ({ name: p.name, path: p.path }))
  if (projects.length === 0) return
  const detectionResults = await vcsRegistry.detectBatch(projects)
  const grouped: Map<any, { name: string; path: string }[]> = new Map()
  for (let i = 0; i < projects.length; i++) {
    const provider = detectionResults[i]
    if (!provider) continue
    const list = grouped.get(provider) || []
    list.push(projects[i])
    grouped.set(provider, list)
  }
  const tasks = Array.from(grouped.entries()).map(async ([vcs, projs]) => {
    const results = await checkFn(vcs, projs)
    for (const r of results) {
      // count 小于 0 表示该条是项目检查失败标记，不生成命中通知
      if (r.count < 0) continue
      notificationService.createNotification(
        notificationType as any,
        `${titlePrefix}: ${r.projectName}`,
        r.summary,
        r.projectName,
        true,
      )
    }
    // 完整结果原样透出回调，由手动检查任务区分命中与失败
    if (onResults) onResults(results)
  })
  await Promise.all(tasks)
}

function startRemoteCheckTimer(intervalMinutes: number): void {
  if (remoteCheckTimer) clearInterval(remoteCheckTimer)
  remoteCheckTimer = setInterval(() => {
    executeVcsChecks((vcs, projs) => vcs.checkRemote(projs), 'vcs_remote', '远程有更新')
  }, intervalMinutes * 60000)
}

function startLocalCheckTimer(intervalMinutes: number): void {
  if (localCheckTimer) clearInterval(localCheckTimer)
  localCheckTimer = setInterval(() => {
    executeVcsChecks((vcs, projs) => vcs.checkLocal(projs), 'local_changes', '本地有未提交变更')
  }, intervalMinutes * 60000)
}

function stopVcsChecks(): void {
  if (remoteCheckTimer) clearInterval(remoteCheckTimer)
  if (localCheckTimer) clearInterval(localCheckTimer)
}

function autoStartVcsChecks(): void {
  const remoteEnabled = settings.get(SETTINGS_KEYS.scheduledChecks.remoteEnabled, false)
  const localEnabled = settings.get(SETTINGS_KEYS.scheduledChecks.localEnabled, false)
  if (remoteEnabled) {
    const interval = settings.get(SETTINGS_KEYS.scheduledChecks.remoteIntervalMinutes, 30)
    startRemoteCheckTimer(interval)
  }
  if (localEnabled) {
    const interval = settings.get(SETTINGS_KEYS.scheduledChecks.localIntervalMinutes, 15)
    startLocalCheckTimer(interval)
  }
}
// #endregion

// #region Settings live re-apply
/**
 * 设置项保存后即时下发生效，避免部分配置只在启动时读取一次、改动需重启才生效
 * @param key 设置键
 * @param value 新的设置值
 */
function applySettingLive(key: string, value: unknown): void {
  switch (key) {
    case SETTINGS_KEYS.theme:
      // 主题即时切换，沿用原有事件通道通知渲染层
      mainWindow?.webContents.send(IPC_EVENT.themeChanged, value)
      break
    case SETTINGS_KEYS.tasks.maxConcurrency:
      // 任务并发上限实时更新，排队中的任务按新上限逐批启动
      taskService.setMaxConcurrency(Number(value))
      break
    case SETTINGS_KEYS.protectedPorts:
      // 保护端口名单实时更新，后续的杀端口请求按新名单拦截
      processMgr.setProtectedPorts(String(value ?? ''))
      break
    case SETTINGS_KEYS.update.url:
      // 更新源地址实时生效；检查类型与检查频率按产品设计仍保持启动时读取
      updateService.setUrl(String(value ?? ''))
      break
    default:
      break
  }
  // 定时检查类设置统一先停再启，使改动立即生效。
  // 停止与启动均为幂等操作，与设置弹窗内的重复重启并存时最终状态一致
  const scheduledKeys = Object.values(SETTINGS_KEYS.scheduledChecks) as string[]
  if (scheduledKeys.includes(key)) {
    stopVcsChecks()
    autoStartVcsChecks()
  }
}
// #endregion

// #region Window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    minWidth: 1000,
    minHeight: 500,
    title: APP_NAME,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.maximize()
    autoStartVcsChecks()
  })

  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  setupMenu()
  setupEventForwarding()
  registerIpc()

  if (updateService) {
    updateService.startupCheck(settings)
  }
}
// #endregion

// #region Menu
function setupMenu(): void {
  const send = (action: string) => mainWindow?.webContents.send(IPC_EVENT.menu, { action })
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '版本控制',
      submenu: [
        { label: '范围更新', click: () => send('vcsRange') },
        { label: '范围检查', click: () => send('vcsCheckRange') },
      ],
    },
    {
      label: '文件',
      submenu: [
        { label: '设置', click: () => send('settings') },
        { label: '数据目录管理', click: () => send('dataDir') },
      ],
    },
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
// #endregion

// #region IPC Event Forwarding
function setupEventForwarding(): void {
  if (!projectService || !mainWindow) return

  projectService.on('outputLine', (data) => {
    if (outputBuffer.length >= MAX_OUTPUT_BUFFER) {
      droppedOutputCount++
      if (droppedOutputCount === 1 || droppedOutputCount % 100 === 0) {
        outputBuffer.push({
          index: data.index,
          name: '[系统]',
          line: `输出过快，已丢弃 ${droppedOutputCount} 行`,
        })
      }
      return
    }
    outputBuffer.push(data)
    if (!outputFlushTimer) {
      outputFlushTimer = setTimeout(flushOutputBuffer, 50)
    }
  })
  projectService.on('projectStarted', (data) => {
    mainWindow?.webContents.send(IPC_EVENT.projectStarted, data)
    notificationService.createNotification('info', `项目已启动: ${data.name}`, '', data.name)
  })
  projectService.on('projectStopped', (data) => {
    mainWindow?.webContents.send(IPC_EVENT.projectStopped, data)
    notificationService.createNotification('warning', `项目已停止: ${data.name}`, '', data.name)
  })
  projectService.on('portDetected', (data) => {
    mainWindow?.webContents.send(IPC_EVENT.portDetected, data)
  })
}
// #endregion

// #region IPC Registration
function registerIpc(): void {
  // ── project ──
  ipcMain.handle(IPC.project.load, (_e, configPath) => ProjectRepository.load(configPath))
  ipcMain.handle(IPC.project.loadAll, () => {
    const allSources = sourceMgr.listSources(false)
    const allProjects: any[] = []
    for (const src of allSources) {
      const projects = ProjectRepository.load(src.configPath)
      for (const p of projects) allProjects.push({ ...p, _source: src.name })
    }
    return allProjects
  })
  ipcMain.handle(IPC.project.save, (_e, configPath, projects) => {
    ProjectRepository.save(configPath, projects)
  })
  ipcMain.handle('project:discover', async (_e, rootDir) => ProjectRepository.discover(rootDir))
  ipcMain.handle(IPC.project.getDefaultConfigPath, () => sourceMgr.getActiveConfigPath())
  ipcMain.handle(IPC.project.detectConfigFile, (_e, projectPath: string) => detectConfigFilePath(projectPath, settings))

  /* 获取 Maven/Gradle 多模块项目中可运行的子模块列表（按路径解析，避免"所有源"模式序号错位） */
  ipcMain.handle(IPC.project.getRunnableModules, (_e, path: string, type: string) => {
    if (!path) return []
    const provider = projectTypeRegistry.get(type)
    const modules = provider?.detectRunnableModules?.(path) ?? []
    return modules
  })

  // ── source ──
  ipcMain.handle(IPC.source.list, (_e, includeCounts) => sourceMgr.listSources(includeCounts))
  ipcMain.handle(IPC.source.getActive, () => sourceMgr.getActiveSourceName())
  ipcMain.handle('source:getActiveInfo', () => sourceMgr.getActiveSource())
  ipcMain.handle(IPC.source.switch, (_e, name) => {
    // 拉取项目执行期间禁止切换项目源
    if (vcsPullInProgress) return false
    if (sourceMgr.switchSource(name)) {
      const configPath = sourceMgr.getActiveConfigPath()
      const projects = ProjectRepository.load(configPath)
      projectService.refreshProjects(projects)
      settings.lastSource = name
      return true
    }
    return false
  })
  ipcMain.handle('source:add', (_e, name, configPath, sourceType, extra) =>
    sourceMgr.addSource(name, configPath, sourceType, extra),
  )
  ipcMain.handle(IPC.source.rename, (_e, oldName, newName) => sourceMgr.renameSource(oldName, newName))
  ipcMain.handle(IPC.source.remove, (_e, name) => sourceMgr.removeSource(name))
  ipcMain.handle('source:createFromDir', async (_e, name, directory) =>
    sourceMgr.createSourceFromDirectory(name, directory),
  )
  ipcMain.handle(IPC.source.startScanTask, (_e, name, directory) => {
    // 拉取项目执行期间禁止扫描并切换到新项目源
    if (vcsPullInProgress) return false
    const taskId = taskService.addTask(`扫描项目源: ${name}`, async (report) => {
      report('正在扫描目录...', 10)
      const ok = await sourceMgr.createSourceFromDirectory(name, directory)
      if (!ok) throw new Error('创建项目源失败，请检查目录是否存在、名称是否重复、目录中是否包含项目')
      report('项目源已创建', 60)
      const source = sourceMgr.getSource(name)
      let count = 0
      if (source && source.configPath) {
        try {
          count = JSON.parse(readFileSync(source.configPath, 'utf-8')).length
        } catch {
          /* ignore */
        }
      }
      report(`发现 ${count} 个项目`, 70)
      if (!sourceMgr.switchSource(name)) throw new Error(`切换到项目源 ${name} 失败`)
      report('已切换到新项目源', 85)
      const configPath = sourceMgr.getActiveConfigPath()
      const projects = ProjectRepository.load(configPath)
      projectService.refreshProjects(projects)
      notificationService.createNotification(
        'info',
        `项目源扫描完成: ${name}`,
        count > 0 ? `目录中发现 ${count} 个项目` : '项目源已就绪',
      )
      report(`扫描完成，共 ${count} 个项目`, 100)
    })
    return taskId
  })
  ipcMain.handle(IPC.source.refreshCurrent, (_e, name) => {
    // 拉取项目执行期间禁止刷新项目源，避免活列表变化与拉取快照错位
    if (vcsPullInProgress) return false
    const sourceName = name || sourceMgr.getActiveSourceName()
    taskService.addTask(`刷新项目源: ${sourceName}`, async (report) => {
      report(`正在刷新项目源: ${sourceName}`, 10)
      const ok = await sourceMgr.refreshCurrentSource(name)
      if (!ok) throw new Error('刷新失败，请确认源配置有效（目录源需 rootDir 存在）')
      report('项目配置已更新', 60)
      const source = name ? sourceMgr.getSource(name) : null
      const configPath = source?.configPath || sourceMgr.getActiveConfigPath()
      const projects = ProjectRepository.load(configPath)
      projectService.refreshProjects(projects)
      report(`刷新完成，共 ${projects.length} 个项目`, 100)
    })
    return true
  })

  // 拉取当前项目源中的所有版本控制项目，逐个执行 svn update 或 git pull
  ipcMain.handle(IPC.vcs.pullProjects, async (_e) => {
    // 已有拉取任务在执行时拒绝重复触发
    if (vcsPullInProgress) {
      notificationService.createNotification('warning', '已有拉取任务在执行', '')
      return null
    }
    const sourceName = sourceMgr.getActiveSourceName()
    // 快照当前源中检测到 VCS 的项目，执行期间不读取活列表，避免与刷新并发错位
    const targets: { name: string; path: string; label: string }[] = []
    for (const p of projectService.projects) {
      const provider = vcsRegistry.detect(p.path)
      if (provider) targets.push({ name: p.name, path: p.path, label: provider.label })
    }
    if (targets.length === 0) {
      notificationService.createNotification('warning', '当前项目源没有可拉取的版本控制项目', '')
      return null
    }
    vcsPullInProgress = true
    const total = targets.length
    const taskId = taskService.addTask(`拉取项目: ${sourceName}`, async (report) => {
      let success = 0
      let conflict = 0
      const failed: string[] = []
      try {
        report(`开始拉取项目源: ${sourceName}，共 ${total} 个项目`, 5)
        for (let cur = 1; cur <= total; cur++) {
          const target = targets[cur - 1]
          // 项目执行前先做边界上报：任务取消在此抛出，实现项目之间即时中止
          report(`拉取 [${cur}/${total}]: ${target.name}`)
          // 项目级上下文：内部行与百分比统一折算为整体进度，文案带项目序号前缀
          const ctx = createTaskOpCtx(report, {
            initialMessage: `拉取 [${cur}/${total}]: ${target.name}`,
            formatLine: (line) => `拉取 [${cur}/${total}] ${target.name}: ${line}`,
            mapPercent: (inner) => Math.floor(((cur - 1 + inner / 100) / total) * 100),
          })
          let result: VcsUpdateResult
          try {
            // 透传进度钩子，长任务内部的行与百分比实时折算到整体进度条
            result = await projectService.vcsUpdateByPath(target.path, target.name, {
              onLine: ctx.line,
              onPercent: ctx.percent,
            })
          } finally {
            // 项目结束后停用上下文，防止遗留节流定时器串扰下一个项目
            ctx.dispose()
          }
          // report 在任务取消时抛错，拉取在项目边界处中止
          if (result.status === 'ok') {
            success++
            mainWindow?.webContents.send(IPC_EVENT.output, {
              type: 'success',
              text: `[${cur}/${total}] ${target.name}: ${target.label}拉取完成`,
            })
            report(`拉取 [${cur}/${total}] ${target.name}: ${target.label}拉取完成`, Math.floor((cur / total) * 100))
          } else if (result.status === 'conflict') {
            conflict++
            notificationService.createNotification(
              'vcs_conflict',
              `${target.label} 冲突: ${target.name}`,
              '拉取完成后存在合并冲突，请手动解决',
              target.name,
              true,
            )
            mainWindow?.webContents.send(IPC_EVENT.output, {
              type: 'warning',
              text: `[${cur}/${total}] ${target.name}: ${target.label}拉取完成，存在合并冲突`,
            })
            report(
              `拉取 [${cur}/${total}] ${target.name}: ${target.label}存在合并冲突，需手动解决`,
              Math.floor((cur / total) * 100),
            )
          } else {
            const firstLine =
              (result.text || '')
                .split('\n')
                .find((line) => line.trim())
                ?.trim() || ''
            failed.push(`${target.name}: ${firstLine || result.text || '未知错误'}`)
            mainWindow?.webContents.send(IPC_EVENT.output, {
              type: 'error',
              text: `[${cur}/${total}] ${target.name}: ${target.label}拉取失败`,
            })
            report(`拉取 [${cur}/${total}] ${target.name}: ${target.label}拉取失败`, Math.floor((cur / total) * 100))
          }
        }
        if (failed.length > 0) {
          report(`拉取结束: 共 ${total} 个，成功 ${success}，冲突 ${conflict}，失败 ${failed.length}`, 100)
          // 抛错后由任务框架触发 taskFailed，自动生成错误通知与错误日志
          throw new Error(`拉取失败 ${failed.length} 个项目: ${failed.join('；')}`)
        }
        report(`拉取完成: 共 ${total} 个，成功 ${success}，冲突 ${conflict}`, 100)
      } finally {
        // 任务结束（含失败与取消）后释放标记，允许后续再次拉取
        vcsPullInProgress = false
      }
    })
    return taskId
  })

  // 手动检查当前项目源中所有版本控制项目的远程更新，命中的每个项目生成一条持久通知
  ipcMain.handle(IPC.vcs.checkUpdates, async () => {
    // 已有手动检查任务在执行时拒绝重复触发；定时自动检查与其并发运行无副作用，不做互斥
    if (vcsCheckInProgress) {
      notificationService.createNotification('warning', '已有检查任务在执行', '')
      return null
    }
    const sourceName = sourceMgr.getActiveSourceName()
    // 快照当前源的全部项目，非版本控制项目由执行函数内部跳过
    const targets = projectService.projects.map((p) => ({ name: p.name, path: p.path }))
    if (targets.length === 0) {
      notificationService.createNotification('warning', '当前项目源没有可检查的项目', '')
      return null
    }
    // 先置标记再注册任务，避免任务排队期间重复触发；标记由任务目标收尾时释放
    vcsCheckInProgress = true
    const total = targets.length
    const taskId = taskService.addTask(`检查更新: ${sourceName}`, async (report) => {
      let found = 0
      const failed: VcsCheckResult[] = []
      try {
        report(`开始检查项目源: ${sourceName}，共 ${total} 个项目`, 5)
        // 项目级循环在各提供者内部执行，任务卡片仅上报里程碑进度，
        // 任务取消只在里程碑边界生效，检查为短耗时网络操作，可接受
        await executeVcsChecks(
          (vcs, projs) => vcs.checkRemote(projs),
          'vcs_remote',
          '远程有更新',
          (results) => {
            // count 小于 0 的失败标记条目不计入命中数量，逐条输出一行错误日志，
            // 避免全部检查失败时误报"未发现远程更新"
            for (const r of results) {
              if (r.count < 0) {
                failed.push(r)
                mainWindow?.webContents.send(IPC_EVENT.output, {
                  type: 'error',
                  text: `[检查更新] ${r.projectName}: 检查失败，${r.summary}`,
                })
              } else {
                found++
              }
            }
          },
        )
        // 命中项目的逐条通知已由执行函数生成，此处按命中与失败组合收尾
        if (found > 0) {
          const failText = failed.length > 0 ? `，${failed.length} 个项目检查失败` : ''
          report(`检查完成: ${total} 个项目，发现 ${found} 个项目有远程更新，已生成通知${failText}`, 100)
          mainWindow?.webContents.send(IPC_EVENT.output, {
            type: failed.length > 0 ? 'warning' : 'success',
            text: `[检查更新] ${sourceName}: ${found} 个项目有远程更新${failText}`,
          })
        } else if (failed.length > 0) {
          // 全部检查失败时不输出"未发现更新"的成功日志，失败明细已逐条写入日志面板
          report(`检查完成: ${failed.length} 个项目检查失败，详见日志`, 100)
        } else {
          report('检查完成: 未发现远程更新', 100)
          mainWindow?.webContents.send(IPC_EVENT.output, {
            type: 'success',
            text: `[检查更新] ${sourceName}: 未发现远程更新`,
          })
        }
      } finally {
        // 任务结束（含失败与取消）后释放标记，允许再次发起手动检查
        vcsCheckInProgress = false
      }
    })
    return taskId
  })

  // ── process (lifecycle) ──
  ipcMain.handle(IPC.process.start, async (_e, idx, command) => projectService.start(idx, command))
  ipcMain.handle(IPC.process.startByPath, async (_e, path, command) => projectService.startByPath(path, command))
  ipcMain.handle(IPC.process.stop, async (_e, idx) => projectService.stop(idx))
  ipcMain.handle(IPC.process.stopByPath, async (_e, path) => projectService.stopByPath(path))
  ipcMain.handle(IPC.process.stopScript, async (_e, idx, command) => projectService.stopScript(idx, command))
  ipcMain.handle('process:isRunning', (_e, idx) => projectService.isRunning(idx))
  ipcMain.handle(IPC.process.getRunningInfo, () => projectService.getRunningInfo())
  ipcMain.handle(IPC.process.getAllRunningPaths, () => projectService.getAllRunningPaths())
  ipcMain.handle(IPC.process.getTotalScriptsCount, () => projectService.getTotalScriptsCount())
  ipcMain.handle(IPC.process.getAllRunningScripts, () => projectService.getAllRunningScripts())
  ipcMain.handle(IPC.process.killPort, async (_e, port) => {
    const ok = processMgr.killPort(port)
    if (ok)
      taskService.addTask(`杀端口:${port}`, async (report) => {
        report(`端口 ${port} 进程已终止`, 100)
      })
    return ok
  })
  ipcMain.handle(IPC.process.listByPort, async (_e, port) => processMgr.listByPort(port))
  ipcMain.handle(IPC.process.killPid, async (_e, pid) => processMgr.killPid(pid))
  ipcMain.handle('process:stopAll', () => projectService.stopAll())

  // ── build ──
  ipcMain.handle('projectMgr:resolveTarget', (_e, target) => projectService.resolveTarget(target))
  ipcMain.handle('projectMgr:getByIndex', (_e, idx) => projectService.getProjectByIndex(idx))
  ipcMain.handle(IPC.projectMgr.remove, (_e, configPath, idx) => {
    const ok = projectService.removeProject(idx)
    if (ok) ProjectRepository.save(configPath, projectService.projects)
    return ok
  })
  ipcMain.handle(IPC.projectMgr.delete, async (_e, configPath, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    opRunner.run(`物理删除:${name}`, {
      startMsg: `正在物理删除项目: ${name}`,
      work: async () => {
        const ok = await projectService.deleteProject(idx)
        if (ok) ProjectRepository.save(configPath, projectService.projects)
        return ok
      },
      doneMsg: `项目已物理删除: ${name}`,
      failMsg: `无法删除目录: ${name}`,
    })
    return true
  })
  ipcMain.handle(IPC.projectMgr.rename, (_e, configPath, idx, newName) => {
    const ok = projectService.renameProject(idx, newName)
    if (ok) ProjectRepository.save(configPath, projectService.projects)
    return ok
  })
  ipcMain.handle('projectMgr:refresh', (_e, configPath) => {
    const projects = ProjectRepository.load(configPath)
    projectService.refreshProjects(projects)
    return projects
  })
  ipcMain.handle(IPC.projectMgr.openFolder, async (_e, path) => {
    const { shell } = await import('electron')
    const error = await shell.openPath(path)
    return !error
  })
  ipcMain.handle(IPC.projectMgr.build, async (_e, idx, command, zipName) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    taskService.addTask(`构建:${name}`, async (report) => {
      // 里程碑进度由 buildProject 的 report 回调继续上报，构建输出行节流同步到任务卡片
      const ctx = createTaskOpCtx(report)
      try {
        await projectService.buildProject(idx, command, zipName, report, ctx.line)
      } finally {
        ctx.dispose()
      }
    })
    return true
  })
  ipcMain.handle(IPC.projectMgr.scanBuildArtifacts, (_e, idx) => projectService.scanBuildArtifacts(idx))
  ipcMain.handle(IPC.projectMgr.cleanArtifacts, async (_e, idx, paths) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    opRunner.run(`清理构建产物:${name}`, {
      startMsg: `开始清理 ${paths.length} 个构建产物`,
      // 每清理完一项推进一次整体进度，文案与进度同步刷新
      work: (ctx) =>
        projectService.cleanArtifacts(idx, paths, (done, total) => {
          ctx.line(`已清理 ${done}/${total} 个构建产物`)
          ctx.percent(Math.round((done / total) * 100))
        }),
      doneMsg: '清理完成',
      failMsg: '清理失败',
    })
    return true
  })
  ipcMain.handle(IPC.projectMgr.getDependencyDirs, (_e, idx) => projectService.getDependencyDirs(idx))
  ipcMain.handle(IPC.projectMgr.cleanDependencies, async (_e, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    opRunner.run(`清理依赖目录:${name}`, {
      startMsg: `开始清理依赖目录: ${name}`,
      // 每清理完一个目录推进一次整体进度，文案与进度同步刷新
      work: (ctx) =>
        projectService.cleanDependencies(idx, (done, total) => {
          ctx.line(`已清理 ${done}/${total} 个依赖目录`)
          ctx.percent(Math.round((done / total) * 100))
        }),
      doneMsg: '依赖目录清理完成',
      failMsg: '清理失败',
    })
    return true
  })
  ipcMain.handle(IPC.projectMgr.getTaskList, (_e, idx) => projectService.getTaskList(idx))
  ipcMain.handle(IPC.projectMgr.getContextMenu, (_e, idx) => projectService.getContextMenu(idx))
  ipcMain.handle(IPC.projectType.getCapabilities, () => projectService.getCapabilities())
  ipcMain.handle(IPC.projectMgr.runScript, async (_e, idx, command) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    opRunner.runCommand(name, command, '脚本', () => projectService.runScript(idx, command))
    return true
  })
  ipcMain.handle(IPC.projectMgr.runTask, async (_e, idx, command) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    opRunner.runCommand(name, command, '任务', () => projectService.runTask(idx, command))
    return true
  })

  // ── task ──
  ipcMain.handle(IPC.task.getAll, () => taskService.getAllTasks())
  ipcMain.handle(IPC.task.getActive, () => taskService.getActiveTasks())
  ipcMain.handle(IPC.task.get, (_e, taskId) => taskService.getTask(taskId))
  ipcMain.handle(IPC.task.cancel, (_e, taskId) => taskService.cancelTask(taskId))
  ipcMain.handle(IPC.task.clearFinished, () => taskService.clearFinishedTasks())

  // ── notification ──
  ipcMain.handle(IPC.notification.getAll, () => notificationService.getAll())
  ipcMain.handle(IPC.notification.getUnreadCount, () => notificationService.getUnreadCount())
  ipcMain.handle(IPC.notification.create, (_e, type, title, message, projectName) =>
    notificationService.createNotification(type, title, message, projectName),
  )
  ipcMain.handle(IPC.notification.markRead, (_e, id) => notificationService.markRead(id))
  ipcMain.handle(IPC.notification.markAllRead, () => notificationService.markAllRead())
  ipcMain.handle(IPC.notification.clearAll, () => notificationService.clearAll())

  // ── vcs ──
  ipcMain.handle(IPC.vcs.detect, (_e, path) => {
    const vcs = vcsRegistry.detect(path)
    return vcs ? { name: vcs.name, label: vcs.label } : null
  })
  ipcMain.handle(IPC.vcs.detectBatch, (_e, paths: string[]) =>
    paths.map((path) => {
      const vcs = vcsRegistry.detect(path)
      return vcs ? { name: vcs.name, label: vcs.label } : null
    }),
  )
  ipcMain.handle('vcs:update', async (_e, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    if (!proj) return false
    const name = proj.name
    opRunner.runVcsUpdate(`VCS更新:${name}`, name, vcsRegistry.detect(proj.path)?.label || 'VCS', (ctx) =>
      projectService.vcsUpdate(idx, { onLine: ctx.line, onPercent: ctx.percent }),
    )
    return true
  })
  ipcMain.handle(IPC.vcs.updateRange, async (_e, params) => {
    const total = params.endIdx - params.startIdx + 1
    taskService.addTask(`批量更新(${total}项)`, async (report) => {
      let success = 0
      let conflict = 0
      const failed: string[] = []
      for (let i = params.startIdx; i <= params.endIdx; i++) {
        const idx = i + 1
        const cur = i - params.startIdx + 1
        const proj = projectService.getProjectByIndex(idx)
        const pn = proj?.name || `#${idx}`
        // 项目执行前先做边界上报：任务取消在此抛出，实现项目之间即时中止
        report(`更新 [${cur}/${total}]: ${pn}`)
        // 项目级上下文：内部行与百分比统一折算为整体进度，文案带项目序号前缀
        const ctx = createTaskOpCtx(report, {
          initialMessage: `更新 [${cur}/${total}]: ${pn}`,
          formatLine: (line) => `更新 [${cur}/${total}] ${pn}: ${line}`,
          mapPercent: (inner) => Math.floor(((cur - 1 + inner / 100) / total) * 100),
        })
        try {
          const result = await projectService.vcsUpdate(idx, { onLine: ctx.line, onPercent: ctx.percent })
          // 项目边界上报在项目完成之后推进整体进度，取消错误在此抛出
          if (result.status === 'ok') {
            success++
            report(`更新完成 [${cur}/${total}] ${pn}`, Math.floor((cur / total) * 100))
          } else if (result.status === 'conflict') {
            conflict++
            report(`更新完成 [${cur}/${total}] ${pn}，存在合并冲突`, Math.floor((cur / total) * 100))
          } else {
            failed.push(`${pn}: ${result.text || '未知错误'}`)
            report(`更新失败 [${cur}/${total}] ${pn}`, Math.floor((cur / total) * 100))
          }
        } finally {
          // 项目结束后停用上下文，防止遗留节流定时器串扰下一个项目
          ctx.dispose()
        }
      }
      if (failed.length > 0) {
        report(`批量更新结束: 成功 ${success}，冲突 ${conflict}，失败 ${failed.length}`, 100)
        throw new Error(`${failed.length} 个项目更新失败:\n${failed.join('\n')}`)
      }
      report(`批量更新完成，共 ${total} 个项目，成功 ${success}，冲突 ${conflict}`, 100)
    })
    return true
  })
  ipcMain.handle('vcs:log', async (_e, idx, limit) => projectService.vcsLog(idx, limit))
  ipcMain.handle(IPC.vcs.updateByPath, async (_e, path, name) => {
    opRunner.runVcsUpdate(`VCS更新:${name}`, name, vcsRegistry.detect(path)?.label || 'VCS', (ctx) =>
      projectService.vcsUpdateByPath(path, name, { onLine: ctx.line, onPercent: ctx.percent }),
    )
    return true
  })
  ipcMain.handle('vcs:logByPath', async (_e, path, limit) => projectService.vcsLogByPath(path, limit))
  ipcMain.handle(IPC.vcs.openLogGuiByPath, async (_e, path) => {
    const vcs = vcsRegistry.detect(path)
    if (vcs?.openLogGui) {
      if (vcs.openLogGui(path)) return true
    }
    await projectService.vcsLogByPath(path, 20)
    return false
  })
  ipcMain.handle(IPC.vcs.openCommitGuiByPath, async (_e, path) => {
    const vcs = vcsRegistry.detect(path)
    if (vcs?.openCommitGui) return vcs.openCommitGui(path)
    return false
  })
  ipcMain.handle('vcs:openRepoBrowser', async (_e, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    if (!proj) return false
    const vcs = vcsRegistry.detect(proj.path)
    if (vcs?.openRepoBrowser) return vcs.openRepoBrowser(proj.path)
    return false
  })
  ipcMain.handle(IPC.vcs.openRepoBrowserByPath, async (_e, path) => {
    const vcs = vcsRegistry.detect(path)
    if (vcs?.openRepoBrowser) return vcs.openRepoBrowser(path)
    return false
  })
  ipcMain.handle('vcs:infoByPath', async (_e, path) => {
    const vcs = vcsRegistry.detect(path)
    if (!vcs) return null
    return vcs.getInfo(path)
  })
  ipcMain.handle('vcs:openLogGui', async (_e, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    if (!proj) return false
    const vcs = vcsRegistry.detect(proj.path)
    if (vcs?.openLogGui) {
      if (vcs.openLogGui(proj.path)) return true
    }
    await projectService.vcsLog(idx, 20)
    return false
  })
  ipcMain.handle('vcs:openCommitGui', async (_e, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    if (!proj) return false
    const vcs = vcsRegistry.detect(proj.path)
    if (vcs?.openCommitGui) return vcs.openCommitGui(proj.path)
    return false
  })
  ipcMain.handle(IPC.vcs.checkRemote, async (_e, projects) => {
    const results: any[] = []
    for (const p of projects) {
      const vcs = vcsRegistry.detect(p.path)
      if (!vcs) continue
      const r = await vcs.checkRemote([p])
      for (const hit of r) {
        // count 小于 0 为检查失败标记，不生成通知也不回传结果，维持检查失败静默的既有行为
        if (hit.count < 0) continue
        notificationService.createNotification('vcs_remote', `远程有更新: ${p.name}`, hit.summary, p.name, true)
        results.push(hit)
      }
    }
    return results
  })
  ipcMain.handle(IPC.vcs.checkLocal, async (_e, projects) => {
    const results: any[] = []
    for (const p of projects) {
      const vcs = vcsRegistry.detect(p.path)
      if (!vcs) continue
      const r = await vcs.checkLocal([p])
      for (const hit of r) {
        // count 小于 0 为检查失败标记，不生成通知也不回传结果，维持检查失败静默的既有行为
        if (hit.count < 0) continue
        notificationService.createNotification(
          'local_changes',
          `本地有未提交变更: ${p.name}`,
          hit.summary,
          p.name,
          true,
        )
        results.push(hit)
      }
    }
    return results
  })
  ipcMain.handle(IPC.vcs.info, async (_e, idx) => projectService.getVcsInfo(idx))
  ipcMain.handle(IPC.vcs.revisionInfo, async (_e, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    if (!proj) return null
    const provider = vcsRegistry.detect(proj.path)
    if (!provider || !provider.getRevisionInfo) return null
    return provider.getRevisionInfo(proj.path)
  })
  ipcMain.handle(
    'vcs:count',
    (_e, projects) =>
      projects.filter((p: { name: string; path: string }) => vcsRegistry.detect(p.path) !== null).length,
  )
  ipcMain.handle(IPC.vcs.migrate, async (_e, idx, params) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    const modeLabels: Record<string, string> = { svn: 'SVN', git: 'Git', copy: '复制' }
    const modeLabel = modeLabels[params.mode] || params.mode
    const startMsg = `开始迁移: ${name} (${modeLabel})`
    taskService.addTask(`迁移项目:${name}`, async (report) => {
      report(startMsg, 5)
      const ctx = createTaskOpCtx(report, { initialMessage: `迁移中: ${name} (${modeLabel})` })
      try {
        // 迁移过程的逐行输出已由服务侧实时发往输出面板，此处仅同步任务卡片文案与进度
        const ok = await projectService.migrateProject(idx, params, { onLine: ctx.line, onPercent: ctx.percent })
        ctx.flushNow()
        if (ok) report(`迁移完成: ${name}`, 100)
        else throw new Error(`迁移失败: ${name}`)
      } finally {
        ctx.dispose()
      }
    })
    return true
  })
  ipcMain.handle(IPC.vcs.startRemoteCheck, (_e, intervalMinutes) => {
    startRemoteCheckTimer(intervalMinutes)
  })
  ipcMain.handle(IPC.vcs.startLocalCheck, (_e, intervalMinutes) => {
    startLocalCheckTimer(intervalMinutes)
  })
  ipcMain.handle(IPC.vcs.stopChecks, () => {
    stopVcsChecks()
  })

  // ── settings ──
  ipcMain.handle(IPC.settings.get, (_e, key) => settings.get(key))
  ipcMain.handle(IPC.settings.set, (_e, key, value) => {
    settings.set(key, value)
    applySettingLive(key, value)
    // 广播设置变更，渲染层面板据此实时应用新值
    mainWindow?.webContents.send(IPC_EVENT.settingsChanged, { key, value })
  })
  ipcMain.handle(IPC.settings.getSchema, () => settings.getSchema())
  ipcMain.handle('settings:getPath', () => (settings as any)['path'] || '')

  // ── update ──
  ipcMain.handle('update:check', async () => updateService.checkUpdate())
  ipcMain.handle('update:download', async (_e, url, filename) => {
    const taskId = taskService.addTask('下载更新')
    let resolvePromise: (value: string) => void
    let rejectPromise: (err: Error) => void
    const promise = new Promise<string>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })
    taskService.setTaskTarget(taskId, async (report) => {
      try {
        const result = await updateService.downloadWithReport({ url, filename }, report)
        resolvePromise(result)
      } catch (e: any) {
        rejectPromise(e)
      }
    })
    return promise
  })
  ipcMain.handle('update:install', (_e, filePath) => {
    projectService.stopAll()
    updateService.installUpdate(filePath)
  })

  // ── system ──
  ipcMain.handle('system:getVersion', () => appVersion)
  ipcMain.handle('system:getDataDir', () => ensureDataDir('项目管理器', getSourceRoot()))
  ipcMain.handle('system:getSourceRoot', () => getSourceRoot())
  ipcMain.handle(IPC.system.scanDataDir, () => scanDataDir('项目管理器'))
  ipcMain.handle(IPC.system.deleteDataDirItem, (_e, itemPath) => deleteItem(itemPath))
  ipcMain.handle(IPC.system.getJavaHomes, () => discoverJavaHomes())
  ipcMain.handle(IPC.system.getMavenHomes, () => discoverMavenHomes())
  ipcMain.handle(IPC.system.getTomcatHomes, () => discoverTomcatHomes())
  ipcMain.handle(IPC.system.getGradleHomes, () => discoverGradleHomes())
  ipcMain.handle(
    'system:openFileWith',
    async (_e, filePath: string, opener: { name: string; path: string; args: string }) => {
      try {
        let args = opener.args.replace(/\{file\}/g, filePath).replace(/\{path\}/g, filePath)
        const argTokens = parseArgs(args)
        const child = spawn('cmd.exe', ['/d', '/s', '/c', opener.path, ...argTokens], {
          windowsHide: false,
          detached: true,
        })
        child.unref()
        return true
      } catch {
        return false
      }
    },
  )
  ipcMain.handle(IPC.system.selectDirectory, async (_e, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle(IPC.system.log, (_e, type: string, text: string) => {
    mainWindow?.webContents.send(IPC_EVENT.output, { type, text })
  })
  ipcMain.handle(IPC.system.getTerminalEntries, () => {
    try {
      const raw: string = settings.get(SETTINGS_KEYS.terminal.entries, '')
      if (raw) return JSON.parse(raw)
      const oldPath: string = settings.get(SETTINGS_KEYS.terminal.path, '')
      if (oldPath) {
        const oldArgs: string = settings.get(SETTINGS_KEYS.terminal.args, '--cd={path}')
        const oldInit: string = settings.get(SETTINGS_KEYS.terminal.initCommand, '')
        const entry = JSON.stringify([{ name: '终端', path: oldPath, args: oldArgs, init: oldInit }])
        settings.set(SETTINGS_KEYS.terminal.entries, entry)
        return [{ name: '终端', path: oldPath, args: oldArgs, init: oldInit }]
      }
      return [{ name: 'Git Bash', path: 'C:\\\\Program Files\\\\Git\\\\git-bash.exe', args: '--cd={path}', init: '' }]
    } catch {
      return [{ name: 'Git Bash', path: 'C:\\\\Program Files\\\\Git\\\\git-bash.exe', args: '--cd={path}', init: '' }]
    }
  })
  ipcMain.handle(IPC.system.openTerminal, async (_e, projectPath: string, entry: any) => {
    cleanOldTermScripts()
    const termPath: string = entry?.path || 'C:\\\\Program Files\\\\Git\\\\git-bash.exe'
    let termArgs: string = entry?.args || '--cd={path}'
    const initCommand: string = entry?.init || ''
    try {
      // cmd.exe 及 .bat/.cmd 脚本无法将 UNC 网络路径作为当前目录，
      // 命中时改用 pushd 建立临时盘符映射的包装方式启动；
      // Git Bash 等 msys 终端与 powershell.exe 支持 UNC 当前目录，保持原样直启
      const needCmdUncWrap = isUncPath(projectPath) && isCmdTerminal(termPath)
      if (initCommand) {
        const isBash = /bash|sh|git/i.test(termPath)
        if (isBash) {
          // UNC 路径在 msys 环境须改写为双正斜杠前缀，直接使用反斜杠形式 cd 会失败
          const bashCwd = isUncPath(projectPath) ? toMsysPath(projectPath) : projectPath
          const script = `cd "${bashCwd}"\n${initCommand}\nexec bash -i 2>/dev/null || exec sh -i 2>/dev/null || cmd.exe`
          spawn(termPath, ['-c', script], { windowsHide: false, detached: true }).unref()
        } else {
          // 批处理在 cmd 会话内以 pushd 代替 cd /d 进入共享目录，初始化命令原地执行，
          // 盘符映射随 cmd 窗口关闭而自动释放；本地路径仍沿用 cd /d
          const cdLine = isUncPath(projectPath) ? `@pushd "${projectPath}" >nul 2>&1` : `@cd /d "${projectPath}"`
          const tmpDir = mkdtempSync(join(tmpdir(), 'term-'))
          const script = `${cdLine}\n${initCommand}\n`
          const scriptPath = join(tmpDir, 'init.bat')
          writeFileSync(scriptPath, script, 'utf-8')
          spawn('cmd.exe', ['/k', scriptPath], { windowsHide: false, detached: true }).unref()
        }
        return true
      }
      const argTokens = termArgs ? parseArgs(termArgs) : []
      const args = argTokens.map((a) => a.replace(/\{path\}/g, projectPath))
      if (needCmdUncWrap) {
        // 外层 cmd.exe 先 pushd 映射共享目录盘符，再启动内层交互 cmd 继承映射后的目录，
        // 内层退出后外层随之结束，映射随进程退出自动释放；
        // 原启动参数一并舍弃，cmd 交互窗口默认行为与裸参数一致
        spawn('cmd.exe', ['/d', '/s', '/c', wrapCmdForUnc('cmd', projectPath)], {
          windowsHide: false,
          detached: true,
        }).unref()
      } else {
        spawn(termPath, args, { cwd: projectPath, windowsHide: false, detached: true }).unref()
      }
      return true
    } catch (err) {
      mainWindow?.webContents.send(IPC_EVENT.output, { type: 'error', text: `打开终端失败: ${(err as Error).message}` })
      return false
    }
  })

  // ── proxy ──
  ipcMain.handle(IPC.proxyConfig.detect, (_e, projectPath: string) => detectAndReadProxies(projectPath))
  ipcMain.handle(IPC.proxyConfig.update, (_e, projectPath: string, changes: Record<string, string>) =>
    updateProxyTargets(projectPath, changes),
  )

  // ── port ──
  ipcMain.handle(IPC.portConfig.detect, (_e, projectPath: string) => detectAndReadPort(projectPath))
  ipcMain.handle(IPC.portConfig.update, (_e, projectPath: string, newPort: number) => {
    const portNumber = parseInt(String(newPort), 10)
    if (!Number.isFinite(portNumber) || portNumber < 1 || portNumber > 65535)
      throw new Error('端口号必须在 1-65535 之间')
    return updatePort(projectPath, portNumber)
  })

  // ── store ──
  ipcMain.handle(IPC.store.get, (_e, key: string) => storeGet(store, key))
  ipcMain.handle(IPC.store.set, (_e, key: string, value: any) => storeSet(store, key, value))
  ipcMain.handle('store:delete', (_e, key: string) => storeDelete(store, key))
  ipcMain.handle('store:keys', () => storeKeys(store))

  // ── buildTool ──
  ipcMain.handle(IPC.buildTool.detectBatch, (_e, paths: string[]) => detectBuildTools(paths))
}
// #endregion

// #region Init
function initServices(): void {
  const sourceRoot = getSourceRootDir()
  const dataDir = ensureDataDir(APP_NAME, sourceRoot)
  store = createStore(dataDir)

  appVersion = app.getVersion()

  const assetDir = join(dataDir, 'assets')
  const schemaPath = join(assetDir, 'settings_schema.json')
  const settingsPath = join(assetDir, 'settings.json')
  settings = new AppSettings(settingsPath, schemaPath)

  const svnProvider = new SvnProvider()
  const gitProvider = new GitProvider()
  vcsRegistry.register(svnProvider)
  vcsRegistry.register(gitProvider)

  const vcsSettingsGetter: SettingsGetter = (key, defaultVal) => settings.get(key, defaultVal)
  for (const provider of vcsRegistry.getAll()) {
    if ('setSettingsGetter' in provider) (provider as any).setSettingsGetter(vcsSettingsGetter)
  }

  const projectsPath = join(assetDir, 'projects.json')
  if (!existsSync(projectsPath)) ProjectRepository.save(projectsPath, [])

  const sourcesPath = join(assetDir, 'sources.json')
  sourceMgr = new SourceManager(sourcesPath)

  let sources = sourceMgr.listSources()
  if (sources.length === 0) {
    sourceMgr.addSource('default', projectsPath, 'file')
    sourceMgr.save()
    sources = sourceMgr.listSources()
  }

  const activeName = sourceMgr.getActiveSourceName()
  const activeSource = sources.find((s) => s.name === activeName)
  if (!activeSource) sourceMgr.switchSource(sources[0].name)

  const last = settings.lastSource
  if (last && last !== sourceMgr.getActiveSourceName()) {
    const found = sources.find((s) => s.name === last)
    if (found) sourceMgr.switchSource(last)
  }

  const activeConfigPath = sourceMgr.getActiveConfigPath()
  const projects = ProjectRepository.load(activeConfigPath)

  processMgr = new ProcessManager(settings.protectedPorts)

  projectService = new ProjectService(processMgr, vcsRegistry)
  projectService.refreshProjects(projects)

  taskService = new TaskService((key, defaultVal) => settings.get(key, defaultVal))

  const updateUrl = settings.get(SETTINGS_KEYS.update.url, '')
  updateService = new UpdateService(updateUrl)

  const notifyPath = join(assetDir, 'notifications.json')
  notificationService = new NotificationService(notifyPath, (key, defaultVal) => settings.get(key, defaultVal))

  opRunner = new OperationRunner(taskService, notificationService, (payload) =>
    mainWindow?.webContents.send(IPC_EVENT.output, payload),
  )

  notificationService.on('notificationCreated', (data) => {
    mainWindow?.webContents.send(IPC_EVENT.notificationCreated, data)
  })
  notificationService.on('notificationsCleared', () => {
    mainWindow?.webContents.send(IPC_EVENT.notificationsCleared)
  })

  taskService.on('taskStarted', (data) => mainWindow?.webContents.send(IPC_EVENT.taskStarted, data))
  taskService.on('taskProgress', (data) => mainWindow?.webContents.send(IPC_EVENT.taskProgress, data))
  taskService.on('taskCompleted', (data) => {
    mainWindow?.webContents.send(IPC_EVENT.taskCompleted, data)
    notificationService.createNotification('info', `任务完成: ${data.name}`, '')
  })
  taskService.on('taskFailed', (data) => {
    mainWindow?.webContents.send(IPC_EVENT.taskFailed, data)
    notificationService.createNotification('error', `任务失败: ${data.name}`, data.error || '')
    if (data.error && mainWindow) {
      mainWindow.webContents.send(IPC_EVENT.output, { type: 'error', text: `${data.name}: ${data.error}` })
    }
  })

  updateService.on('updateAvailable', (data) => {
    mainWindow?.webContents.send(IPC_EVENT.updateAvailable, data)
    notificationService.createNotification('info', '发现新版本', `安装包: ${data.filename}`)
  })
  updateService.on('updateNotFound', () => mainWindow?.webContents.send(IPC_EVENT.updateNotFound))
  updateService.on('updateCheckError', (message) =>
    mainWindow?.webContents.send(IPC_EVENT.updateCheckError, { message }),
  )
  updateService.on('updateDownloaded', (filePath) =>
    mainWindow?.webContents.send(IPC_EVENT.updateDownloaded, { filePath }),
  )
}

process.on('uncaughtException', (error) => {
  const msg = `未捕获异常: ${error.message}\\n${error.stack || ''}`
  console.error(msg)
  if (mainWindow) mainWindow.webContents.send(IPC_EVENT.output, { type: 'error', text: msg })
})

process.on('unhandledRejection', (reason: any) => {
  const msg = `未处理的 Promise 拒绝: ${reason?.message || reason}`
  console.error(msg)
  if (mainWindow) mainWindow.webContents.send(IPC_EVENT.output, { type: 'error', text: msg })
})
// #endregion

// #region App Lifecycle
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  initServices()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    projectService?.stopAll()
    app.quit()
  }
})

app.on('before-quit', () => {
  projectService?.stopAll()
})
// #endregion
