<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\views\ProjectView\components\StatusBar.vue
 * @Description: 状态栏组件，显示项目计数和面板切换按钮
-->

<template>
  <div class="status-bar">
    <span class="status-info">{{ statusText }}</span>
    <div class="status-actions">
      <el-button plain :type="showTerminal ? 'primary' : 'default'" size="small" @click="toggleTerminal"
        >输出</el-button
      >
      <el-button plain :type="showSystemLog ? 'primary' : 'default'" size="small" @click="toggleSystemLog"
        >日志</el-button
      >
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
import { IPC } from '@/ipc/channels'

import { useProjectStore } from '@/stores/project.store'
import { useNotificationStore } from '@/stores/notification.store'

defineProps<{
  showTerminal?: boolean
  showSystemLog?: boolean
  showNotification?: boolean
  showTask?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggleTerminal'): void
  (e: 'toggleSystemLog'): void
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

function toggleTerminal() {
  emit('toggleTerminal')
}
function toggleSystemLog() {
  emit('toggleSystemLog')
}
function toggleNotification() {
  emit('toggleNotification')
}
function toggleTask() {
  emit('toggleTask')
}

async function refreshTaskCount() {
  const tasks = await window.electronAPI.invoke(IPC.task.getActive)
  activeTaskCount.value = tasks.length
  scriptCount.value = await window.electronAPI.invoke(IPC.process.getTotalScriptsCount)
}

const sbCleanups: (() => void)[] = []
// 统一存入 __homeCleanups 供全局清理
window.__homeCleanups = window.__homeCleanups || []
onMounted(async () => {
  await refreshTaskCount()

  sbCleanups.push(window.electronAPI.on('event:notificationCreated', () => notifyStore.reload()))
  sbCleanups.push(window.electronAPI.on('event:notificationsCleared', () => notifyStore.reload()))
  sbCleanups.push(window.electronAPI.on('event:taskStarted', () => refreshTaskCount()))
  sbCleanups.push(window.electronAPI.on('event:taskCompleted', () => refreshTaskCount()))
  sbCleanups.push(window.electronAPI.on('event:taskFailed', () => refreshTaskCount()))
  window.__homeCleanups!.push(...sbCleanups)
})

onUnmounted(() => {
  sbCleanups.forEach((fn) => fn())
})
</script>

<style scoped>
.status-bar {
  --status-bar-bg-hover: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  padding: 2px 8px;
  background: var(--el-color-primary);
  color: var(--el-color-white);
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
  color: var(--el-color-white);
  background: transparent;
  border: none;
  font-size: 11px;
  min-height: 22px;
}
.status-actions .el-button:hover {
  background: var(--status-bar-bg-hover);
}
</style>
