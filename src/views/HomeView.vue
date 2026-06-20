<template>
  <div class="home">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input v-model="portText" placeholder="端口号" style="width: 100px" size="small" @keyup.enter="killPort" />
      <el-button plain size="small" @click="killPort">杀端口</el-button>
    </div>

    <!-- 搜索栏 -->
    <SearchBar @search="onSearch" @toggle-filter="showFilter = !showFilter" />

    <!-- 筛选栏 -->
    <FilterBar v-if="showFilter" v-model:showRunning="showRunning" v-model:showStopped="showStopped" />

    <!-- 主内容：表格 -->
    <div class="main-content">
      <ProjectTable
        :projects="filteredProjects"
        :runningInfo="store.runningInfo"
        :runningPaths="store.runningPaths"
        :allSourcesMode="allSourcesMode"
        @start="handleStart"
        @stop="handleStop"
        @open-folder="handleOpenFolder"
        @build="handleBuild"
        @install="handleInstall"
        @clean="handleClean"
        @clean-modules="handleCleanModules"
        @vcs-update="handleVcsUpdate"
        @vcs-log="handleVcsLog"
        @vcs-commit="handleVcsCommit"
        @vcs-check="handleVcsCheck"
        @rename="handleRename"
        @remove="handleRemove"
        @delete="handleDelete"
        @migrate="handleMigrate"
        @proxy="handleProxy"
        @run-script="handleRunScript"
        @set-java="handleSetJava"
        @set-maven="handleSetMaven"
        @set-tomcat="handleSetTomcat"
        @set-war-name="handleSetWarName"
      />
    </div>

    <!-- 底部面板 -->
    <div class="bottom-panels" v-show="showOutput || showNotification || showTask">
      <LogViewer v-show="showOutput" />
      <NotificationList v-show="showNotification" @locateProject="locateProject" />
      <TaskPanel v-show="showTask" @viewDetail="onTaskDetail" />
    </div>

    <!-- 状态栏 -->
    <StatusBar
      :showOutput="showOutput"
      :showNotification="showNotification"
      :showTask="showTask"
      @toggleOutput="toggleOutput"
      @toggleNotification="toggleNotification"
      @toggleTask="toggleTask"
    />

    <!-- 对话框 -->
    <VcsRangeDialog v-model:visible="vcsRangeVisible" :mode="vcsRangeMode" />
    <SettingsDialog v-model:visible="settingsVisible" />
    <DataDirDialog v-model:visible="dataDirVisible" />
    <AboutDialog v-model:visible="aboutVisible" />
    <SourceManageDialog v-model:visible="sourceManageVisible" />
    <BuildDialog
      v-model:visible="buildVisible"
      :projectName="buildTarget.name"
      :projectPath="buildTarget.path"
      :projectType="buildTarget.type"
      @confirm="onBuildConfirm"
    />
    <InstallDialog
      v-model:visible="installVisible"
      :projectName="installTarget.name"
      :projectType="installTarget.type"
      @confirm="onInstallConfirm"
    />
    <CleanDialog
      v-model:visible="cleanVisible"
      :projectName="cleanTarget.name"
      :items="cleanItems"
      @confirm="onCleanConfirm"
    />
    <MigrateDialog
      v-model:visible="migrateVisible"
      :projectName="migrateTarget.name"
      :projectPath="migrateTarget.path"
      :svnInfo="migrateVcsInfo"
      :sources="store.sources"
      @confirm="onMigrateConfirm"
    />
    <TaskDetailDialog v-model:visible="taskDetailVisible" :taskId="taskDetailId" />
    <ProxyDialog v-model:visible="proxyVisible" :projectName="proxyTarget.name" :projectPath="proxyTarget.path" />
    <AddSourceDialog v-model:visible="addSourceVisible" @done="onAddSourceDone" />
    <HomeSelectorDialog
      v-model:visible="selectorVisible"
      :dialogTitle="selectorConfig.title"
      :currentValue="selectorCurrent"
      :homes="selectorHomes"
      @confirm="onSelectorConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import { useProjectStore } from '../stores/project.store'
import { useNotificationStore } from '../stores/notification.store'
import { useInfo, useError, useSuccess, useWarning, useConfirm } from '../composables/useMessage'

