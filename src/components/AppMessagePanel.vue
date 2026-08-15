<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-21
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-21 15:04:53
 * @FilePath: \src\components\AppMessagePanel.vue
 * @Description: 应用消息面板，收集前端异常和信息提示，替代 ElMessage
-->
<template>
  <div class="system-log-panel">
    <div class="log-toolbar">
      <span class="log-title">日志</span>
      <el-button plain size="small" @click="clearLog">清空</el-button>
    </div>
    <el-scrollbar ref="logContent" class="log-content">
      <div v-for="(line, i) in lines" :key="i" class="log-line" v-html="line.html"></div>
      <div v-if="lines.length === 0" class="log-empty">
        <el-empty :image-size="80" description="暂无日志" />
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { SETTINGS_KEYS } from '@/ipc/keys'
import { IPC } from '@/ipc/channels'

import { useSystemLogStore } from '@/stores/system-log.store'

const maxLines = ref(5000)
const logContent = ref<HTMLElement>()
const systemLogStore = useSystemLogStore()

interface LogLine {
  html: string
}

const lines = ref<LogLine[]>([])

function appendLine(html: string) {
  lines.value.push({ html })
  const limit = maxLines.value
  if (lines.value.length > limit) {
    lines.value = lines.value.slice(-limit)
  }
  scrollToBottom()
}

function clearLog() {
  lines.value = []
}

async function scrollToBottom() {
  await nextTick()
  const wrap = (logContent.value as any)?.wrapRef as HTMLElement | undefined
  if (wrap) {
    wrap.scrollTop = wrap.scrollHeight
  }
}

const cleanups: (() => void)[] = []

onMounted(async () => {
  const saved = await window.electronAPI.invoke(IPC.settings.get, SETTINGS_KEYS.systemLogMaxLines)
  if (saved) maxLines.value = saved

  // 系统消息（success/error/warning/info/plain）
  cleanups.push(
    window.electronAPI.on('event:output', ({ type, text }) => {
      const config: Record<string, { label: string; color: string }> = {
        success: { label: '成功', color: 'var(--el-color-success)' },
        error: { label: '报错', color: 'var(--el-color-danger)' },
        warning: { label: '警告', color: 'var(--el-color-warning)' },
        info: { label: '信息', color: 'var(--el-color-primary)' },
        plain: { label: '', color: 'var(--el-text-color-secondary)' },
      }
      const c = config[type] || { label: '其他', color: 'var(--el-text-color-secondary)' }
      const now = new Date()
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      const html = `<span style="color:var(--el-text-color-secondary);white-space:nowrap">${ts}</span> <span style="color:${c.color}">[${c.label}]</span> <span style="color:var(--el-text-color-primary);white-space:pre-wrap">${escapeHtml(text)}</span><br>`
      appendLine(html)
    }),
  )

  // 日志条目（从 store 同步）
  const syncLogEntries = () => {
    const store = systemLogStore
    while (syncedCount < store.entries.length) {
      const item = store.entries[syncedCount]
      const time = formatTime(item.timestamp)
      const tag = escapeHtml(item.info || 'log')
      const html = `<span style="color:var(--el-text-color-secondary);white-space:nowrap">${time}</span> <span style="color:var(--el-color-danger)">[${tag}]</span> <span style="color:var(--el-text-color-primary);white-space:pre-wrap">${escapeHtml(item.message)}</span><br>`
      appendLine(html)
      syncedCount++
    }
  }
  syncLogEntries()
  const unwatch = systemLogStore.$subscribe(() => {
    syncLogEntries()
  })
  cleanups.push(() => unwatch())

  // 统一存入 __homeCleanups 供自动清理
  window.__homeCleanups = window.__homeCleanups || []
  window.__homeCleanups.push(...cleanups)
})

onUnmounted(() => {
  for (const fn of cleanups) fn()
})

let syncedCount = 0

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const htmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => htmlEscapes[ch])
}
</script>

<style scoped>
.system-log-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--el-bg-color);
}
.log-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}
.log-title {
  flex: 1;
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}
.log-content {
  flex: 1;
  font-family: var(--el-font-family);
  font-size: 12px;
  line-height: 1.5;
}
.log-content :deep(.el-scrollbar__view) {
  padding: 4px 8px;
}
.log-line {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
