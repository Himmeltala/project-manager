// #region Imports
import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron'
import { SETTINGS_KEYS } from '@/ipc/keys'
import { IPC, IPC_EVENT } from '@/ipc/channels'

import { join, resolve, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdtempSync, readdirSync, rmSync, statSync } from 'fs'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

// 服务层
import { ProcessManager } from '@electron/services/runtime/process-manager.service'
import { ProjectService } from '@electron/services/project/project.service'
import { SourceManager } from '@electron/services/project/source-manager.service'
import { TaskService } from '@electron/services/runtime/task.service'
import { OperationRunner } from '@electron/services/runtime/operation-runner.service'
import { NotificationService } from '@electron/services/notification.service'
import { UpdateService } from '@electron/services/update.service'
import { AppSettings } from '@electron/services/core/settings.service'
import { ProjectRepository } from '@electron/services/project/project-repository.service'
import { vcsRegistry } from '@electron/services/version-control/registry'
import { SvnProvider } from '@electron/services/version-control/svn/index'
import { GitProvider } from '@electron/services/version-control/git/index'
import type { SettingsGetter } from '@electron/services/version-control/registry'
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

async function executeVcsChecks(
  checkFn: (vcs: any, projects: { name: string; path: string }[]) => Promise<any[]>,
  notificationType: string,
  titlePrefix: string,
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
      notificationService.createNotification(
        notificationType as any,
        `${titlePrefix}: ${r.projectName}`,
        r.summary,
        r.projectName,
        true,
      )
    }
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
    taskService.addTask(`构建:${name}`, (report) => projectService.buildProject(idx, command, zipName, report))
    return true
  })
  ipcMain.handle(IPC.projectMgr.scanBuildArtifacts, (_e, idx) => projectService.scanBuildArtifacts(idx))
  ipcMain.handle(IPC.projectMgr.cleanArtifacts, async (_e, idx, paths) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    opRunner.run(`清理构建产物:${name}`, {
      startMsg: `开始清理 ${paths.length} 个构建产物`,
      work: () => projectService.cleanArtifacts(idx, paths),
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
      work: () => projectService.cleanDependencies(idx),
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
    opRunner.runVcsUpdate(`VCS更新:${name}`, name, vcsRegistry.detect(proj.path)?.label || 'VCS', () =>
      projectService.vcsUpdate(idx),
    )
    return true
  })
  ipcMain.handle(IPC.vcs.updateRange, async (_e, params) => {
    const total = params.endIdx - params.startIdx + 1
    taskService.addTask(`批量更新(${total}项)`, async (report) => {
      const failed: string[] = []
      for (let i = params.startIdx; i <= params.endIdx; i++) {
        const idx = i + 1
        const cur = i - params.startIdx + 1
        const proj = projectService.getProjectByIndex(idx)
        const pn = proj?.name || `#${idx}`
        report(`更新 [${cur}/${total}]: ${pn}`, Math.floor((cur / total) * 100))
        const result = await projectService.vcsUpdate(idx)
        if (result.status === 'error') failed.push(`${pn}: ${result.text || '未知错误'}`)
      }
      if (failed.length > 0) throw new Error(`${failed.length} 个项目更新失败:\\n${failed.join('\\n')}`)
      report(`批量更新完成，共 ${total} 个项目`, 100)
    })
    return true
  })
  ipcMain.handle('vcs:log', async (_e, idx, limit) => projectService.vcsLog(idx, limit))
  ipcMain.handle(IPC.vcs.updateByPath, async (_e, path, name) => {
    opRunner.runVcsUpdate(`VCS更新:${name}`, name, vcsRegistry.detect(path)?.label || 'VCS', () =>
      projectService.vcsUpdateByPath(path, name),
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
      if (r.length > 0) {
        notificationService.createNotification('vcs_remote', `远程有更新: ${p.name}`, r[0].summary, p.name, true)
        results.push(r[0])
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
      if (r.length > 0) {
        notificationService.createNotification(
          'local_changes',
          `本地有未提交变更: ${p.name}`,
          r[0].summary,
          p.name,
          true,
        )
        results.push(r[0])
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
    taskService.addTask(`迁移项目:${name}`, async (report) => {
      report(`开始迁移: ${name} (${modeLabel})`, 5)
      const ok = await projectService.migrateProject(idx, params)
      if (ok) report(`迁移完成: ${name}`, 100)
      else throw new Error(`迁移失败: ${name}`)
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
    if (key === 'theme') mainWindow?.webContents.send(IPC_EVENT.themeChanged, value)
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
      if (initCommand) {
        const isBash = /bash|sh|git/i.test(termPath)
        if (isBash) {
          const script = `cd "${projectPath}"\\n${initCommand}\\nexec bash -i 2>/dev/null || exec sh -i 2>/dev/null || cmd.exe`
          spawn(termPath, ['-c', script], { windowsHide: false, detached: true }).unref()
        } else {
          const tmpDir = mkdtempSync(join(tmpdir(), 'term-'))
          const script = `@cd /d "${projectPath}"\\n${initCommand}\\n`
          const scriptPath = join(tmpDir, 'init.bat')
          writeFileSync(scriptPath, script, 'utf-8')
          spawn('cmd.exe', ['/k', scriptPath], { windowsHide: false, detached: true }).unref()
        }
        return true
      }
      const argTokens = termArgs ? parseArgs(termArgs) : []
      const args = argTokens.map((a) => a.replace(/\{path\}/g, projectPath))
      spawn(termPath, args, { cwd: projectPath, windowsHide: false, detached: true }).unref()
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
  updateService.on('updateCheckError', (message) => mainWindow?.webContents.send(IPC_EVENT.updateCheckError, { message }))
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