import SearchBar from '../components/SearchBar.vue'
import FilterBar from '../components/FilterBar.vue'
import ProjectTable from '../components/ProjectTable.vue'
import LogViewer from '../components/LogViewer.vue'
import NotificationList from '../components/NotificationList.vue'
import TaskPanel from '../components/TaskPanel.vue'
import StatusBar from '../components/StatusBar.vue'
import VcsRangeDialog from '../dialogs/VcsRangeDialog.vue'
import SettingsDialog from '../dialogs/SettingsDialog.vue'
import DataDirDialog from '../dialogs/DataDirDialog.vue'
import AboutDialog from '../dialogs/AboutDialog.vue'
import SourceManageDialog from '../dialogs/SourceManageDialog.vue'
import BuildDialog from '../dialogs/BuildDialog.vue'
import InstallDialog from '../dialogs/InstallDialog.vue'
import CleanDialog from '../dialogs/CleanDialog.vue'
import MigrateDialog from '../dialogs/MigrateDialog.vue'
import TaskDetailDialog from '../dialogs/TaskDetailDialog.vue'
import ProxyDialog from '../dialogs/ProxyDialog.vue'
import HomeSelectorDialog from '../dialogs/HomeSelectorDialog.vue'
import AddSourceDialog from '../dialogs/AddSourceDialog.vue'

const store = useProjectStore()
const notifyStore = useNotificationStore()

const portText = ref('')
const showOutput = ref(false)
const showNotification = ref(false)
const showTask = ref(false)
const showRunning = ref(true)
const showStopped = ref(true)
const showFilter = ref(false)
const allSourcesMode = ref(false)

const vcsRangeVisible = ref(false)
const vcsRangeMode = ref<'update' | 'check'>('update')
const settingsVisible = ref(false)
const dataDirVisible = ref(false)
const aboutVisible = ref(false)
const sourceManageVisible = ref(false)
const buildVisible = ref(false)
const buildTarget = ref({ idx: 0, name: '', path: '', type: 'npm' })
const installVisible = ref(false)
const installTarget = ref({ idx: 0, name: '', type: 'npm' })
const cleanVisible = ref(false)
const cleanTarget = ref({ idx: 0, name: '' })
const cleanItems = ref<import('../types/project').BuildArtifact[]>([])
const migrateVisible = ref(false)
const migrateTarget = ref({ idx: 0, name: '', path: '' })
const migrateVcsInfo = ref<{ url?: string; root?: string } | null>(null)
const taskDetailVisible = ref(false)
const taskDetailId = ref<string | null>(null)
const proxyVisible = ref(false)
const proxyTarget = ref({ name: '', path: '' })
const selectorVisible = ref(false)
const selectorConfig = ref({ title: '', idx: 0, key: '' as 'javaHome' | 'mavenHome' | 'tomcatHome' })
const selectorHomes = ref<{ label: string; path: string }[]>([])
const selectorCurrent = ref('')
const addSourceVisible = ref(false)

const getSelectedIndex = (): number | null => {
  return null // Will be handled by ProjectTable
}

const filteredProjects = computed(() => {
  const keyword = store.searchText
  const caseSensitive = store.searchCaseSensitive
  const wholeWord = store.searchWholeWord
  const useRegex = store.searchRegex

  // 构建匹配模式
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

  return store.projects.filter((p, i) => {
    const idx = i + 1
    const isRunning = store.runningIndices.has(idx)

    // 状态筛选
    if (isRunning && !showRunning.value) return false
    if (!isRunning && !showStopped.value) return false

    // 文本匹配：名称和路径模糊搜索
    if (pattern) {
      const match = pattern.test(p.name) || pattern.test(p.path)
      if (!match) return false
    }

    return true
  })
})

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 三个底部面板互斥切换，最多显示一个
function toggleOutput() {
  showOutput.value = !showOutput.value
  if (showOutput.value) {
    showNotification.value = false
    showTask.value = false
  }
}
function toggleNotification() {
  showNotification.value = !showNotification.value
  if (showNotification.value) {
    showOutput.value = false
    showTask.value = false
  }
}
function toggleTask() {
  showTask.value = !showTask.value
  if (showTask.value) {
    showOutput.value = false
    showNotification.value = false
  }
}

