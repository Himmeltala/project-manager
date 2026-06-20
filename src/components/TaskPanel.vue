<template>
  <div class="task-panel">
    <div class="task-header">
      <div>
        <el-button plain size="small" @click="viewDetail" :disabled="!selectedTaskId">查看详情</el-button>
      </div>
    </div>
    <el-table :data="rows" size="small" :stripe="true" height="160" style="width: 100%" @row-click="onRowClick">
      <el-table-column prop="name" label="任务名称" min-width="120" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <span :style="{ color: row.statusColor }">{{ row.statusText }}</span>
        </template>
      </el-table-column>
      <el-table-column label="进度" width="160">
        <template #default="{ row }">
          <el-progress :percentage="row.progress" type="line" :stroke-width="16" :text-inside="true" />
        </template>
      </el-table-column>
      <el-table-column prop="message" label="最新消息" min-width="150" show-overflow-tooltip />
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { BackgroundTask } from '../types/task'

interface TaskRow {
  taskId: string
  name: string
  status: string
  statusText: string
  statusColor: string
  progress: number
  message: string
}

const rows = ref<TaskRow[]>([])
const selectedTaskId = ref<string | null>(null)
let timer: number | undefined

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '等待中', color: 'var(--el-text-color-secondary)' },
  running: { text: '运行中', color: 'var(--el-color-primary)' },
  completed: { text: '已完成', color: 'var(--el-color-success)' },
  failed: { text: '失败', color: 'var(--el-color-danger)' },
}

function taskToRow(t: BackgroundTask): TaskRow {
  const s = STATUS_MAP[t.status] || { text: t.status, color: 'var(--el-text-color-secondary)' }
  return {
    taskId: t.taskId,
    name: t.name,
    status: t.status,
    statusText: s.text,
    statusColor: s.color,
    progress: t.progress,
    message: t.message,
  }
}

async function refresh() {
  const tasks: BackgroundTask[] = await window.electronAPI.getAllTasks()
  rows.value = tasks.map(taskToRow)
}

function onRowClick(row: TaskRow) {
  selectedTaskId.value = row.taskId
}

const emit = defineEmits<{ (e: 'viewDetail', taskId: string): void }>()

function viewDetail() {
  if (selectedTaskId.value) emit('viewDetail', selectedTaskId.value)
}

onMounted(() => {
  refresh()
  timer = window.setInterval(refresh, 2000)

  window.electronAPI.onTaskStarted(refresh)
  window.electronAPI.onTaskCompleted(refresh)
  window.electronAPI.onTaskFailed(refresh)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.task-panel {
  height: 200px;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
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
</style>
