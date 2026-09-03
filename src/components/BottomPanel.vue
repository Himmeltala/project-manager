<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \src\components\BottomPanel.vue
 * @Description: 底部面板容器，管理输出/日志/通知/任务四个子面板的显隐和拖拽
-->
<template>
  <div v-show="anyVisible" class="bottom-panels" ref="panelRef" :style="{ height: panelHeight + 'px' }">
    <div class="resize-handle" @mousedown.prevent="onDragStart"></div>
    <ProcessOutputPanel v-show="showTerminal" />
    <AppMessagePanel v-show="showSystemLog" />
    <NotificationList v-show="showNotification" @locateProject="(n: string) => emit('locateProject', n)" />
    <TaskPanel v-show="showTask" @viewDetail="(id: string) => emit('viewDetail', id)" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { SETTINGS_KEYS } from '@/ipc/keys'
import { IPC, IPC_EVENT } from '@/ipc/channels'

import ProcessOutputPanel from '@/components/ProcessOutputPanel.vue'
import AppMessagePanel from '@/components/AppMessagePanel.vue'
import NotificationList from '@/views/ProjectView/components/NotificationList.vue'
import TaskPanel from '@/views/ProjectView/components/TaskPanel.vue'

const props = defineProps<{
  showTerminal: boolean
  showSystemLog: boolean
  showNotification: boolean
  showTask: boolean
}>()

const anyVisible = computed(() => props.showTerminal || props.showSystemLog || props.showNotification || props.showTask)

const emit = defineEmits<{
  (e: 'locateProject', name: string): void
  (e: 'viewDetail', taskId: string): void
}>()

const panelRef = ref<HTMLElement>()
const panelHeight = ref(150)
let dragState: { startY: number; startH: number } | null = null

// 面板高度边界，与设置面板中定义的约束保持一致
const PANEL_HEIGHT_MIN = 80
const PANEL_HEIGHT_MAX = 800

const cleanups: (() => void)[] = []

onMounted(async () => {
  const saved = await window.electronAPI.invoke(IPC.settings.get, SETTINGS_KEYS.bottomPanelHeight)
  if (saved) panelHeight.value = Number(saved) || 200

  // 设置变更时实时同步面板高度，无需重启应用
  cleanups.push(
    window.electronAPI.on(IPC_EVENT.settingsChanged, ({ key, value }) => {
      if (key !== SETTINGS_KEYS.bottomPanelHeight) return
      const height = Number(value)
      if (Number.isFinite(height)) {
        panelHeight.value = Math.max(PANEL_HEIGHT_MIN, Math.min(PANEL_HEIGHT_MAX, height))
      }
    }),
  )

  // 统一存入全局清理列表，与其余面板组件保持一致的清理约定
  window.__homeCleanups = window.__homeCleanups || []
  window.__homeCleanups.push(...cleanups)
})

function onDragStart(e: MouseEvent) {
  dragState = { startY: e.clientY, startH: panelHeight.value }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (!dragState) return
  const delta = dragState.startY - e.clientY
  panelHeight.value = Math.max(PANEL_HEIGHT_MIN, Math.min(PANEL_HEIGHT_MAX, dragState.startH + delta))
}

async function onDragEnd() {
  dragState = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  await window.electronAPI.invoke(IPC.settings.set, SETTINGS_KEYS.bottomPanelHeight, panelHeight.value)
}

onUnmounted(() => {
  for (const fn of cleanups) fn()
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})
</script>

<style scoped>
.bottom-panels {
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.resize-handle {
  height: 4px;
  cursor: ns-resize;
  flex-shrink: 0;
  background: transparent;
  position: relative;
  z-index: 1;
}
.resize-handle:hover {
  background: var(--el-color-primary-light-5);
}
</style>
