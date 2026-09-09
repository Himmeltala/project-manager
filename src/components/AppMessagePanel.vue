<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-21 09:30:40
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-04 09:30:40
 * @FilePath: \src\components\AppMessagePanel.vue
 * @Description: 日志面板，纯消费 system-log.store 门面，不含任何 IPC 与订阅
-->
<template>
  <div class="system-log-panel">
    <div class="log-toolbar">
      <span class="log-title">日志</span>
      <el-button plain size="small" @click="clearLog">清空</el-button>
    </div>
    <el-scrollbar ref="logContent" class="log-content">
      <div v-for="(html, i) in lines" :key="i" class="log-line" v-html="html"></div>
      <div v-if="lines.length === 0" class="log-empty">
        <el-empty :image-size="80" description="暂无日志" />
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useSystemLogStore } from '@/stores/system-log.store'
import type { SystemLogRecord } from '@/stores/system-log.store'

const logStore = useSystemLogStore()
const logContent = ref<HTMLElement>()
// 渲染用 HTML 行，与 store 内记录通过 syncedCount 游标增量同步
const lines = ref<string[]>([])

// 类型到默认标签与颜色的映射，未知类型回退到灰色"其他"
const TYPE_META: Record<string, { label: string; color: string }> = {
  success: { label: '成功', color: 'var(--el-color-success)' },
  error: { label: '报错', color: 'var(--el-color-danger)' },
  warning: { label: '警告', color: 'var(--el-color-warning)' },
  info: { label: '信息', color: 'var(--el-color-primary)' },
  plain: { label: '', color: 'var(--el-text-color-secondary)' },
}

let lastSeq = 0
let unwatch: (() => void) | undefined

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => htmlEscapes[ch])
}

/**
 * 将 store 记录格式化为展示 HTML
 * @param r 日志记录
 * @returns 单行 HTML
 */
function formatRecordHtml(r: SystemLogRecord): string {
  const meta = TYPE_META[r.type] || { label: '其他', color: 'var(--el-text-color-secondary)' }
  const label = r.label || meta.label
  const ts = formatTime(r.time)
  const tag = label ? `<span style="color:${meta.color}">[${escapeHtml(label)}]</span> ` : ''
  return `<span style="color:var(--el-text-color-secondary);white-space:nowrap">${ts}</span> ${tag}<span style="color:var(--el-text-color-primary);white-space:pre-wrap">${escapeHtml(r.text)}</span><br>`
}

// 增量同步 store 新记录并裁剪超出行；seq 水印在头部裁剪后依然准确
function syncFromStore() {
  const records = logStore.records
  for (const record of records) {
    if (record.seq > lastSeq) {
      lines.value.push(formatRecordHtml(record))
      lastSeq = record.seq
    }
  }
  const max = logStore.maxLines
  if (lines.value.length > max) {
    lines.value = lines.value.slice(-max)
  }
  scrollToBottom()
}

async function scrollToBottom() {
  await nextTick()
  const wrap = (logContent.value as any)?.wrapRef as HTMLElement | undefined
  if (wrap) {
    wrap.scrollTop = wrap.scrollHeight
  }
}

function clearLog() {
  logStore.clearAll()
  lines.value = []
}

onMounted(() => {
  syncFromStore()
  // store 记录或行数上限变化时增量同步并裁剪
  unwatch = logStore.$subscribe(() => {
    syncFromStore()
  })
})

onUnmounted(() => {
  if (unwatch) unwatch()
})
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
  font-size: var(--el-font-size-extra-small);
  font-weight: bold;
  color: var(--el-text-color-primary);
}
.log-content {
  flex: 1;
  font-family: var(--app-font-mono);
  font-size: var(--el-font-size-extra-small);
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
