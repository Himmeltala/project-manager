<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
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
        <el-button :icon="Plus" plain :disabled="pullStore.pulling" @click="handleAddSource">添加项目源</el-button>
      </div>
      <div>
        <el-button :icon="Refresh" plain :loading="refreshing" :disabled="pullStore.pulling" @click="handleRefresh">
          刷新项目源
        </el-button>
      </div>
      <el-divider direction="vertical" />
      <div style="flex: 1" />
      <div>
        <el-button
          v-if="!pullStore.pulling"
          :icon="Download"
          plain
          title="拉取当前项目源下所有项目的远程更新"
          @click="handlePull"
        >
          拉取项目
        </el-button>
        <el-button
          v-else
          :icon="VideoPause"
          type="danger"
          plain
          :loading="pullStore.cancelling"
          :disabled="pullStore.cancelling"
          title="中断当前拉取任务"
          @click="handleCancel"
        >
          {{ pullStore.cancelling ? '正在中断' : '中断更新' }}
        </el-button>
      </div>
    </div>

    <!-- 搜索栏 -->
    <SearchBar @scope-change="onScopeChange" />

    <!-- 主内容：表格 -->
    <div class="main-content">
      <ProjectTable
        :projects="filteredProjects"
        :action-context="actionContext"
        @run-script="actionContext.runScript"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// #region Imports
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { IPC } from '@/ipc/channels'

import { Refresh, Management, Plus, Download, VideoPause } from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project.store'
import { useNotificationStore } from '@/stores/notification.store'
import { usePullStore } from '@/stores/pull.store'
import { useInfo, useWarning, useError, useConfirm } from '@/composables/useMessage'
import { useModal } from '@/composables/useModal'

import SearchBar from '@/views/ProjectView/components/SearchBar.vue'
import ProjectTable from '@/views/ProjectView/components/ProjectTable.vue'
import { createActionContext } from '@/actions/context'
import '@/actions/index'

import BuildDialog from '@/views/ProjectView/modals/project/BuildModal.vue'
import CleanModalComp from '@/views/ProjectView/modals/project/CleanModal.vue'
import InstallDialog from '@/views/ProjectView/modals/project/InstallModal.vue'
import MigrateDialog from '@/views/ProjectView/modals/project/MigrateModal.vue'
import AddSourceDialog from '@/views/ProjectView/modals/project/AddSourceModal.vue'
import SourceManageDialog from '@/views/ProjectView/modals/project/SourceManageModal.vue'
import VcsRangeDialog from '@/views/ProjectView/modals/version-control/VcsRangeModal.vue'
import SettingsModal from '@/views/ProjectView/modals/settings/SettingsModal.vue'
import StartModuleDialog from '@/views/ProjectView/modals/project-type/StartModuleModal.vue'
import SubmodulePortDialog from '@/views/ProjectView/modals/project-type/SubmodulePortModal.vue'
import DataDirDialog from '@/views/ProjectView/modals/system/DataDirModal.vue'
import TaskDetailDialog from '@/views/ProjectView/modals/task/TaskDetailModal.vue'
import ProxyModal from '@/views/ProjectView/modals/project-type/ProxyModal.vue'
import PortModal from '@/views/ProjectView/modals/project-type/PortModal.vue'
import HomeSelectorDialog from '@/views/ProjectView/modals/project/HomeSelectorModal.vue'
import { getCapabilities } from '@/composables/useProjectType'
// #endregion

// #region Store & State
const store = useProjectStore()
const notifyStore = useNotificationStore()
const pullStore = usePullStore()

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
const submodulePortModal = useModal({ component: SubmodulePortDialog })
const selectorModal = useModal({ component: HomeSelectorDialog })

// #endregion

// #endregion

