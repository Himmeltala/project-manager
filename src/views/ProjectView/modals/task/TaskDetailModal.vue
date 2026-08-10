<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-25
 * @FilePath: \src\views\ProjectView\modals\TaskDetailModal.vue
 * @Description: 后台任务详情对话框
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    title="后台任务详情"
    width="500"
    top="2vh"
    :close-on-click-modal="false"
  >
    <div v-if="!task" style="color: var(--el-text-color-secondary)">任务未找到</div>
    <template v-else>
      <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px">任务: {{ task.name }}</div>
      <div style="margin-bottom: 8px; color: var(--el-text-color-regular)">
        状态: <span :style="{ color: statusColor }">{{ statusText }}</span>
      </div>
      <el-progress :percentage="task.progress" :status="progressStatus" style="margin-bottom: 12px" />
      <el-button
        plain
        v-if="task.status === 'running'"
        size="small"
        type="danger"
        :disabled="cancelling"
        @click="cancelTask"
        style="margin-bottom: 12px"
      >
        {{ cancelling ? '正在取消...' : '取消任务' }}
      </el-button>
      <el-divider />
      <div style="font-size: 13px; font-weight: bold; margin-bottom: 4px">执行日志</div>
      <div ref="logRef" class="task-log">
        <div v-for="(line, i) in task.logLines" :key="i" class="task-log-line">{{ line }}</div>
      </div>
    </template>
    <template #footer>
      <el-button plain size="small" @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import type { BackgroundTask } from '@/types/task'

const props = defineProps<{
  visible: boolean
  taskId: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const task = ref<BackgroundTask | null>(null)
const cancelling = ref(false)
let timer: number | undefined

const statusMap: Record<string, string> = {
  pending: '等待中...',
  running: '执行中...',
  completed: '已完成',
  failed: '失败',
}

const statusColors: Record<string, string> = {
  pending: 'var(--el-text-color-secondary)',
  running: 'var(--el-color-primary)',
  completed: 'var(--el-color-success)',
  failed: 'var(--el-color-danger)',
}

const statusText = computed(() => {
  if (!task.value) return ''
  const base = statusMap[task.value.status] || task.value.status
  if (task.value.status === 'failed' && task.value.error) return `${base}: ${task.value.error}`
  return base
})

const statusColor = computed(() => statusColors[task.value?.status || ''] || 'var(--el-text-color-secondary)')

const progressStatus = computed(() => {
  if (task.value?.status === 'failed') return 'exception'
  if (task.value?.status === 'completed') return 'success'
  return undefined
})

async function refresh() {
  if (!props.taskId) return
  task.value = await window.electronAPI.invoke('task:get', props.taskId)
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      refresh()
      timer = window.setInterval(refresh, 1000)
    } else {
      if (timer) clearInterval(timer)
    }
  },
)

watch(
  () => props.taskId,
  () => {
    if (props.visible) refresh()
  },
)

async function cancelTask() {
  if (!props.taskId) return
  cancelling.value = true
  await window.electronAPI.invoke('task:cancel', props.taskId)
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.task-log {
  max-height: 200px;
  overflow-y: auto;
  background: var(--el-bg-color);
  padding: 8px;
  border-radius: 4px;
  font-family: Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}
.task-log-line {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
