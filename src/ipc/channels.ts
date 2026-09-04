/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \src\ipc\channels.ts
 * @Description: IPC 通道常量表，主进程与渲染进程共用，通道名改一处生效
 */

// 请求通道
export const IPC = {
  buildTool: {
    detectBatch: 'buildTool:detectBatch',
  },
  notification: {
    create: 'notification:create',
    getAll: 'notification:getAll',
    getUnreadCount: 'notification:getUnreadCount',
    clearAll: 'notification:clearAll',
    markAllRead: 'notification:markAllRead',
    markRead: 'notification:markRead',
  },
  portConfig: {
    detect: 'portConfig:detect',
    update: 'portConfig:update',
  },
  process: {
    getAllRunningPaths: 'process:getAllRunningPaths',
    getAllRunningScripts: 'process:getAllRunningScripts',
    getRunningInfo: 'process:getRunningInfo',
    getTotalScriptsCount: 'process:getTotalScriptsCount',
    killPid: 'process:killPid',
    killPort: 'process:killPort',
    listByPort: 'process:listByPort',
    start: 'process:start',
    startByPath: 'process:startByPath',
    stop: 'process:stop',
    stopByPath: 'process:stopByPath',
    stopScript: 'process:stopScript',
  },
  project: {
    detectConfigFile: 'project:detectConfigFile',
    getDefaultConfigPath: 'project:getDefaultConfigPath',
    getRunnableModules: 'project:getRunnableModules',
    load: 'project:load',
    loadAll: 'project:loadAll',
    save: 'project:save',
  },
  projectMgr: {
    build: 'projectMgr:build',
    cleanArtifacts: 'projectMgr:cleanArtifacts',
    cleanDependencies: 'projectMgr:cleanDependencies',
    delete: 'projectMgr:delete',
    getContextMenu: 'projectMgr:getContextMenu',
    getDependencyDirs: 'projectMgr:getDependencyDirs',
    getTaskList: 'projectMgr:getTaskList',
    openFolder: 'projectMgr:openFolder',
    remove: 'projectMgr:remove',
    rename: 'projectMgr:rename',
    runScript: 'projectMgr:runScript',
    runTask: 'projectMgr:runTask',
    scanBuildArtifacts: 'projectMgr:scanBuildArtifacts',
  },
  projectType: {
    getCapabilities: 'projectType:getCapabilities',
  },
  proxyConfig: {
    detect: 'proxyConfig:detect',
    update: 'proxyConfig:update',
  },
  settings: {
    get: 'settings:get',
    getSchema: 'settings:getSchema',
    set: 'settings:set',
  },
  source: {
    getActive: 'source:getActive',
    list: 'source:list',
    refreshCurrent: 'source:refreshCurrent',
    remove: 'source:remove',
    rename: 'source:rename',
    startScanTask: 'source:startScanTask',
    switch: 'source:switch',
  },
  store: {
    get: 'store:get',
    set: 'store:set',
  },
  system: {
    deleteDataDirItem: 'system:deleteDataDirItem',
    getGradleHomes: 'system:getGradleHomes',
    getJavaHomes: 'system:getJavaHomes',
    getMavenHomes: 'system:getMavenHomes',
    getTerminalEntries: 'system:getTerminalEntries',
    getTomcatHomes: 'system:getTomcatHomes',
    log: 'system:log',
    openFileWith: 'system:openFileWith',
    openTerminal: 'system:openTerminal',
    scanDataDir: 'system:scanDataDir',
    selectDirectory: 'system:selectDirectory',
  },
  task: {
    cancel: 'task:cancel',
    clearFinished: 'task:clearFinished',
    get: 'task:get',
    getActive: 'task:getActive',
    getAll: 'task:getAll',
  },
  vcs: {
    checkLocal: 'vcs:checkLocal',
    checkRemote: 'vcs:checkRemote',
    checkUpdates: 'vcs:checkUpdates',
    count: 'vcs:count',
    detect: 'vcs:detect',
    detectBatch: 'vcs:detectBatch',
    info: 'vcs:info',
    migrate: 'vcs:migrate',
    openCommitGuiByPath: 'vcs:openCommitGuiByPath',
    openLogGuiByPath: 'vcs:openLogGuiByPath',
    openRepoBrowserByPath: 'vcs:openRepoBrowserByPath',
    pullProjects: 'vcs:pullProjects',
    revisionInfo: 'vcs:revisionInfo',
    startLocalCheck: 'vcs:startLocalCheck',
    startRemoteCheck: 'vcs:startRemoteCheck',
    stopChecks: 'vcs:stopChecks',
    updateByPath: 'vcs:updateByPath',
    updateRange: 'vcs:updateRange',
  },
} as const

// 事件通道
export const IPC_EVENT = {
  notificationCreated: 'event:notificationCreated',
  notificationsCleared: 'event:notificationsCleared',
  output: 'event:output',
  outputBatch: 'event:outputBatch',
  outputLine: 'event:outputLine',
  portDetected: 'event:portDetected',
  projectStarted: 'event:projectStarted',
  projectStopped: 'event:projectStopped',
  settingsChanged: 'event:settingsChanged',
  taskCompleted: 'event:taskCompleted',
  taskFailed: 'event:taskFailed',
  taskProgress: 'event:taskProgress',
  taskStarted: 'event:taskStarted',
  themeChanged: 'event:themeChanged',
  updateAvailable: 'event:updateAvailable',
  updateCheckError: 'event:updateCheckError',
  updateDownloaded: 'event:updateDownloaded',
  updateNotFound: 'event:updateNotFound',
  menu: 'menu:event',
} as const
