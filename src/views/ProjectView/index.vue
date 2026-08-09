<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\views\ProjectView\index.vue
 * @Description: 项目视图，组合工具栏、搜索栏、筛选栏、表格和对话框逻辑
-->
<template>
  <div class="project-view">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div>
        <el-button :icon="Management" plain @click="openSourceManage">管理项目源</el-button>
      </div>
      <div>
        <el-button :icon="Plus" plain @click="handleAddSource">添加项目源</el-button>
      </div>
      <div>
        <el-button :icon="Refresh" plain :loading="refreshing" @click="handleRefresh">刷新项目源</el-button>
      </div>
      <el-divider direction="vertical" />
    </div>

    <!-- 搜索栏 -->
    <SearchBar @scope-change="onScopeChange" />

    <!-- 主内容：表格 -->
    <div class="main-content">
      <ProjectTable
        :projects="filteredProjects"
        :allSourcesMode="allSourcesMode"
        @action="handleRowAction"
        @run-script="handleRunScript"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// #region Imports
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Refresh, Management, Plus } from '@element-plus/icons-vue'
import { useProjectStore } from '../../stores/project.store'
import { useNotificationStore } from '../../stores/notification.store'
import { useInfo, useError, useSuccess, useWarning, useConfirm, usePrompt } from '../../composables/useMessage'
import { useModal } from '../../composables/useModal'

import SearchBar from './components/SearchBar.vue'
import ProjectTable from './components/ProjectTable.vue'

import BuildDialog from './modals/project/BuildModal.vue'
import CleanModalComp from './modals/project/CleanModal.vue'
import InstallDialog from './modals/project/InstallModal.vue'
import MigrateDialog from './modals/project/MigrateModal.vue'
import AddSourceDialog from './modals/project/AddSourceModal.vue'
import SourceManageDialog from './modals/project/SourceManageModal.vue'
import VcsRangeDialog from './modals/version-control/VcsRangeModal.vue'
import SettingsModal from './modals/settings/SettingsModal.vue'
import StartModuleDialog from './modals/project-type/StartModuleModal.vue'
import DataDirDialog from './modals/system/DataDirModal.vue'
import TaskDetailDialog from './modals/task/TaskDetailModal.vue'
import ProxyModal from './modals/project-type/ProxyModal.vue'
import PortModal from './modals/project-type/PortModal.vue'
import HomeSelectorDialog from './modals/project/HomeSelectorModal.vue'
// #endregion

// #region Store & State
const store = useProjectStore()
const notifyStore = useNotificationStore()

// 视图状态
const allSourcesMode = ref(false)
const allProjects = ref<any[]>([])
const refreshing = ref(false)

// useModal 实例
const buildModal = useModal({ component: BuildDialog })
const cleanModal = useModal({ component: CleanModalComp })
const installModal = useModal({ component: InstallDialog })
const migrateModal = useModal({ component: MigrateDialog })
const addSourceModal = useModal({ component: AddSourceDialog })
const sourceManageModal = useModal({ component: SourceManageDialog })
const vcsRangeModal = useModal({ component: VcsRangeDialog })
const settingsModal = useModal({ component: SettingsModal })
const dataDirModal = useModal({ component: DataDirDialog })
const taskDetailModal = useModal({ component: TaskDetailDialog })
const proxyModal = useModal({ component: ProxyModal })
const portModal = useModal({ component: PortModal })
const startModuleModal = useModal({ component: StartModuleDialog })
const selectorModal = useModal({ component: HomeSelectorDialog })

// 操作目标上下文（在 open 和 confirm 回调之间传递）
let currentBuildTarget = { idx: 0, name: '', path: '', type: 'npm' as string, scripts: {} as Record<string, string> }
let currentInstallTarget = { idx: 0, name: '', type: 'npm' as string }
let currentCleanIdx = 0
let currentMigrateTarget = { idx: 0, name: '', path: '' }
let currentSelectorConfig = { idx: 0, key: '' as string }
// #endregion

// #region Helpers
function getProjectByIdx(idx: number): any {
  const list = (allSourcesMode.value ? allProjects.value : store.projects) as any
  return list[idx - 1] || null
}

function warnAllSources(op: string): boolean {
  if (allSourcesMode.value) {
    useWarning(`"所有源"模式下暂不支持${op}，请先切换到具体项目源`)
    return true
  }
  return false
}

