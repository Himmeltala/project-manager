<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14 09:30:49
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-04 09:30:49
 * @FilePath: \src\views\ProjectView\components\StatusBar.vue
 * @Description: 状态栏组件，徽标全部消费各面板 store，不含 IPC 直连
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
import { computed, watch } from 'vue'

import { useProjectStore } from '@/stores/project.store'
import { useNotificationStore } from '@/stores/notification.store'
import { useTaskStore } from '@/stores/task.store'

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
const taskStore = useTaskStore()
const unreadCount = computed(() => notifyStore.unreadCount)
const activeTaskCount = computed(() => taskStore.activeCount)

// 任务起止即刷新脚本状态，覆盖脚本静默退出时无输出事件的长尾
watch(
  () => taskStore.activeCount,
  () => {
    store.refreshRunningScripts()
  },
)

// 脚本任务数：各项目路径下运行中脚本数量之和
const scriptCount = computed(() => Object.values(store.runningScripts).reduce((sum, list) => sum + list.length, 0))

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
  font-size: var(--el-font-size-extra-small);
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
  font-size: var(--app-font-size-mini);
  min-height: 22px;
}
.status-actions .el-button:hover {
  background: var(--status-bar-bg-hover);
}
</style>