async function killPort() {
  if (!portText.value || !/^\d+$/.test(portText.value)) {
    useError('请输入有效的端口号')
    return
  }
  const port = parseInt(portText.value)
  if (port < 1 || port > 65535) {
    useError('端口号范围: 1-65535')
    return
  }
  const ok = await useConfirm('确认终止进程', `确认终止占用端口 ${port} 的进程？`)
  if (!ok) return
  await window.electronAPI.killPort(port)
  portText.value = ''
}

function quitApp() {
  window.electronAPI.stopAll()
  window.close()
}

function openVcsRange() {
  vcsRangeMode.value = 'update'
  vcsRangeVisible.value = true
}
function openSettings() {
  settingsVisible.value = true
}
function openDataDir() {
  dataDirVisible.value = true
}
function openAbout() {
  aboutVisible.value = true
}
function openSourceManage() {
  sourceManageVisible.value = true
}

async function openAddSource() {
  addSourceVisible.value = true
}

async function onAddSourceDone() {
  await store.loadSources()
  const configPath = await window.electronAPI.getDefaultConfigPath()
  await store.refreshRunningInfo()
}

async function checkUpdate() {
  useInfo('正在检查更新...')
  const result = await window.electronAPI.checkUpdate()
  if (result) {
    useSuccess('发现新版本，开始下载...')
    window.electronAPI.downloadUpdate(result.url, result.filename)
  } else {
    useInfo('未发现新版本')
  }
}

async function handleVcsUpdate(idx: number) {
  await window.electronAPI.vcsUpdate(idx)
}

async function handleVcsLog(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  const opened = await window.electronAPI.vcsOpenLogGui(idx)
  if (!opened) {
    showOutput.value = true
    useInfo(`[${proj.name}] 未发现 GUI 客户端，使用命令行输出`)
  }
}

async function handleVcsCommit(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  const opened = await window.electronAPI.vcsOpenCommitGui(idx)
  if (!opened) {
    useError(`[${proj.name}] 未发现 GUI 客户端`)
  }
}

async function handleVcsCheck(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  const vcs = await window.electronAPI.detectVcs(proj.path)
  if (!vcs) {
    useInfo(`[${proj.name}] 不是版本控制项目`)
    return
  }
  const [remote, local] = await Promise.all([
    window.electronAPI.vcsCheckRemote([{ name: proj.name, path: proj.path }]),
    window.electronAPI.vcsCheckLocal([{ name: proj.name, path: proj.path }]),
  ])
  const total = remote.length + local.length
  if (total > 0) useWarning(`[${proj.name}] ${total} 项变更`)
  else useInfo(`[${proj.name}] 没有发现变更`)
  notifyStore.load()
}

async function handleStart(idx: number) {
  const proj = store.projects[idx - 1]
  if (proj) window.electronAPI.logOutput('info', `启动 [${proj.name}] ...`)
  await window.electronAPI.startProject(idx)
  await store.refreshRunningInfo()
}

async function handleStop(idx: number) {
  const proj = store.projects[idx - 1]
  if (proj) window.electronAPI.logOutput('warning', `停止 [${proj.name}] ...`)
  await window.electronAPI.stopProject(idx)
  await store.refreshRunningInfo()
}

function handleOpenFolder(path: string) {
  window.electronAPI.openFolder(path)
}

async function handleBuild(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  buildTarget.value = { idx, name: proj.name, path: proj.path, type: proj.projectType }
  buildVisible.value = true
}

async function onBuildConfirm(command: string, zipName: string) {
  const t = buildTarget.value
  const idx = t.idx
  window.electronAPI.logOutput('info', `[${t.name}] 构建命令: ${command}`)
  await window.electronAPI.buildProject(idx, command, zipName || undefined)
  useSuccess(`[${t.name}] 构建任务已启动`)
  window.electronAPI.logOutput('success', `[${t.name}] 构建任务已启动`)
}

async function handleInstall(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  installTarget.value = { idx, name: proj.name, type: proj.projectType }
  installVisible.value = true
}

