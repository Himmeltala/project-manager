<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\components\ProcessOutputPanel.vue
 * @Description: 进程输出面板，展示 Electron 子进程 stdout/stderr 实时输出
-->
<template>
  <div class="terminal-panel">
    <div class="terminal-toolbar">
      <span class="terminal-title">输出</span>
      <el-button plain size="small" @click="clearLog">清空</el-button>
    </div>
    <div ref="outputEl" class="terminal-output"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const MAX_LINES = 5000
const outputEl = ref<HTMLElement>()

let lineCount = 0
let rafScheduled = false
let pendingFragments: string[] = []
let nextTickScheduled = false
let scrollEl: HTMLElement | null = null

// 将行文本转义为安全的 HTML
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 将单行数据处理为 HTML 字符串
function formatLine(data: { name: string; line: string }): string {
  let cleanLine = data.line.replace(/\\x1b\[[0-9;]*[a-zA-Z]/g, '')
  let hash = 0
  for (let i = 0; i < data.name.length; i++) hash = data.name.charCodeAt(i) + ((hash << 5) - hash)
  const colors = ['#00bcd4', '#4caf50', '#ffc107', '#2196f3', '#e91e63']
  const color = colors[Math.abs(hash) % colors.length]
  const now = new Date()
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  return `<span class="t-ts">${ts}</span> <span class="t-name" style="color:${color}">[${escapeHtml(data.name)}]</span> <span class="t-text">${escapeHtml(cleanLine)}</span>`
}

// 收集输出行，交由 rAF 统一刷入 DOM
function collectLine(html: string) {
  pendingFragments.push(html)
  if (!rafScheduled) {
    rafScheduled = true
    requestAnimationFrame(flushDom)
  }
  if (!nextTickScheduled) {
    nextTickScheduled = true
    requestAnimationFrame(() => {
      scrollToBottom()
    })
  }
}

// rAF 回调：将累积行批量插入 DOM 并裁剪超出限制的行
function flushDom() {
  rafScheduled = false
  if (!outputEl.value || pendingFragments.length === 0) return

  const fragment = document.createDocumentFragment()
  for (const html of pendingFragments) {
    const div = document.createElement('div')
    div.className = 't-line'
    div.innerHTML = html
    fragment.appendChild(div)
  }
  lineCount += pendingFragments.length
  pendingFragments = []

  outputEl.value.appendChild(fragment)

  // 裁剪超出行数
  if (lineCount > MAX_LINES) {
    const excess = lineCount - MAX_LINES
    let removed = 0
    while (removed < excess && outputEl.value.firstChild) {
      outputEl.value.removeChild(outputEl.value.firstChild)
      removed++
    }
    lineCount -= removed
  }
}

// 滚动到最新行
function scrollToBottom() {
  nextTickScheduled = false
  if (!scrollEl) return
  scrollEl.scrollTop = scrollEl.scrollHeight
}

function clearLog() {
  if (outputEl.value) {
    outputEl.value.innerHTML = ''
  }
  lineCount = 0
  pendingFragments = []
  rafScheduled = false
}

const cleanups: (() => void)[] = []

onMounted(async () => {
  // 保存滚动容器引用
  scrollEl = outputEl.value || null

  // maxLines 仅在清空时参考，不动态调整

  // 单行（兼容旧版，实际由 batch 覆盖）
  cleanups.push(
    window.electronAPI.on('event:outputLine', (data) => {
      collectLine(formatLine(data))
    }),
  )

  // 批量（主进程 50ms 窗口合并发送）
  cleanups.push(
    window.electronAPI.on('event:outputBatch', (batch) => {
        console.log('[DEBUG panel] outputBatch received, lines:', batch.length)
      for (const data of batch) {
        collectLine(formatLine(data))
      }
    }),
  )

  // 注册到全局清理
  window.__homeCleanups = window.__homeCleanups || []
  window.__homeCleanups.push(...cleanups)
})

onUnmounted(() => {
  for (const fn of cleanups) fn()
})
</script>

<style scoped>
.terminal-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--el-bg-color);
}
.terminal-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}
.terminal-title {
  flex: 1;
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}
.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  font-family: var(--el-font-family);
  font-size: 12px;
  line-height: 1.5;
}
.t-line {
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--el-font-family);
  font-size: 12px;
  line-height: 1.5;
}
.t-ts {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.t-name {
  font-weight: bold;
}
.t-text {
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
}
</style>