function getBuildCommands(type: string): string[] | undefined {
  if (type === 'maven')
    return ['mvn package -DskipTests', 'mvn package', 'mvn clean package', 'mvn install -DskipTests']
  if (type === 'gradle') return ['gradle build -x test', 'gradle build', 'gradle clean build']
  return undefined
}
// #endregion

// #region Source Switching
function onScopeChange(val: string) {
  if (val === '__all__') {
    allSourcesMode.value = true
    window.electronAPI.invoke('project:loadAll').then((projs) => {
      allProjects.value = (projs as any[]).map((p, i) => ({ ...p, _origIdx: i + 1 }))
      detectAllBuildTools()
    })
  } else {
    allSourcesMode.value = false
    allProjects.value = []
  }
}

/**
 * 检测所有源模式下的构建工具
 */
async function detectAllBuildTools() {
  const npmPaths = allProjects.value
    .filter((p: any) => p.projectType === 'npm')
    .map((p: any) => p.path)
    .filter(Boolean)
  if (npmPaths.length === 0) return
  try {
    const result = await window.electronAPI.invoke('buildTool:detectBatch', npmPaths)
    store.buildTools = { ...store.buildTools, ...result }
  } catch {
    // 静默失败
  }
}

// 刷新项目源
async function handleRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await window.electronAPI.invoke('source:refreshCurrent')
  } catch {
    // ignore
  } finally {
    refreshing.value = false
  }
}
// #endregion

// #region Computed
// 筛选
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const needIndexMap = computed(() => {
  const s = allSourcesMode.value ? allProjects.value : store.projects
  return s.map((p, i) => ({ ...p, _origIdx: i + 1 }))
})

const filteredProjects = computed(() => {
  const keyword = store.searchText
  const caseSensitive = store.searchCaseSensitive
  const wholeWord = store.searchWholeWord
  const useRegex = store.searchRegex

  const source = needIndexMap.value
  if (!keyword) return source

  let pattern: RegExp | null = null
  if (keyword) {
    try {
      const flags = caseSensitive ? 'g' : 'gi'
      if (useRegex) {
        pattern = new RegExp(keyword, flags)
      } else if (wholeWord) {
        pattern = new RegExp('\\b' + escapeRegex(keyword) + '\\b', flags)
      } else {
        pattern = new RegExp(escapeRegex(keyword), flags)
      }
    } catch {
      pattern = null
    }
  }

  return source.filter((p) => {
    if (pattern) {
      const match = pattern.test(p.name) || pattern.test(p.path)
      if (!match) return false
    }
    return true
  })
})
// #endregion

// #region Action Handlers
async function handleStart(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return

  // 检查 Maven/Gradle 多模块项目
  const modules = await window.electronAPI.invoke('project:getRunnableModules', idx)
  if (modules && modules.length > 1) {
    // 获取当前运行中的脚本命令，用于标记运行状态
    const runningScripts: Record<string, string[]> = await window.electronAPI.invoke('process:getAllRunningScripts')
    const runningCmds = runningScripts[proj.path] || []

    startModuleModal.open(
      { projectName: proj.name, modules, runningCommands: runningCmds },
      {
        confirm: async (mods: any[]) => {
          for (const module of mods) {
            window.electronAPI.invoke('system:log', 'info', `启动 [${proj.name}] → ${module.name} ...`)
            if (allSourcesMode.value) {
              await window.electronAPI.invoke(
                'process:startByPath',
                proj.path,
                `mvn spring-boot:run -pl ${module.modulePath}`,
              )
            } else {
              await window.electronAPI.invoke('process:start', idx, `mvn spring-boot:run -pl ${module.modulePath}`)
            }
          }
          await store.refreshRunningInfo()
        },
        stop: async (mod: any) => {
          window.electronAPI.invoke('system:log', 'warning', `停止 [${proj.name}] → ${mod.name} ...`)
          await window.electronAPI.invoke('process:stopScript', idx, `mvn spring-boot:run -pl ${mod.modulePath}`)
          await store.refreshRunningInfo()
          // 刷新弹窗里的运行状态
          handleStart(idx)
        },
      },
    )
    return
  }

  window.electronAPI.invoke('system:log', 'info', `启动 [${proj.name}] ...`)
  if (allSourcesMode.value) {
    await window.electronAPI.invoke('process:startByPath', proj.path)
  } else {
    await window.electronAPI.invoke('process:start', idx)
  }
  await store.refreshRunningInfo()
}

