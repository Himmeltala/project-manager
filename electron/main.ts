import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import { join, resolve } from 'path'
import { existsSync, copyFileSync, readFileSync } from 'fs'

// 服务层
import { ProcessManager } from './services/process-manager.service'
import { ProjectManagerService } from './services/project-manager.service'
import { SourceManager } from './services/source-manager.service'
import { TaskManager } from './services/task-manager.service'
import { NotificationService } from './services/notification.service'
import { UpdateService } from './services/update.service'
import { AppSettings } from './services/settings.service'
import { ProjectRepository } from './services/project.service'
import { vcsRegistry } from './services/vcs/index'
import {
  discoverJavaHomes,
  discoverMavenHomes,
  discoverTomcatHomes,
  readPomFinalName,
} from './services/project-type.service'
import {
  ensureDataDir,
  scanDataDir,
  deleteItem,
  getAppVersion,
  getSourceRoot as _getSourceRoot,
} from './services/data-dir.service'
import * as proxyConfig from './services/proxy-config.service'

// 开发环境用项目根目录，打包后用 resources 目录
function getSourceRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  return resolve(__dirname, '..')
}

const APP_NAME = '项目管理器'
let mainWindow: BrowserWindow | null = null
let settings: AppSettings
let sourceMgr: SourceManager
let projectService: ProjectManagerService
let taskMgr: TaskManager
let processMgr: ProcessManager
let notificationService: NotificationService
let updateService: UpdateService
let appVersion: string
let remoteCheckTimer: NodeJS.Timeout | null = null
let localCheckTimer: NodeJS.Timeout | null = null

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
    // 从设置自动恢复定时检查
    autoStartVcsChecks()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  setupMenu()
  setupIpcHandlers()
  setupEventForwarding()

  // 启动更新检查
  if (updateService) {
    updateService.startupCheck(settings)
  }
}