// #region Source Switching
function onScopeChange(val: string) {
  if (val === '__all__') {
    allSourcesMode.value = true
    window.electronAPI.invoke(IPC.project.loadAll).then((projs) => {
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
    .filter((p: any) => getCapabilities(p.projectType).supportsBuildToolDetection)
    .map((p: any) => p.path)
    .filter(Boolean)
  if (npmPaths.length === 0) return
  try {
    const result = await window.electronAPI.invoke(IPC.buildTool.detectBatch, npmPaths)
    store.buildTools = { ...store.buildTools, ...result }
  } catch {
    // 静默失败
  }
}

// 刷新项目源
async function handleRefresh() {
  if (pullStore.pulling) {
    useWarning('正在拉取项目，请等待完成或先中断')
    return
  }
  if (refreshing.value) return
  refreshing.value = true
  try {
    await window.electronAPI.invoke(IPC.source.refreshCurrent)
  } catch {
    // ignore
  } finally {
    refreshing.value = false
  }
}
// #endregion

// #region 拉取项目
// 发起拉取任务：仅允许在具体项目源模式下执行，成功后自动打开任务面板
async function handlePull() {
  if (allSourcesMode.value) {
    useWarning('所有源模式下不可拉取项目，请先切换到具体项目源')
    return
  }
  if (pullStore.pulling) return
  try {
    const taskId = await window.electronAPI.invoke(IPC.vcs.pullProjects)
    if (!taskId) {
      useWarning('没有可拉取的项目或已有拉取任务在进行')
      return
    }
    pullStore.markStart(taskId)
    window.dispatchEvent(new CustomEvent('openTaskPanel'))
  } catch (e) {
    console.error('发起拉取任务失败:', e)
    useError(`发起拉取任务失败: ${(e as Error).message || e}`)
  }
}

// 中断拉取任务：经确认后请求主进程在下一个项目边界处停止
async function handleCancel() {
  if (pullStore.cancelling) return
  const ok = await useConfirm('中断拉取', '确认中断当前项目拉取？将在当前项目更新完成后停止', true)
  if (!ok) return
  const id = pullStore.taskId
  if (!id) {
    pullStore.markEnd()
    return
  }
  pullStore.markCancelling(true)
  try {
    await window.electronAPI.invoke(IPC.task.cancel, id)
  } catch (e) {
    console.error('请求中断拉取失败:', e)
    useError(`请求中断拉取失败: ${(e as Error).message || e}`)
    pullStore.markCancelling(false)
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

// #region Action Context
// 动作执行上下文，封装 IPC 通道、弹窗与消息提示，由策略经注册表消费
const actionContext = createActionContext({
  allSourcesMode,
  allProjects,
  modals: {
    build: buildModal,
    clean: cleanModal,
    install: installModal,
    migrate: migrateModal,
    proxy: proxyModal,
    port: portModal,
    startModule: startModuleModal,
    submodulePort: submodulePortModal,
    selector: selectorModal,
  },
})
// #endregion
async function handleAddSource() {
  if (pullStore.pulling) {
    useWarning('正在拉取项目，暂不能添加项目源，请等待完成或先中断')
    return
  }
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

  // 拉取任务正常结束：任务卡以"拉取项目:"开头时重置拉取状态
  const c6 = window.electronAPI.on('event:taskCompleted', ({ name }) => {
    if (name.startsWith('拉取项目:')) {
      pullStore.markEnd()
    }
  })

  // 拉取任务失败或被中断：同样重置拉取状态
  const c7 = window.electronAPI.on('event:taskFailed', ({ name }) => {
    if (name.startsWith('拉取项目:')) {
      pullStore.markEnd()
    }
  })

  document.addEventListener('keydown', onKeydown)
  window.addEventListener('locateProject', onLocateProject)

  // 主进程菜单事件分发表：动作名到处理函数的映射
  const menuEventHandlers: Record<string, () => void> = {
    vcsRange: () => openVcsRange('update'),
    vcsCheckRange: () => openVcsRange('check'),
    manageSources: openSourceManage,
    addSource: handleAddSource,
    settings: openSettings,
    dataDir: openDataDir,
  }
  const c4 = window.electronAPI.on('menu:event', ({ action }) => {
    menuEventHandlers[action]?.()
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
    c6,
    c7,
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