async function handleStop(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return

  // 检查 Maven/Gradle 多模块项目 — 复用启动弹窗显示运行状态
  const modules = await window.electronAPI.invoke('project:getRunnableModules', idx)
  if (modules && modules.length > 1) {
    const runningScripts = await window.electronAPI.invoke('process:getAllRunningScripts')
    const runningCmds = (runningScripts?.[proj.path] || []) as string[]
    if (runningCmds.length === 0) {
      window.electronAPI.invoke('system:log', 'warning', `停止 [${proj.name}] — 无运行中的模块`)
      return
    }
    startModuleModal.open(
      { projectName: proj.name, modules, runningCommands: runningCmds, mode: 'stop' },
      {
        stop: async (mod: any) => {
          window.electronAPI.invoke('system:log', 'warning', `停止 [${proj.name}] → ${mod.name} ...`)
          await window.electronAPI.invoke('process:stopScript', idx, `mvn spring-boot:run -pl ${mod.modulePath}`)
          await store.refreshRunningInfo()
          handleStop(idx)
        },
        stopAll: async () => {
          window.electronAPI.invoke('system:log', 'warning', `停止 [${proj.name}] 全部模块 ...`)
          await window.electronAPI.invoke('process:stop', idx)
          await store.refreshRunningInfo()
        },
      },
    )
    return
  }

  window.electronAPI.invoke('system:log', 'warning', `停止 [${proj.name}] ...`)
  if (allSourcesMode.value) {
    await window.electronAPI.invoke('process:stopByPath', proj.path)
  } else {
    await window.electronAPI.invoke('process:stop', idx)
  }
  await store.refreshRunningInfo()
}

function handleOpenFolder(path: string) {
  window.electronAPI.invoke('projectMgr:openFolder', path)
}

// VCS 操作
async function handleVcsUpdate(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return
  await window.electronAPI.invoke('vcs:updateByPath', proj.path, proj.name)
}

async function handleVcsLog(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const opened = await window.electronAPI.invoke('vcs:openLogGuiByPath', proj.path)
  if (!opened) {
    useInfo(`[${proj.name}] 未发现 GUI 客户端，使用命令行输出`)
  }
}

async function handleVcsCommit(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const opened = await window.electronAPI.invoke('vcs:openCommitGuiByPath', proj.path)
  if (!opened) useError(`[${proj.name}] 未发现 GUI 客户端`)
}

async function handleVcsRepoBrowser(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const opened = await window.electronAPI.invoke('vcs:openRepoBrowserByPath', proj.path)
  if (!opened) useError(`[${proj.name}] 未发现 TortoiseSVN`)
}

async function handleVcsCheck(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const vcs = await window.electronAPI.invoke('vcs:detect', proj.path)
  if (!vcs) {
    useInfo(`[${proj.name}] 不是版本控制项目`)
    return
  }
  const [remote, local] = await Promise.all([
    window.electronAPI.invoke('vcs:checkRemote', [{ name: proj.name, path: proj.path }]),
    window.electronAPI.invoke('vcs:checkLocal', [{ name: proj.name, path: proj.path }]),
  ])
  const total = remote.length + local.length
  if (total > 0) useWarning(`[${proj.name}] ${total} 项变更`)
  else useInfo(`[${proj.name}] 没有发现变更`)
  notifyStore.load()
}

// 对话框操作
async function handleBuild(idx: number) {
  if (warnAllSources('构建操作')) return
  const proj = getProjectByIdx(idx)
  if (!proj) return
  currentBuildTarget = { idx, name: proj.name, path: proj.path, type: proj.projectType, scripts: {} }
  try {
    const taskInfo = await window.electronAPI.invoke('projectMgr:getTaskList', idx)
    currentBuildTarget.scripts = taskInfo?.tasks || {}
  } catch {
    // ignore
  }
  buildModal.open(
    {
      projectName: currentBuildTarget.name,
      projectPath: currentBuildTarget.path,
      projectType: currentBuildTarget.type,
      scripts: currentBuildTarget.scripts,
      buildCommands: getBuildCommands(currentBuildTarget.type),
    },
    {
      confirm: (_cmd: string, _zip: string) => {
        const t = currentBuildTarget
        window.electronAPI.invoke('system:log', 'info', `[${t.name}] 构建命令: ${_cmd}`)
        window.electronAPI.invoke('projectMgr:build', t.idx, _cmd, _zip || undefined)
        window.electronAPI.invoke('system:log', 'success', `[${t.name}] 构建任务已启动`)
      },
    },
  )
}

