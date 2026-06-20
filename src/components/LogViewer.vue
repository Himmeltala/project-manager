<template>
  <div class="log-viewer" ref="container">
    <div class="log-toolbar">
      <el-dropdown @command="onFilterChange">
        <el-button plain size="small">筛选</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="t in allTypes" :key="t.key" :command="t.key">
              <el-checkbox
                :model-value="visibleTypes.has(t.key)"
                @click.stop
                @change="toggleType(t.key)"
                size="small"
              />
              {{ t.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button plain size="small" @click="clearLog">清空</el-button>
    </div>
    <div class="log-content" ref="logContent">
      <div v-for="(line, i) in visibleLines" :key="i" class="log-line" v-html="line.html"></div>
      <div v-if="visibleLines.length === 0" class="log-empty">暂无日志</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const MAX_LINES = 5000
const container = ref<HTMLElement>()
const logContent = ref<HTMLElement>()

interface LogLine {
  type: string
  html: string
}

const allTypes = [
  { key: 'success', label: '成功' },
  { key: 'error', label: '报错' },
  { key: 'warning', label: '警告' },
  { key: 'info', label: '信息' },
  { key: 'plain', label: '其他' },
  { key: 'output', label: '进程' },
]

const lines = ref<LogLine[]>([])
const visibleTypes = ref(new Set(allTypes.map((t) => t.key)))

const visibleLines = computed(() => {
  return lines.value.filter((l) => visibleTypes.value.has(l.type))
})

function toggleType(key: string) {
  const s = new Set(visibleTypes.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  if (s.size === 0) allTypes.forEach((t) => s.add(t.key))
  visibleTypes.value = s
}

function onFilterChange() {}

function appendLine(type: string, html: string) {
  lines.value.push({ type, html })
  if (lines.value.length > MAX_LINES) {
    lines.value = lines.value.slice(-MAX_LINES)
  }
  scrollToBottom()
}

function clearLog() {
  lines.value = []
}

async function scrollToBottom() {
  await nextTick()
  if (logContent.value) {
    logContent.value.scrollTop = logContent.value.scrollHeight
  }
}

onMounted(() => {
  window.electronAPI.onOutputLine((data) => {
    let line = data.line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    let hash = 0
    for (let i = 0; i < data.name.length; i++) hash = data.name.charCodeAt(i) + ((hash << 5) - hash)
    const colors = ['#00bcd4', '#4caf50', '#ffc107', '#2196f3', '#e91e63']
    const color = colors[Math.abs(hash) % colors.length]
    const html = `<span style="color:${color};font-weight:bold">[${data.name}]</span> <span style="color:var(--el-text-color-primary);white-space:pre-wrap">${escapeHtml(line)}</span><br>`
    appendLine('output', html)
  })

  // 系统消息（success/error/warning/info/plain）
  window.electronAPI.onOutput(({ type, text }) => {
    const config: Record<string, { label: string; color: string }> = {
      success: { label: '成功', color: 'var(--el-color-success)' },
      error: { label: '报错', color: 'var(--el-color-danger)' },
      warning: { label: '警告', color: 'var(--el-color-warning)' },
      info: { label: '信息', color: 'var(--el-color-primary)' },
      plain: { label: '', color: 'var(--el-text-color-secondary)' },
    }
    const c = config[type] || { label: type, color: 'var(--el-text-color-secondary)' }
    const label = c.label ? `[${c.label}] ` : ''
    const html = `<span style="color:${c.color};white-space:pre-wrap">${label}${escapeHtml(text)}</span><br>`
    appendLine(type, html)
  })
})

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
</script>

<style scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  height: 200px;
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
.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
}
.log-line {
  white-space: pre-wrap;
  word-break: break-all;
}
.log-empty {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 20px;
  font-size: 14px;
}
</style>