async function onInstallConfirm(command: string) {
  const t = installTarget.value
  window.electronAPI.logOutput('info', `[${t.name}] 安装命令: ${command}`)
  await window.electronAPI.runTask(t.idx, command)
  useSuccess(`[${t.name}] 安装依赖已启动`)
  window.electronAPI.logOutput('success', `[${t.name}] 安装依赖已启动`)
}

async function handleClean(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  const artifacts = await window.electronAPI.scanBuildArtifacts(idx)
  if (artifacts.length === 0) {
    useInfo('没有可清理的构建产物')
    return
  }
  cleanTarget.value = { idx, name: proj.name }
  cleanItems.value = artifacts
  cleanVisible.value = true
}

async function onCleanConfirm(paths: string[]) {
  await window.electronAPI.cleanArtifacts(cleanTarget.value.idx, paths)
  window.electronAPI.logOutput('success', `已清理 ${paths.length} 项`)
  useSuccess(`已清理 ${paths.length} 项`)
}

async function handleCleanModules(idx: number) {
  const dirs = await window.electronAPI.getDependencyDirs(idx)
  if (dirs.length === 0) {
    useInfo('没有可清理的依赖目录')
    return
  }
  const dirList = dirs.map((d) => `${d.name}: ${d.path}`).join('\n')
  const ok = await useConfirm('确认清理', `确认删除以下依赖目录？\n\n${dirList}`)
  if (!ok) return
  await window.electronAPI.cleanDependencies(idx)
  window.electronAPI.logOutput('success', '依赖目录清理完成')
  useSuccess('依赖目录清理完成')
}

async function handleRename(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  const { usePrompt } = await import('../composables/useMessage')
  const newName = await usePrompt('重命名项目', `修改 [${proj.name}] 的显示名称:`, proj.name)
  if (!newName || !newName.trim()) return
  const configPath = await window.electronAPI.getDefaultConfigPath()
  await window.electronAPI.renameProject(configPath, idx, newName.trim())
  await store.loadProjects()
  useSuccess(`项目已重命名`)
}

async function handleRemove(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  const ok = await useConfirm('确认移除', `确认将 [${proj.name}] 从项目列表中移除？\n此操作不会删除项目文件。`)
  if (!ok) return
  const configPath = await window.electronAPI.getDefaultConfigPath()
  await window.electronAPI.removeProject(configPath, idx)
  await store.loadProjects()
  useSuccess(`项目 [${proj.name}] 已从列表中移除`)
}

async function handleDelete(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  const ok = await useConfirm(
    '确认物理删除',
    `确认物理删除项目 [${proj.name}]？\n此操作将永久删除整个项目目录，不可恢复！`,
    true,
  )
  if (!ok) return
  const configPath = await window.electronAPI.getDefaultConfigPath()
  await window.electronAPI.deleteProject(configPath, idx)
  await store.loadProjects()
  useSuccess(`项目 [${proj.name}] 已物理删除`)
}

async function handleMigrate(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  migrateTarget.value = { idx, name: proj.name, path: proj.path }
  migrateVcsInfo.value = await window.electronAPI.vcsGetInfo(idx)
  migrateVisible.value = true
}

async function onMigrateConfirm(mode: 'svn' | 'copy', targetDir: string, svnUrl: string) {
  await window.electronAPI.vcsMigrate(migrateTarget.value.idx, { mode, targetDir, svnUrl })
  useSuccess(`[${migrateTarget.value.name}] 迁移完成`)
}

async function handleProxy(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  proxyTarget.value = { name: proj.name, path: proj.path }
  proxyVisible.value = true
}

async function handleRunScript(idx: number, command: string) {
  await window.electronAPI.runScript(idx, command)
  useInfo(`脚本已启动: ${command}`)
}

async function handleSetJava(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj) return
  const homes = await window.electronAPI.getJavaHomes()
  if (homes.length === 0) {
    useWarning('未发现已安装的 JDK')
    return
  }
  selectorHomes.value = homes
  selectorCurrent.value = proj.javaHome || ''
  selectorConfig.value = { title: 'Java 版本', idx, key: 'javaHome' }
  selectorVisible.value = true
}

async function handleSetMaven(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj || proj.projectType !== 'maven') return
  const homes = await window.electronAPI.getMavenHomes()
  selectorHomes.value = homes
  selectorCurrent.value = proj.mavenHome || ''
  selectorConfig.value = { title: 'Maven 版本', idx, key: 'mavenHome' }
  selectorVisible.value = true
}