async function handleInstall(idx: number) {
  if (warnAllSources('安装依赖')) return
  const proj = getProjectByIdx(idx)
  if (!proj) return
  currentInstallTarget = { idx, name: proj.name, type: proj.projectType }
  installModal.open(
    { projectName: currentInstallTarget.name, projectType: currentInstallTarget.type },
    {
      confirm: (_cmd: string) => {
        const t = currentInstallTarget
        window.electronAPI.invoke('system:log', 'info', `[${t.name}] 安装命令: ${_cmd}`)
        window.electronAPI.invoke('projectMgr:runTask', t.idx, _cmd)
        window.electronAPI.invoke('system:log', 'success', `[${t.name}] 安装依赖已启动`)
      },
    },
  )
}

async function handleClean(idx: number) {
  if (warnAllSources('清理操作')) return
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const artifacts = await window.electronAPI.invoke('projectMgr:scanBuildArtifacts', idx)
  if (artifacts.length === 0) {
    useInfo('没有可清理的构建产物')
    return
  }
  currentCleanIdx = idx
  cleanModal.open(
    { projectName: proj.name, items: artifacts },
    {
      confirm: (_paths: string[]) => {
        window.electronAPI.invoke('projectMgr:cleanArtifacts', currentCleanIdx, _paths)
        window.electronAPI.invoke('system:log', 'success', `已清理 ${_paths.length} 项`)
      },
    },
  )
}

async function handleCleanModules(idx: number) {
  if (warnAllSources('清理依赖')) return
  const dirs = await window.electronAPI.invoke('projectMgr:getDependencyDirs', idx)
  if (dirs.length === 0) {
    useInfo('没有可清理的依赖目录')
    return
  }
  const dirList = dirs.map((d: any) => `${d.name}: ${d.path}`).join('\n')
  const ok = await useConfirm('确认清理', `确认删除以下依赖目录？\n\n${dirList}`)
  if (!ok) return
  await window.electronAPI.invoke('projectMgr:cleanDependencies', idx)
  window.electronAPI.invoke('system:log', 'success', '依赖目录清理完成')
}

async function handleRename(idx: number) {
  if (warnAllSources('重命名')) return
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const newName = await usePrompt('重命名项目', `修改 [${proj.name}] 的显示名称:`, proj.name)
  if (!newName || !newName.trim()) return
  const configPath = await window.electronAPI.invoke('project:getDefaultConfigPath')
  await window.electronAPI.invoke('projectMgr:rename', configPath, idx, newName.trim())
  await store.loadProjects()
  useSuccess('项目已重命名')
}

async function handleRemove(idx: number) {
  if (warnAllSources('移除项目')) return
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const ok = await useConfirm('确认移除', `确认将 [${proj.name}] 从项目列表中移除？\n此操作不会删除项目文件。`)
  if (!ok) return
  const configPath = await window.electronAPI.invoke('project:getDefaultConfigPath')
  await window.electronAPI.invoke('projectMgr:remove', configPath, idx)
  await store.loadProjects()
  useSuccess(`项目 [${proj.name}] 已从列表中移除`)
}

async function handleDelete(idx: number) {
  if (warnAllSources('物理删除')) return
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const ok = await useConfirm(
    '确认物理删除',
    `确认物理删除项目 [${proj.name}]？\n此操作将永久删除整个项目目录，不可恢复！`,
    true,
  )
  if (!ok) return
  const configPath = await window.electronAPI.invoke('project:getDefaultConfigPath')
  await window.electronAPI.invoke('projectMgr:delete', configPath, idx)
  await store.loadProjects()
  useSuccess(`项目 [${proj.name}] 已物理删除`)
}

