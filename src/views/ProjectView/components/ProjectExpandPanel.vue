<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\views\ProjectView\components\ProjectExpandPanel.vue
 * @Description:
-->
<template>
  <div class="expand-container">
    <!-- 项目信息头 -->
    <div class="project-header">
      <div class="header-row">
        <span class="header-label">名称</span>
        <span class="header-value" :title="project.name">{{ project.name }}</span>
      </div>
      <div class="header-row">
        <span class="header-label">路径</span>
        <span class="header-value header-path" :title="project.path">{{ project.path }}</span>
      </div>
      <div v-if="vcsInfo" class="header-row">
        <span class="header-label">SVN 版本</span>
        <span class="header-value">
          本地 <strong>{{ vcsInfo.revision }}</strong>
          <span class="sep">·</span>
          远程 <strong>{{ vcsInfo.revisionRemote }}</strong>
          <el-tag
            v-if="vcsInfo.revision !== vcsInfo.revisionRemote"
            size="small"
            type="warning"
            effect="plain"
            class="version-tag"
            >可更新</el-tag
          >
        </span>
      </div>
    </div>

    <!-- 任务区域 -->
    <template v-if="loading">
      <div class="loading-tasks">
        <el-icon class="is-loading"><Loading /></el-icon>
        加载中...
      </div>
    </template>

    <template v-else>
      <div v-if="taskType" class="task-section">
        <div class="section-title">{{ getTypeLabel(taskType) }} 任务</div>
        <el-table :data="taskRows" size="small" stripe style="width: 100%" max-height="240">
          <el-table-column prop="name" label="任务" width="110" />
          <el-table-column prop="description" label="描述" min-width="130" show-overflow-tooltip />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <span :class="row.isRunning ? 'status-running' : 'status-stopped'">
                {{ row.isRunning ? '● 运行中' : '○ 未启动' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" type="primary" link :disabled="row.isRunning" @click="executeTask(row.name)">
                执行
              </el-button>
              <el-button size="small" type="danger" link :disabled="!row.isRunning" @click="stopTask(row.name)">
                停止
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="!taskType" class="no-tasks">
        <el-icon><InfoFilled /></el-icon>
        该项目没有可用的任务
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Loading, InfoFilled } from '@element-plus/icons-vue'
import { getTypeLabel } from '../../../utils/mockTypeLabel'
import { useProjectStore } from '../../../stores/project.store'

const props = defineProps<{
  project: any
  origIdx: number
}>()

const emit = defineEmits<{
  (e: 'runScript', idx: number, command: string): void
}>()

const store = useProjectStore()

// 项目信息
const vcsInfo = ref<{ revision: string; revisionRemote: string } | null>(null)

// 任务列表
const taskScripts = ref<Record<string, string>>({})
const taskType = ref('')
const loading = ref(true)
let taskTimer: number | undefined
let vcsTimer: number | undefined

// 运行中脚本直接取自 store，由项目视图的全局轮询统一维护
const runningCommands = computed(() => store.runningScripts[props.project.path] || [])

const taskRows = computed(() => {
  const template = taskType.value === 'maven' ? 'mvn {script}' : 'npm run {script}'
  return Object.entries(taskScripts.value).map(([name, desc]) => {
    const cmd = template.replace('{script}', name)
    return { name, description: desc || '-', command: cmd, isRunning: runningCommands.value.includes(cmd) }
  })
})

function isPageVisible(): boolean {
  return !document.hidden
}

async function fetchTasks() {
  if (!isPageVisible()) return
  try {
    const taskInfo = await window.electronAPI.invoke('projectMgr:getTaskList', props.origIdx)
    if (taskInfo && taskInfo.tasks) {
      taskScripts.value = taskInfo.tasks
      taskType.value = taskInfo.type
    } else {
      taskType.value = ''
      taskScripts.value = {}
    }
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function fetchVcsInfo() {
  if (!isPageVisible()) return
  try {
    const revInfo = await window.electronAPI.invoke('vcs:revisionInfo', props.origIdx)
    if (revInfo) vcsInfo.value = revInfo
  } catch {
    // ignore
  }
}

async function executeTask(name: string) {
  const template = taskType.value === 'maven' ? 'mvn {script}' : 'npm run {script}'
  const command = template.replace('{script}', name)
  emit('runScript', props.origIdx, command)
  await store.refreshRunningScripts()
  await fetchTasks()
}

async function stopTask(name: string) {
  const template = taskType.value === 'maven' ? 'mvn {script}' : 'npm run {script}'
  const command = template.replace('{script}', name)
  await window.electronAPI.invoke('process:stopScript', props.origIdx, command)
  await store.refreshRunningScripts()
  await fetchTasks()
}

function handleVisibilityChange() {
  if (document.hidden) {
    if (taskTimer) {
      clearInterval(taskTimer)
      taskTimer = undefined
    }
    if (vcsTimer) {
      clearInterval(vcsTimer)
      vcsTimer = undefined
    }
  } else {
    if (!taskTimer) {
      fetchTasks()
      taskTimer = window.setInterval(fetchTasks, 10000)
    }
    if (!vcsTimer) {
      fetchVcsInfo()
      vcsTimer = window.setInterval(fetchVcsInfo, 60000)
    }
  }
}

onMounted(() => {
  fetchTasks()
  fetchVcsInfo()
  taskTimer = window.setInterval(fetchTasks, 10000)
  vcsTimer = window.setInterval(fetchVcsInfo, 60000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  if (taskTimer) clearInterval(taskTimer)
  if (vcsTimer) clearInterval(vcsTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.expand-container {
  padding: 6px 0;
}

/* 项目信息头 — Element Plus 设计令牌 */
.project-header {
  padding: 8px 12px 10px;
  margin: 0 4px 10px;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-lighter);
}
.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  font-size: var(--el-font-size-base);
}
.header-row + .header-row {
  margin-top: 4px;
}
.header-label {
  flex-shrink: 0;
  width: 64px;
  text-align: right;
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
}
.header-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
}
.header-path {
  font-family: 'Cascadia Code', 'Consolas', 'Menlo', monospace;
  font-size: var(--el-font-size-small);
  color: var(--el-text-color-regular);
}
.header-value strong {
  font-weight: 600;
  color: var(--el-color-primary);
}
.sep {
  color: var(--el-text-color-placeholder);
  margin: 0 4px;
}
.version-tag {
  margin-left: 6px;
  flex-shrink: 0;
}

/* 任务区域 */
.section-title {
  font-size: var(--el-font-size-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
  padding-left: 12px;
}
.task-section {
  padding: 0 4px;
}
.loading-tasks,
.no-tasks {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px;
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-base);
}
.status-running {
  color: var(--el-color-success);
}
.status-stopped {
  color: var(--el-text-color-secondary);
}
</style>