async function handleSetTomcat(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj || proj.projectType !== 'maven') return
  const homes = await window.electronAPI.getTomcatHomes()
  selectorHomes.value = homes
  selectorCurrent.value = proj.tomcatHome || ''
  selectorConfig.value = { title: 'Tomcat 版本', idx, key: 'tomcatHome' }
  selectorVisible.value = true
}

async function onSelectorConfirm(path: string) {
  const { idx, key } = selectorConfig.value
  const configPath = await window.electronAPI.getDefaultConfigPath()
  const existing = await window.electronAPI.loadProjects(configPath)
  const proj = existing[idx - 1]
  if (!proj) return
  ;(proj as any)[key] = path
  await window.electronAPI.saveProjects(configPath, existing)
  await store.loadProjects()
  useSuccess('已保存')
}

async function handleSetWarName(idx: number) {
  const proj = store.projects[idx - 1]
  if (!proj || proj.projectType !== 'maven') return
  const { usePrompt } = await import('../composables/useMessage')
  const name = await usePrompt('WAR 名称', `WAR 名称（不含 .war 后缀）:`, proj.tomcatWarName)
  if (name === null) return
  const configPath = await window.electronAPI.getDefaultConfigPath()
  const existing = await window.electronAPI.loadProjects(configPath)
  const p = existing[idx - 1]
  if (!p) return
  p.tomcatWarName = name
  await window.electronAPI.saveProjects(configPath, existing)
  await store.loadProjects()
  useSuccess('WAR 名称已修改')
}

function onTaskDetail(taskId: string) {
  taskDetailId.value = taskId
  taskDetailVisible.value = true
}

// 通知点击后定位到项目行，用 filteredProjects 索引（不是 store.projects），因为搜索筛选后下标不对应
function locateProject(projectName: string) {
  const idx = filteredProjects.value.findIndex((p) => p.name === projectName)
  if (idx >= 0) {
    const index = idx + 1
    showNotification.value = false
    window.dispatchEvent(new CustomEvent('highlightProject', { detail: index }))
  } else {
    useInfo(`项目 "${projectName}" 不在当前列表中，尝试搜索所有源...`)
  }
}

function onSearch(text: string, caseSensitive?: boolean, wholeWord?: boolean, useRegex?: boolean) {
  store.searchText = text
  if (caseSensitive !== undefined) store.searchCaseSensitive = caseSensitive
  if (wholeWord !== undefined) store.searchWholeWord = wholeWord
  if (useRegex !== undefined) store.searchRegex = useRegex
}

onMounted(async () => {
  await notifyStore.load()

  window.electronAPI.onNotificationCreated(() => {
    notifyStore.load()
  })

  // 监听原生菜单点击
  // 任务完成/失败时显示 toast（SVN 更新等通过 TaskManager 运行的任务）
  window.electronAPI.onTaskCompleted(({ name }) => {
    useSuccess(`${name} 完成`)
  })
  window.electronAPI.onTaskFailed(({ name, error }) => {
    useError(`${name} 失败: ${error}`)
  })

  // Ctrl+F 聚焦搜索框
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('focusSearch'))
    }
  })

  // 菜单栏原生事件映射到对话框打开
  window.electronAPI.onMenuEvent(({ action }) => {
    switch (action) {
      case 'vcsRange':
        vcsRangeMode.value = 'update'
        vcsRangeVisible.value = true
        break
      case 'vcsCheckRange':
        vcsRangeMode.value = 'check'
        vcsRangeVisible.value = true
        break
      case 'manageSources':
        sourceManageVisible.value = true
        break
      case 'addSource':
        openAddSource()
        break
      case 'settings':
        settingsVisible.value = true
        break
      case 'dataDir':
        dataDirVisible.value = true
        break
      case 'checkUpdate':
        checkUpdate()
        break
      case 'about':
        aboutVisible.value = true
        break
    }
  })
})
</script>

<style scoped>
.home {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--el-bg-color-overlay);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}
.main-content {
  flex: 1;
  overflow: auto;
}
.bottom-panels {
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color);
}
</style>
