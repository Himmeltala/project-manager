<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-21
 * @FilePath: \src\views\ProjectView\components\TaskPanel.vue
 * @Description: 后台任务面板组件，卡片布局
-->

<template>
  <div class="task-panel">
    <div class="task-header">
      <span class="task-title">任务</span>
      <div style="display: flex; gap: 6px">
        <el-button plain size="small" @click="viewDetail" :disabled="!selectedTaskId">查看详情</el-button>
        <el-button plain size="small" @click="handleClear">清空</el-button>
      </div>
    </div>
    <el-scrollbar class="task-scroll">
      <div v-if="store.tasks.length === 0" class="empty-hint">
        <el-empty :image-size="80" description="暂无任务" />
      </div>
      <div
        v-for="t in store.tasks"
        :key="t.taskId"
        class="task-item"
        :class="{ selected: selectedTaskId === t.taskId, [t.status]: true }"
        @click="onSelect(t)"
      >
        <div class="task-item-row">
          <span class="task-name">{{ t.name }}</span>
          <span class="task-status-badge" :style="{ color: statusColor(t.status), borderColor: statusColor(t.status) }">
            {{ statusText(t.status) }}
          </span>
        </div>
        <div class="task-item-row">
          <el-progress
            :percentage="t.progress"
            type="line"
            :stroke-width="18"
            :text-inside="true"
            :status="progressStatus(t.status)"
            style="flex: 1"
          />
        </div>
        <div v-if="t.message" class="task-message">{{ t.message }}</div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { BackgroundTask } from '@/types/task'
import { getTaskStatusMeta } from '@/types/task'
import { useTaskStore } from '@/stores/task.store'

const store = useTaskStore()
const selectedTaskId = ref<string | null>(null)

// 状态显示统一取自共享的任务状态元数据注册表
function statusColor(status: string): string {
  return getTaskStatusMeta(status).color
}

function statusText(status: string): string {
  return getTaskStatusMeta(status).text
}

function progressStatus(status: string): 'success' | 'exception' | 'warning' | '' {
  return getTaskStatusMeta(status).progress
}

function onSelect(t: BackgroundTask) {
  selectedTaskId.value = selectedTaskId.value === t.taskId ? null : t.taskId
}

const emit = defineEmits<{ (e: 'viewDetail', taskId: string): void }>()

function viewDetail() {
  if (selectedTaskId.value) emit('viewDetail', selectedTaskId.value)
}

async function handleClear() {
  await store.clearFinished()
}

onMounted(() => {
  store.init()
})

onUnmounted(() => {
  store.destroy()
})
</script>

<style scoped>
.task-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--el-bg-color);
  font-family: var(--el-font-family);
}
.task-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}
.task-title {
  flex: 1;
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}
.task-scroll {
  flex: 1;
}
.task-scroll :deep(.el-scrollbar__view) {
  padding: 8px;
}
.empty-hint {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
.task-item {
  padding: 10px;
  margin-bottom: 4px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
}
.task-item:hover {
  background: var(--el-fill-color-light);
}
.task-item.selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.task-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.task-item-row:last-child {
  margin-bottom: 0;
}
.task-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-status-badge {
  font-size: 11px;
  border: 1px solid;
  border-radius: 2px;
  padding: 0 4px;
  flex-shrink: 0;
}
.task-message {
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}
</style>
