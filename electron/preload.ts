// 通过 contextBridge 暴露 IPC 接口给渲染进程
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi } from '../src/types/ipc'

const electronAPI: IpcApi = {
  // 项目
  loadProjects: (configPath) => ipcRenderer.invoke('project:load', configPath),
  saveProjects: (configPath, projects) => ipcRenderer.invoke('project:save', configPath, projects),
  discoverProjects: (rootDir) => ipcRenderer.invoke('project:discover', rootDir),
  getDefaultConfigPath: () => ipcRenderer.invoke('project:getDefaultConfigPath'),

  // 项目源
  listSources: (includeCounts) => ipcRenderer.invoke('source:list', includeCounts),
  getActiveSource: () => ipcRenderer.invoke('source:getActive'),
  getActiveSourceInfo: () => ipcRenderer.invoke('source:getActiveInfo'),
  switchSource: (name) => ipcRenderer.invoke('source:switch', name),
  addSource: (name, configPath, sourceType, extra) =>
    ipcRenderer.invoke('source:add', name, configPath, sourceType, extra),
  renameSource: (oldName, newName) => ipcRenderer.invoke('source:rename', oldName, newName),
  removeSource: (name) => ipcRenderer.invoke('source:remove', name),
  createSourceFromDirectory: (name, directory) => ipcRenderer.invoke('source:createFromDir', name, directory),
  refreshCurrentSource: () => ipcRenderer.invoke('source:refreshCurrent'),

  // 进程
  startProject: (idx, command) => ipcRenderer.invoke('process:start', idx, command),
  stopProject: (idx) => ipcRenderer.invoke('process:stop', idx),
  stopScript: (idx, command) => ipcRenderer.invoke('process:stopScript', idx, command),
  isRunning: (idx) => ipcRenderer.invoke('process:isRunning', idx),
  getRunningInfo: () => ipcRenderer.invoke('process:getRunningInfo'),
  getAllRunningPaths: () => ipcRenderer.invoke('process:getAllRunningPaths'),
  getTotalScriptsCount: () => ipcRenderer.invoke('process:getTotalScriptsCount'),
  getRunningScripts: (idx) => ipcRenderer.invoke('process:getRunningScripts', idx),
  getRunningScriptsByPath: (path) => ipcRenderer.invoke('process:getRunningScriptsByPath', path),
  killPort: (port) => ipcRenderer.invoke('process:killPort', port),
  stopAll: () => ipcRenderer.invoke('process:stopAll'),

  // 项目业务
  resolveTarget: (target) => ipcRenderer.invoke('projectMgr:resolveTarget', target),
  getProjectByIndex: (configPath, idx) => ipcRenderer.invoke('projectMgr:getByIndex', configPath, idx),
  removeProject: (configPath, idx) => ipcRenderer.invoke('projectMgr:remove', configPath, idx),
  deleteProject: (configPath, idx) => ipcRenderer.invoke('projectMgr:delete', configPath, idx),
  renameProject: (configPath, idx, newName) => ipcRenderer.invoke('projectMgr:rename', configPath, idx, newName),
  refreshProjects: (configPath) => ipcRenderer.invoke('projectMgr:refresh', configPath),
  openFolder: (path) => ipcRenderer.invoke('projectMgr:openFolder', path),
  buildProject: (idx, command, zipName) => ipcRenderer.invoke('projectMgr:build', idx, command, zipName),
  scanBuildArtifacts: (idx) => ipcRenderer.invoke('projectMgr:scanBuildArtifacts', idx),
  cleanArtifacts: (idx, paths) => ipcRenderer.invoke('projectMgr:cleanArtifacts', idx, paths),
  getDependencyDirs: (idx) => ipcRenderer.invoke('projectMgr:getDependencyDirs', idx),
  cleanDependencies: (idx) => ipcRenderer.invoke('projectMgr:cleanDependencies', idx),
  getTaskList: (idx) => ipcRenderer.invoke('projectMgr:getTaskList', idx),
  runScript: (idx, command) => ipcRenderer.invoke('projectMgr:runScript', idx, command),
  runTask: (idx, command) => ipcRenderer.invoke('projectMgr:runTask', idx, command),

  // VCS
  vcsUpdate: (idx) => ipcRenderer.invoke('vcs:update', idx),
  vcsUpdateRange: (params) => ipcRenderer.invoke('vcs:updateRange', params),
  vcsLog: (idx, limit) => ipcRenderer.invoke('vcs:log', idx, limit),
  vcsOpenLogGui: (idx) => ipcRenderer.invoke('vcs:openLogGui', idx),
  vcsOpenCommitGui: (idx) => ipcRenderer.invoke('vcs:openCommitGui', idx),
  vcsCheckRemote: (projects) => ipcRenderer.invoke('vcs:checkRemote', projects),
  vcsCheckLocal: (projects) => ipcRenderer.invoke('vcs:checkLocal', projects),
  vcsGetInfo: (idx) => ipcRenderer.invoke('vcs:info', idx),
  vcsCount: (projects) => ipcRenderer.invoke('vcs:count', projects),
  vcsMigrate: (idx, params) => ipcRenderer.invoke('vcs:migrate', idx, params),
  detectVcs: (projectPath) => ipcRenderer.invoke('vcs:detect', projectPath),
  detectVcsBatch: (projectPaths) => ipcRenderer.invoke('vcs:detectBatch', projectPaths),

  // 代理配置
  detectConfigFile: (projectPath) => ipcRenderer.invoke('proxy:detect', projectPath),
  parseProxyConfig: (configPath) => ipcRenderer.invoke('proxy:parse', configPath),
  updateProxyTarget: (configPath, proxyPath, newUrl) =>
    ipcRenderer.invoke('proxy:update', configPath, proxyPath, newUrl),
  batchUpdateProxyTargets: (configPath, changes) => ipcRenderer.invoke('proxy:batchUpdate', configPath, changes),

  // 设置
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getSettingsSchema: () => ipcRenderer.invoke('settings:getSchema'),
  getSettingsPath: () => ipcRenderer.invoke('settings:getPath'),

  // 更新
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (url, filename) => ipcRenderer.invoke('update:download', url, filename),
  installUpdate: (filePath) => ipcRenderer.invoke('update:install', filePath),

  // 任务
  getActiveTasks: () => ipcRenderer.invoke('task:getActive'),
  getAllTasks: () => ipcRenderer.invoke('task:getAll'),
  getTask: (taskId) => ipcRenderer.invoke('task:get', taskId),
  cancelTask: (taskId) => ipcRenderer.invoke('task:cancel', taskId),

  // 通知
  getNotifications: () => ipcRenderer.invoke('notification:getAll'),
  getUnreadCount: () => ipcRenderer.invoke('notification:getUnreadCount'),
  createNotification: (type, title, message, projectName) =>
    ipcRenderer.invoke('notification:create', type, title, message, projectName),
  markRead: (id) => ipcRenderer.invoke('notification:markRead', id),
  markAllRead: () => ipcRenderer.invoke('notification:markAllRead'),
  clearAllNotifications: () => ipcRenderer.invoke('notification:clearAll'),

  // VCS 定时检查
  startRemoteCheck: (intervalMinutes) => ipcRenderer.invoke('vcs:startRemoteCheck', intervalMinutes),
  startLocalCheck: (intervalMinutes) => ipcRenderer.invoke('vcs:startLocalCheck', intervalMinutes),
  stopVcsChecks: () => ipcRenderer.invoke('vcs:stopChecks'),

  // 系统
  getVersion: () => ipcRenderer.invoke('system:getVersion'),
  getDataDir: () => ipcRenderer.invoke('system:getDataDir'),
  getSourceRoot: () => ipcRenderer.invoke('system:getSourceRoot'),
  scanDataDir: () => ipcRenderer.invoke('system:scanDataDir'),
  deleteDataDirItem: (itemPath) => ipcRenderer.invoke('system:deleteDataDirItem', itemPath),
  getJavaHomes: () => ipcRenderer.invoke('system:getJavaHomes'),
  getMavenHomes: () => ipcRenderer.invoke('system:getMavenHomes'),
  getTomcatHomes: () => ipcRenderer.invoke('system:getTomcatHomes'),
  readPomFinalName: (projectPath) => ipcRenderer.invoke('system:readPomFinalName', projectPath),
  readMarkdown: (fileName) => ipcRenderer.invoke('system:readMarkdown', fileName),

  // 事件监听
  onOutputLine: (callback) => {
    ipcRenderer.on('event:outputLine', (_e, data) => callback(data))
  },
  onTaskStarted: (callback) => {
    ipcRenderer.on('event:taskStarted', (_e, data) => callback(data))
  },
  onTaskProgress: (callback) => {
    ipcRenderer.on('event:taskProgress', (_e, data) => callback(data))
  },
  onTaskCompleted: (callback) => {
    ipcRenderer.on('event:taskCompleted', (_e, data) => callback(data))
  },
  onTaskFailed: (callback) => {
    ipcRenderer.on('event:taskFailed', (_e, data) => callback(data))
  },
  onNotificationCreated: (callback) => {
    ipcRenderer.on('event:notificationCreated', (_e, data) => callback(data))
  },
  onNotificationsCleared: (callback) => {
    ipcRenderer.on('event:notificationsCleared', () => callback())
  },
  onProjectStarted: (callback) => {
    ipcRenderer.on('event:projectStarted', (_e, data) => callback(data))
  },
  onProjectStopped: (callback) => {
    ipcRenderer.on('event:projectStopped', (_e, data) => callback(data))
  },
  onPortDetected: (callback) => {
    ipcRenderer.on('event:portDetected', (_e, data) => callback(data))
  },
  logOutput: (type, text) => ipcRenderer.invoke('output:log', type, text),
  onOutput: (callback) => {
    ipcRenderer.on('event:output', (_e, data) => callback(data))
  },
  onThemeChanged: (callback) => {
    ipcRenderer.on('event:themeChanged', (_e, data) => callback(data))
  },
  selectDirectory: (defaultPath) => ipcRenderer.invoke('system:selectDirectory', defaultPath),
  onMenuEvent: (callback) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('menu:event', handler)
    return () => ipcRenderer.removeListener('menu:event', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
