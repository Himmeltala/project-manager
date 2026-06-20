<template>
  <div class="app-container" :class="themeClass">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from './stores/project.store'

const theme = ref('dark')
const themeClass = computed(() => `theme-${theme.value}`)
const store = useProjectStore()

// 读取保存的主题，初始化项目和运行状态，监听 IPC 事件
onMounted(async () => {
  const savedTheme = await window.electronAPI.getSetting('theme')
  if (savedTheme) theme.value = savedTheme
  applyTheme(theme.value)

  await Promise.all([store.loadSources(), store.loadProjects()])
  await store.refreshRunningInfo()

  // 子进程输出或启停时刷新运行状态
  window.electronAPI.onOutputLine((data) => {
    store.refreshRunningInfo()
  })
  window.electronAPI.onProjectStarted(() => store.refreshRunningInfo())
  window.electronAPI.onProjectStopped(() => store.refreshRunningInfo())
  window.electronAPI.onPortDetected(() => store.refreshRunningInfo())

  // 菜单栏切换主题时 IPC 通知到这里
  window.electronAPI.onThemeChanged((newTheme) => {
    theme.value = newTheme
    applyTheme(newTheme)
  })
})

// 切换 html.dark 类来控制 Element Plus 暗黑模式
function applyTheme(t: string) {
  if (t === 'dark') {
    document.documentElement.classList.add('dark')
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.classList.remove('dark')
    document.documentElement.setAttribute('data-theme', 'light')
  }
}

onUnmounted(() => {
  // IPC cleanup is handled by Electron
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html,
body,
#app {
  height: 100%;
  overflow: hidden;
  font-family: var(--el-font-family, 'Microsoft YaHei', Arial, sans-serif);
}

.app-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

body {
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

/* 自定义右键菜单 */
.context-menu {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
}
</style>