async function handleMigrate(idx: number) {
  if (warnAllSources('迁移项目')) return
  const proj = getProjectByIdx(idx)
  if (!proj) return
  currentMigrateTarget = { idx, name: proj.name, path: proj.path }
  const vcsInfo = await window.electronAPI.invoke('vcs:info', idx)
  migrateModal.open(
    { projectName: proj.name, projectPath: proj.path, svnInfo: vcsInfo, sources: store.sources },
    {
      confirm: (_mode: 'svn' | 'copy', _dir: string, _url: string) => {
        window.electronAPI.invoke('vcs:migrate', currentMigrateTarget.idx, {
          mode: _mode,
          targetDir: _dir,
          svnUrl: _url,
        })
      },
    },
  )
}

async function handleProxy(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return
  proxyModal.open({ projectName: proj.name, projectPath: proj.path })
}

async function handleProxyPort(idx: number) {
  const proj = getProjectByIdx(idx)
  if (!proj) return
  portModal.open({ projectName: proj.name, projectPath: proj.path })
}

async function handleAddSource() {
  addSourceModal.open(
    {},
    {
      done: async () => {
        await store.loadSources()
        await store.refreshRunningInfo()
      },
    },
  )
}

async function handleRunScript(idx: number, command: string) {
  if (warnAllSources('运行脚本')) return
  await window.electronAPI.invoke('projectMgr:runScript', idx, command)
  window.electronAPI.invoke('notification:create', 'info', '脚本已启动', command)
}

async function handleSetJava(idx: number) {
  if (warnAllSources('修改 Java 版本')) return
  const proj = getProjectByIdx(idx)
  if (!proj) return
  const homes = await window.electronAPI.invoke('system:getJavaHomes')
  if (homes.length === 0) {
    useWarning('未发现已安装的 JDK')
    return
  }
  currentSelectorConfig = { idx, key: 'javaHome' }
  selectorModal.open(
    { dialogTitle: 'Java 版本', currentValue: proj.javaHome || '', homes },
    { confirm: (_path: string) => onSelectorConfirm(_path) },
  )
}

async function handleSetMaven(idx: number) {
  if (warnAllSources('修改 Maven 版本')) return
  const proj = getProjectByIdx(idx)
  if (!proj || proj.projectType !== 'maven') return
  const homes = await window.electronAPI.invoke('system:getMavenHomes')
  currentSelectorConfig = { idx, key: 'mavenHome' }
  selectorModal.open(
    { dialogTitle: 'Maven 版本', currentValue: proj.mavenHome || '', homes },
    { confirm: (_path: string) => onSelectorConfirm(_path) },
  )
}

async function handleSetTomcat(idx: number) {
  if (warnAllSources('修改 Tomcat 版本')) return
  const proj = getProjectByIdx(idx)
  if (!proj || proj.projectType !== 'maven') return
  const homes = await window.electronAPI.invoke('system:getTomcatHomes')
  currentSelectorConfig = { idx, key: 'tomcatHome' }
  selectorModal.open(
    { dialogTitle: 'Tomcat 版本', currentValue: proj.tomcatHome || '', homes },
    { confirm: (_path: string) => onSelectorConfirm(_path) },
  )
}

async function onSelectorConfirm(path: string) {
  const { idx, key } = currentSelectorConfig
  const configPath = await window.electronAPI.invoke('project:getDefaultConfigPath')
  const existing = await window.electronAPI.invoke('project:load', configPath)
  const proj = existing[idx - 1]
  if (!proj) return
  ;(proj as any)[key] = path
  await window.electronAPI.invoke('project:save', configPath, existing)
  await store.loadProjects()
  useSuccess('已保存')
}

async function handleSetWarName(idx: number) {
  if (warnAllSources('修改 WAR 名称')) return
  const proj = getProjectByIdx(idx)
  if (!proj || proj.projectType !== 'maven') return
  const name = await usePrompt('WAR 名称', `WAR 名称（不含 .war 后缀）:`, proj.tomcatWarName)
  if (name === null) return
  const configPath = await window.electronAPI.invoke('project:getDefaultConfigPath')
  const existing = await window.electronAPI.invoke('project:load', configPath)
  const p = existing[idx - 1]
  if (!p) return
  p.tomcatWarName = name
  await window.electronAPI.invoke('project:save', configPath, existing)
  await store.loadProjects()
  useSuccess('WAR 名称已修改')
}