function setupMenu(): void {
  const send = (action: string) => mainWindow?.webContents.send('menu:event', { action })
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '项目',
      submenu: [{ label: '退出', accelerator: 'Alt+F4', role: 'quit' }],
    },
    {
      label: '版本',
      submenu: [
        { label: '范围更新', click: () => send('vcsRange') },
        { label: '范围检查', click: () => send('vcsCheckRange') },
      ],
    },
    {
      label: '项目源',
      submenu: [
        { label: '管理项目源', click: () => send('manageSources') },
        { label: '添加项目源', click: () => send('addSource') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '设置', click: () => send('settings') },
        { label: '数据目录管理', click: () => send('dataDir') },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '检查更新', click: () => send('checkUpdate') },
        { type: 'separator' },
        { label: '关于', click: () => send('about') },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function setupEventForwarding(): void {
  if (!projectService || !mainWindow) return

  projectService.on('outputLine', (data) => {
    mainWindow?.webContents.send('event:outputLine', data)
  })
  projectService.on('projectStarted', (data) => {
    mainWindow?.webContents.send('event:projectStarted', data)
    notificationService.createNotification('info', `项目已启动: ${data.name}`, '', data.name)
  })
  projectService.on('projectStopped', (data) => {
    mainWindow?.webContents.send('event:projectStopped', data)
    notificationService.createNotification('warning', `项目已停止: ${data.name}`, '', data.name)
  })
  projectService.on('portDetected', (data) => {
    mainWindow?.webContents.send('event:portDetected', data)
  })
}

function autoStartVcsChecks(): void {
  const remoteEnabled = settings.get('scheduled_checks.remote_enabled', false)
  const localEnabled = settings.get('scheduled_checks.local_enabled', false)
  if (remoteEnabled) {
    const interval = settings.get('scheduled_checks.remote_interval_minutes', 30)
    startRemoteCheckTimer(interval)
  }
  if (localEnabled) {
    const interval = settings.get('scheduled_checks.local_interval_minutes', 15)
    startLocalCheckTimer(interval)
  }
}

function startRemoteCheckTimer(intervalMinutes: number): void {
  if (remoteCheckTimer) clearInterval(remoteCheckTimer)
  remoteCheckTimer = setInterval(() => {
    const projects = projectService.projects.map((p) => ({ name: p.name, path: p.path }))
    for (const p of projects) {
      const vcs = vcsRegistry.detect(p.path)
      if (!vcs) continue
      vcs.checkRemote([p]).then((results) => {
        for (const r of results) {
          notificationService.createNotification(
            'vcs_remote',
            `远程有更新: ${r.projectName}`,
            r.summary,
            r.projectName,
            true,
          )
        }
      })
    }
  }, intervalMinutes * 60000)
}

function startLocalCheckTimer(intervalMinutes: number): void {
  if (localCheckTimer) clearInterval(localCheckTimer)
  localCheckTimer = setInterval(() => {
    const projects = projectService.projects.map((p) => ({ name: p.name, path: p.path }))
    for (const p of projects) {
      const vcs = vcsRegistry.detect(p.path)
      if (!vcs) continue
      vcs.checkLocal([p]).then((results) => {
        for (const r of results) {
          notificationService.createNotification(
            'local_changes',
            `本地有未提交变更: ${r.projectName}`,
            r.summary,
            r.projectName,
            true,
          )
        }
      })
    }
  }, intervalMinutes * 60000)
}

function setupIpcHandlers(): void {
  // ====== 项目 ======
  ipcMain.handle('project:load', (_e, configPath) => {
    return ProjectRepository.load(configPath)
  })
  ipcMain.handle('project:save', (_e, configPath, projects) => {
    ProjectRepository.save(configPath, projects)
  })
  ipcMain.handle('project:discover', async (_e, rootDir) => {
    return ProjectRepository.discover(rootDir)
  })
  ipcMain.handle('project:getDefaultConfigPath', () => {
    return sourceMgr.getActiveConfigPath()
  })

  // ====== 项目源 ======
  ipcMain.handle('source:list', (_e, includeCounts) => {
    return sourceMgr.listSources(includeCounts)
  })
  ipcMain.handle('source:getActive', () => sourceMgr.getActiveSourceName())
  ipcMain.handle('source:getActiveInfo', () => sourceMgr.getActiveSource())
  ipcMain.handle('source:switch', (_e, name) => {
    if (sourceMgr.switchSource(name)) {
      const configPath = sourceMgr.getActiveConfigPath()
      const projects = ProjectRepository.load(configPath)
      projectService.refreshProjects(projects)
      settings.lastSource = name
      return true
    }
    return false
  })
  ipcMain.handle('source:add', (_e, name, configPath, sourceType, extra) => {
    return sourceMgr.addSource(name, configPath, sourceType, extra)
  })
  ipcMain.handle('source:rename', (_e, oldName, newName) => {
    return sourceMgr.renameSource(oldName, newName)
  })
  ipcMain.handle('source:remove', (_e, name) => sourceMgr.removeSource(name))
  ipcMain.handle('source:createFromDir', async (_e, name, directory) => {
    return sourceMgr.createSourceFromDirectory(name, directory)
  })
  ipcMain.handle('source:refreshCurrent', async () => {
    if (await sourceMgr.refreshCurrentSource()) {
      const configPath = sourceMgr.getActiveConfigPath()
      const projects = ProjectRepository.load(configPath)
      projectService.refreshProjects(projects)
      return true
    }
    return false
  })

  // ====== 进程 ======
  ipcMain.handle('process:start', async (_e, idx, command) => {
    return projectService.start(idx, command)
  })
  ipcMain.handle('process:stop', async (_e, idx) => {
    return projectService.stop(idx)
  })
  ipcMain.handle('process:stopScript', async (_e, idx, command) => {
    return projectService.stopScript(idx, command)
  })
  ipcMain.handle('process:isRunning', (_e, idx) => projectService.isRunning(idx))
  ipcMain.handle('process:getRunningInfo', () => projectService.getRunningInfo())
  ipcMain.handle('process:getAllRunningPaths', () => projectService.getAllRunningPaths())
  ipcMain.handle('process:getTotalScriptsCount', () => projectService.getTotalScriptsCount())
  ipcMain.handle('process:getRunningScripts', (_e, idx) => projectService.getRunningScripts(idx))
  ipcMain.handle('process:getRunningScriptsByPath', (_e, path) => projectService.getRunningScriptsByPath(path))
  ipcMain.handle('process:killPort', async (_e, port) => {
    const taskId = taskMgr.addTask(`杀端口:${port}`, async (report) => {
      report(`正在终止端口 ${port} 的进程...`, 10)
      const ok = processMgr.killPort(port)
      if (ok) report(`端口 ${port} 进程已终止`, 100)
      else throw new Error(`端口 ${port} 进程终止失败`)
    })
    return true
  })
  ipcMain.handle('process:stopAll', () => projectService.stopAll())

  // ====== 任务 ======
  ipcMain.handle('task:getAll', () => taskMgr.getAllTasks())
  ipcMain.handle('task:getActive', () => taskMgr.getActiveTasks())
  ipcMain.handle('task:get', (_e, taskId) => taskMgr.getTask(taskId))
  ipcMain.handle('task:cancel', (_e, taskId) => taskMgr.cancelTask(taskId))

  // ====== 项目管理 ======
  ipcMain.handle('projectMgr:resolveTarget', (_e, target) => projectService.resolveTarget(target))
  ipcMain.handle('projectMgr:getByIndex', (_e, idx) => projectService.getProjectByIndex(idx))
  ipcMain.handle('projectMgr:remove', (_e, configPath, idx) => {
    const ok = projectService.removeProject(idx)
    if (ok) ProjectRepository.save(configPath, projectService.projects)
    return ok
  })
  ipcMain.handle('projectMgr:delete', async (_e, configPath, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    const taskId = taskMgr.addTask(`物理删除:${name}`, async (report) => {
      report(`正在物理删除项目: ${name}`, 10)
      const ok = await projectService.deleteProject(idx)
      if (ok) {
        ProjectRepository.save(configPath, projectService.projects)
        report(`项目已物理删除: ${name}`, 100)
      } else {
        throw new Error(`无法删除目录: ${name}`)
      }
    })
    return true
  })
  ipcMain.handle('projectMgr:rename', (_e, configPath, idx, newName) => {
    const ok = projectService.renameProject(idx, newName)
    if (ok) ProjectRepository.save(configPath, projectService.projects)
    return ok
  })
  ipcMain.handle('projectMgr:refresh', (_e, configPath) => {
    const projects = ProjectRepository.load(configPath)
    projectService.refreshProjects(projects)
    return projects
  })
  ipcMain.handle('projectMgr:openFolder', async (_e, path) => {
    const { shell } = require('electron')
    const error = await shell.openPath(path)
    return !error
  })
  ipcMain.handle('projectMgr:build', async (_e, idx, command, zipName) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    const taskId = taskMgr.addTask(`构建:${name}`, async (report) => {
      await projectService.buildProject(idx, command, zipName, report)
    })
    return true
  })
  ipcMain.handle('projectMgr:scanBuildArtifacts', (_e, idx) => {
    return projectService.scanBuildArtifacts(idx)
  })
  ipcMain.handle('projectMgr:cleanArtifacts', async (_e, idx, paths) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    const taskId = taskMgr.addTask(`清理构建产物:${name}`, async (report) => {
      report(`开始清理 ${paths.length} 个构建产物`, 5)
      projectService.cleanArtifacts(idx, paths)
      report('清理完成', 100)
    })
    return true
  })
  ipcMain.handle('projectMgr:getDependencyDirs', (_e, idx) => {
    return projectService.getDependencyDirs(idx)
  })
  ipcMain.handle('projectMgr:cleanDependencies', async (_e, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    const taskId = taskMgr.addTask(`清理依赖目录:${name}`, async (report) => {
      report(`开始清理依赖目录: ${name}`, 5)
      const ok = await projectService.cleanDependencies(idx)
      if (ok) report('依赖目录清理完成', 100)
      else throw new Error('清理失败')
    })
    return true
  })
  ipcMain.handle('projectMgr:getTaskList', (_e, idx) => {
    return projectService.getTaskList(idx)
  })
  ipcMain.handle('projectMgr:runScript', async (_e, idx, command) => {
    return projectService.runScript(idx, command)
  })
  ipcMain.handle('projectMgr:runTask', async (_e, idx, command) => {
    return projectService.runTask(idx, command)
  })

  // ====== VCS 通用 ======
  ipcMain.handle('vcs:detect', (_e, path) => {
    const vcs = vcsRegistry.detect(path)
    return vcs ? { name: vcs.name, label: vcs.label } : null
  })
  ipcMain.handle('vcs:detectBatch', (_e, paths: string[]) => {
    return paths.map((path) => {
      const vcs = vcsRegistry.detect(path)
      return vcs ? { name: vcs.name, label: vcs.label } : null
    })
  })
  ipcMain.handle('vcs:update', async (_e, idx) => {
    const proj = projectService.getProjectByIndex(idx)
    if (!proj) return false
    const vcs = vcsRegistry.detect(proj.path)
    const vcsLabel = vcs?.label || 'VCS'
    const name = proj.name
    const taskId = taskMgr.addTask(`${vcsLabel}更新:${name}`, async (report) => {
      report(`正在更新 [${name}] ...`, 5)
      const result = await projectService.vcsUpdate(idx)
      if (result === 'ok') {
        report(`${vcsLabel}更新完成: ${name}`, 100)
      } else if (result === 'conflict') {
        report(`${vcsLabel}更新完成，存在合并冲突: ${name}`, 100)
        notificationService.createNotification(
          'vcs_conflict',
          `${vcsLabel} 冲突: ${name}`,
          '更新完成后存在合并冲突，请手动解决',
          name,
          true,
        )
      } else {
        throw new Error(`${vcsLabel}更新失败: ${name}`)
      }
    })
    return true
  })
  ipcMain.handle('vcs:updateRange', async (_e, params) => {
    const total = params.endIdx - params.startIdx + 1
    const taskId = taskMgr.addTask(`批量更新(${total}项)`, async (report) => {
      for (let i = params.startIdx; i <= params.endIdx; i++) {
        const idx = i + 1
        const cur = i - params.startIdx + 1
        const proj = projectService.getProjectByIndex(idx)
        const pn = proj?.name || `#${idx}`
        report(`更新 [${cur}/${total}]: ${pn}`, Math.floor((cur / total) * 100))
        await projectService.vcsUpdate(idx)
      }
      report(`批量更新完成，共 ${total} 个项目`, 100)
    })
    return true
  })
  ipcMain.handle('vcs:log', async (_e, idx, limit) => projectService.vcsLog(idx, limit))
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
    if (vcs?.openCommitGui) {
      return vcs.openCommitGui(proj.path)
    }
    return false
  })
  ipcMain.handle('vcs:checkRemote', async (_e, projects) => {
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
  ipcMain.handle('vcs:checkLocal', async (_e, projects) => {
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
  ipcMain.handle('vcs:info', async (_e, idx) => projectService.getVcsInfo(idx))
  ipcMain.handle('vcs:count', (_e, projects) => {
    return projects.filter((p: { name: string; path: string }) => vcsRegistry.detect(p.path) !== null).length
  })
  ipcMain.handle('vcs:migrate', async (_e, idx, params) => {
    const proj = projectService.getProjectByIndex(idx)
    const name = proj?.name || `#${idx}`
    const modeLabels: Record<string, string> = { svn: 'SVN', git: 'Git', copy: '复制' }
    const modeLabel = modeLabels[params.mode] || params.mode
    const taskId = taskMgr.addTask(`迁移项目:${name}`, async (report) => {
      report(`开始迁移: ${name} (${modeLabel})`, 5)
      const ok = await projectService.migrateProject(idx, params)
      if (ok) report(`迁移完成: ${name}`, 100)
      else throw new Error(`迁移失败: ${name}`)
    })
    return true
  })

  // ====== 代理 ======
  ipcMain.handle('proxy:detect', (_e, projectPath) => {
    const result = proxyConfig.detectConfigFile(projectPath)
    if (!result) return null
    let proxies: any[] = []
    if (result.configPath) {
      const parsed = proxyConfig.parseProxyConfig(result.configPath)
      proxies = parsed.proxies
    }
    return { ...result, proxies }
  })
  ipcMain.handle('proxy:parse', (_e, configPath) => {
    return proxyConfig.parseProxyConfig(configPath)
  })
  ipcMain.handle('proxy:update', (_e, configPath, proxyPath, newUrl) => {
    const [ok, err] = proxyConfig.updateProxyTarget(configPath, proxyPath, newUrl)
    if (!ok && err) throw new Error(err)
    return ok
  })
  ipcMain.handle('proxy:batchUpdate', async (_e, configPath, changes) => {
    const result = proxyConfig.batchUpdateProxyTargets(configPath, changes)
    // 只返回失败的条数，避免序列化复杂对象
    return result.failed.length
  })

  // ====== 设置 ======
  ipcMain.handle('settings:get', (_e, key) => settings.get(key))
  ipcMain.handle('settings:set', (_e, key, value) => {
    settings.set(key, value)
    if (key === 'theme') {
      mainWindow?.webContents.send('event:themeChanged', value)
    }
  })
  ipcMain.handle('settings:getSchema', () => {
    const schemaPath = join(require('path').dirname(sourceMgr['sourcesPath'] || ''), 'settings_schema.json')
    if (existsSync(schemaPath)) {
      return JSON.parse(readFileSync(schemaPath, 'utf-8'))
    }
    return []
  })
  ipcMain.handle('settings:getPath', () => {
    return settings['path'] || ''
  })

  // ====== 更新 ======
  ipcMain.handle('update:check', async () => updateService.checkUpdate())
  ipcMain.handle('update:download', async (_e, url, filename) => {
    const taskId = taskMgr.addTask('下载更新')
    let resolvePromise: (value: string) => void
    let rejectPromise: (err: Error) => void
    const promise = new Promise<string>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })

    taskMgr.setTaskTarget(taskId, async (report) => {
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
    const { exec } = require('child_process')
    projectService.stopAll()
    exec(`"${filePath}"`, (err: any) => {
      if (!err) app.quit()
    })
  })

  // ====== 通知 ======
  ipcMain.handle('notification:getAll', () => notificationService.getAll())
  ipcMain.handle('notification:getUnreadCount', () => notificationService.getUnreadCount())
  ipcMain.handle('notification:create', (_e, type, title, message, projectName) => {
    return notificationService.createNotification(type, title, message, projectName)
  })
  ipcMain.handle('notification:markRead', (_e, id) => notificationService.markRead(id))
  ipcMain.handle('notification:markAllRead', () => notificationService.markAllRead())
  ipcMain.handle('notification:clearAll', () => notificationService.clearAll())

  ipcMain.handle('vcs:startRemoteCheck', (_e, intervalMinutes) => {
    startRemoteCheckTimer(intervalMinutes)
  })
  ipcMain.handle('vcs:startLocalCheck', (_e, intervalMinutes) => {
    startLocalCheckTimer(intervalMinutes)
  })
  ipcMain.handle('vcs:stopChecks', () => {
    if (remoteCheckTimer) clearInterval(remoteCheckTimer)
    if (localCheckTimer) clearInterval(localCheckTimer)
  })

  // ====== 系统 ======
  ipcMain.handle('system:getVersion', () => appVersion)
  ipcMain.handle('system:getDataDir', () => {
    return ensureDataDir(APP_NAME, getSourceRoot())
  })
  ipcMain.handle('system:getSourceRoot', () => getSourceRoot())
  ipcMain.handle('system:scanDataDir', () => scanDataDir(APP_NAME))
  ipcMain.handle('system:deleteDataDirItem', (_e, itemPath) => deleteItem(itemPath))
  ipcMain.handle('system:getJavaHomes', () => discoverJavaHomes())
  ipcMain.handle('system:getMavenHomes', () => discoverMavenHomes())
  ipcMain.handle('system:getTomcatHomes', () => discoverTomcatHomes())
  ipcMain.handle('system:readPomFinalName', (_e, projectPath) => readPomFinalName(projectPath))
  ipcMain.handle('system:readMarkdown', (_e, fileName) => {
    const { readFileSync } = require('fs')
    try {
      return readFileSync(join(getSourceRoot(), fileName), 'utf-8')
    } catch {
      return null
    }
  })
  ipcMain.handle('system:selectDirectory', async (_e, defaultPath?: string) => {
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('output:log', (_e, type: string, text: string) => {
    mainWindow?.webContents.send('event:output', { type, text })
  })
}

// 初始化服务
function initServices(): void {
  const sourceRoot = getSourceRoot()
  const dataDir = ensureDataDir(APP_NAME, sourceRoot)

  // 读版本号
  const configPath = join(sourceRoot, 'config.json')
  appVersion = getAppVersion(configPath)

  // 设置
  const assetDir = join(dataDir, 'assets')
  const schemaPath = join(assetDir, 'settings_schema.json')
  const settingsPath = join(assetDir, 'settings.json')
  settings = new AppSettings(settingsPath, schemaPath)

  // 确保 assets 下有 projects.json
  const projectsPath = join(assetDir, 'projects.json')
  if (!existsSync(projectsPath)) {
    ProjectRepository.save(projectsPath, [])
  }

  // 项目源
  const sourcesPath = join(assetDir, 'sources.json')
  sourceMgr = new SourceManager(sourcesPath)

  // 首次使用或源为空时，强制创建默认源
  let sources = sourceMgr.listSources()
  if (sources.length === 0) {
    sourceMgr.addSource('default', projectsPath, 'file')
    sourceMgr.save()
    sources = sourceMgr.listSources()
  }

  // 确保当前源指向有效配置
  const activeName = sourceMgr.getActiveSourceName()
  const activeSource = sources.find((s) => s.name === activeName)
  if (!activeSource) {
    sourceMgr.switchSource(sources[0].name)
  }

  // 恢复上次使用的源
  const last = settings.lastSource
  if (last && last !== sourceMgr.getActiveSourceName()) {
    const found = sources.find((s) => s.name === last)
    if (found) {
      sourceMgr.switchSource(last)
    }
  }

  // 加载项目列表
  const activeConfigPath = sourceMgr.getActiveConfigPath()
  const projects = ProjectRepository.load(activeConfigPath)

  // 进程管理器
  processMgr = new ProcessManager(settings.protectedPorts)

  // 项目管理器
  projectService = new ProjectManagerService(processMgr)
  projectService.refreshProjects(projects)

  // 任务管理器
  taskMgr = new TaskManager()

  // 更新服务
  const updateUrl = settings.get('update.url', '')
  updateService = new UpdateService(updateUrl)

  // 通知服务
  const notifyPath = join(assetDir, 'notifications.json')
  notificationService = new NotificationService(notifyPath, (key, defaultVal) => settings.get(key, defaultVal))

  // 转发通知事件
  notificationService.on('notificationCreated', (data) => {
    mainWindow?.webContents.send('event:notificationCreated', data)
  })
  notificationService.on('notificationsCleared', () => {
    mainWindow?.webContents.send('event:notificationsCleared')
  })

  // 转发任务事件
  taskMgr.on('taskStarted', (data) => {
    mainWindow?.webContents.send('event:taskStarted', data)
  })
  taskMgr.on('taskProgress', (data) => {
    mainWindow?.webContents.send('event:taskProgress', data)
  })
  taskMgr.on('taskCompleted', (data) => {
    mainWindow?.webContents.send('event:taskCompleted', data)
  })
  taskMgr.on('taskFailed', (data) => {
    mainWindow?.webContents.send('event:taskFailed', data)
    notificationService.createNotification('error', `任务失败: ${data.name}`, data.error || '')
  })

  // 更新事件
  updateService.on('updateAvailable', (data) => {
    mainWindow?.webContents.send('event:updateAvailable', data)
    notificationService.createNotification('info', '发现新版本', `安装包: ${data.filename}`)
  })
  updateService.on('updateNotFound', () => {
    mainWindow?.webContents.send('event:updateNotFound')
  })
  updateService.on('updateCheckError', (message) => {
    mainWindow?.webContents.send('event:updateCheckError', { message })
  })
  updateService.on('updateDownloaded', (filePath) => {
    mainWindow?.webContents.send('event:updateDownloaded', { filePath })
  })
}

// 单实例锁
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
