<template>
  <div class="status-bar">
    <span class="status-info">{{ statusText }}</span>
    <div class="status-actions">
      <el-button plain :type="showOutput ? 'primary' : 'default'" size="small" @click="toggleOutput">输出</el-button>
      <el-button plain :type="showNotification ? 'primary' : 'default'" size="small" @click="toggleNotification">
        通知{{ unreadCount > 0 ? ` (${unreadCount})` : '' }}
      </el-button>
      <el-button plain :type="showTask ? 'primary' : 'default'" size="small" @click="toggleTask">
        任务{{ activeTaskCount > 0 ? ` (${activeTaskCount})` : '' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../stores/project.store'
import { useNotificationStore } from '../stores/notification.store'

const props = defineProps<{
  showOutput?: boolean
  showNotification?: boolean
  showTask?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggleOutput'): void
  (e: 'toggleNotification'): void
  (e: 'toggleTask'): void
}>()

const store = useProjectStore()
const notifyStore = useNotificationStore()
const activeTaskCount = ref(0)
const scriptCount = ref(0)
const unreadCount = computed(() => notifyStore.unreadCount)

const statusText = computed(() => {
  const total = store.projects.length
  const running = store.runningInfo.length
  const parts: string[] = []
  parts.push(`共 ${total} 个项目`)
  parts.push(`${running} 个运行中`)
  if (scriptCount.value > 0) parts.push(`${scriptCount.value} 个脚本任务`)
  return parts.join('，')
})

function toggleOutput() {
  emit('toggleOutput')
}
function toggleNotification() {
  emit('toggleNotification')
}
function toggleTask() {
  emit('toggleTask')
}

async function refreshTaskCount() {
  const tasks = await window.electronAPI.getActiveTasks()
  activeTaskCount.value = tasks.length
  scriptCount.value = await window.electronAPI.getTotalScriptsCount()
}

onMounted(async () => {
  await notifyStore.load()
  await refreshTaskCount()

  window.electronAPI.onNotificationCreated(() => notifyStore.load())
  window.electronAPI.onNotificationsCleared(() => notifyStore.load())
  window.electronAPI.onTaskStarted(() => refreshTaskCount())
  window.electronAPI.onTaskCompleted(() => refreshTaskCount())
  window.electronAPI.onTaskFailed(() => refreshTaskCount())
})
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  background: var(--el-color-primary);
  color: white;
  flex-shrink: 0;
  font-size: 12px;
}
.status-info {
  flex: 1;
  font-weight: bold;
  padding-left: 4px;
}
.status-actions {
  display: flex;
  gap: 4px;
}
.status-actions .el-button {
  color: white;
  background: transparent;
  border: none;
  font-size: 11px;
  min-height: 22px;
}
.status-actions .el-button:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