// 行动作分发表：动作名到处理函数的映射，统一按项目序号分发
const rowActionHandlers: Record<string, (idx: number) => void> = {
  start: handleStart,
  stop: handleStop,
  open: (idx: number) => {
    const proj = getProjectByIdx(idx)
    if (proj) handleOpenFolder(proj.path)
  },
  build: handleBuild,
  install: handleInstall,
  clean: handleClean,
  cleanModules: handleCleanModules,
  vcsUpdate: handleVcsUpdate,
  vcsLog: handleVcsLog,
  vcsCommit: handleVcsCommit,
  vcsRepoBrowser: handleVcsRepoBrowser,
  vcsCheck: handleVcsCheck,
  rename: handleRename,
  remove: handleRemove,
  delete: handleDelete,
  migrate: handleMigrate,
  proxy: handleProxy,
  proxyPort: handleProxyPort,
  java: handleSetJava,
  maven: handleSetMaven,
  tomcat: handleSetTomcat,
  warName: handleSetWarName,
}

/**
 * 统一分发表格行动作
 * @param action 动作名
 * @param idx 项目序号
 */
function handleRowAction(action: string, idx: number) {
  const handler = rowActionHandlers[action]
  if (handler) handler(idx)
}
// #endregion

// #region Dialog Helpers
function openVcsRange(mode: 'update' | 'check' = 'update') {
  vcsRangeModal.open({ mode })
}
function openSettings() {
  settingsModal.open()
}
function openDataDir() {
  dataDirModal.open()
}
function openSourceManage() {
  sourceManageModal.open()
}

function onTaskDetail(taskId: string) {
  taskDetailModal.open({ taskId })
}
// #endregion

// #region Lifecycle
const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('focusSearch'))
  }
}

// 通知面板定位项目 — 在项目列表中查找并高亮
function onLocateProject(e: Event) {
  const name = (e as CustomEvent<string>).detail
  const project = filteredProjects.value.find((p: any) => p.name === name)
  if (project) {
    window.dispatchEvent(new CustomEvent('highlightProject', { detail: (project as any)._origIdx }))
  } else {
    useInfo(`项目 "${name}" 不在当前列表中，尝试搜索所有源...`)
  }
}

onMounted(async () => {
  await notifyStore.load()
  await store.refreshRunningScripts()

  // 周期刷新脚本运行状态，保证表格"脚本"列与后台进程一致（页面隐藏时暂停）
  const scriptTimer = window.setInterval(() => {
    if (!document.hidden) store.refreshRunningScripts()
  }, 10000)

  const c1 = window.electronAPI.on('event:notificationCreated', () => {
    notifyStore.reload()
  })

  const c2 = window.electronAPI.on('event:taskCompleted', ({ name }) => {
    if (name.startsWith('扫描项目源:') || name.startsWith('刷新项目源:')) {
      store.loadSources()
      store.loadProjects()
    }
  })

  document.addEventListener('keydown', onKeydown)
  window.addEventListener('locateProject', onLocateProject)

  const c4 = window.electronAPI.on('menu:event', ({ action }) => {
    switch (action) {
      case 'vcsRange':
        openVcsRange('update')
        break
      case 'vcsCheckRange':
        openVcsRange('check')
        break
      case 'manageSources':
        openSourceManage()
        break
      case 'addSource':
        handleAddSource()
        break
      case 'settings':
        openSettings()
        break
      case 'dataDir':
        openDataDir()
        break
    }
  })

  const c5 = (e: Event) => {
    const taskId = (e as CustomEvent).detail
    onTaskDetail(taskId)
  }
  window.addEventListener('viewTaskDetail', c5)

  // 存入清理函数，防止 HMR/重挂时 listener 叠加
  window.__homeCleanups = window.__homeCleanups || []
  window.__homeCleanups.push(
    c1,
    c2,
    c4,
    () => window.removeEventListener('viewTaskDetail', c5),
    () => clearInterval(scriptTimer),
  )
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('locateProject', onLocateProject)
  // 清理 IPC listener，防止重挂叠加
  const cleanups = window.__homeCleanups
  if (cleanups) cleanups.forEach((fn) => fn())
})
// #endregion
</script>

<style scoped>
.project-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  align-items: center;
  padding: 4px 0;
  gap: 8px;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color);
}
.main-content {
  flex: 1;
  overflow: auto;
}
</style>
