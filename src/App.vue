<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\App.vue
 * @Description: 根组件，管理主题、侧边栏路由和 IPC 事件
-->

<template>
  <div class="app-root" :class="themeClass">
    <div class="sidebar">
      <el-menu :default-active="currentRoute" class="sidebar-menu" :collapse-transition="false" router>
        <el-menu-item index="/">
          <el-icon><Files /></el-icon>
          <span>项目管理</span>
        </el-menu-item>
        <el-sub-menu index="tools">
          <template #title>
            <el-icon><Tools /></el-icon>
            <span>小工具</span>
          </template>
          <el-menu-item index="/tools/port">
            <el-icon><Connection /></el-icon>
            <span>端口工具</span>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </div>

    <div class="content-col">
      <div class="main-area">
        <router-view />
      </div>
      <BottomPanel
        :showTerminal="showTerminal"
        :showSystemLog="showSystemLog"
        :showNotification="showNotification"
        :showTask="showTask"
        @locateProject="onLocateProject"
        @viewDetail="onViewDetail"
      />
      <StatusBar
        :showTerminal="showTerminal"
        :showSystemLog="showSystemLog"
        :showNotification="showNotification"
        :showTask="showTask"
        @toggleTerminal="toggleTerminal"
        @toggleNotification="toggleNotification"
        @toggleTask="toggleTask"
        @toggleSystemLog="toggleSystemLog"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { SETTINGS_KEYS } from '@/ipc/keys'
import { IPC } from '@/ipc/channels'

import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project.store'
import { Files, Tools, Connection } from '@element-plus/icons-vue'
import BottomPanel from '@/components/BottomPanel.vue'
import StatusBar from '@/views/ProjectView/components/StatusBar.vue'

const theme = ref('dark')
const themeClass = computed(() => `theme-${theme.value}`)
const route = useRoute()
const currentRoute = computed(() => route.path)
const store = useProjectStore()

// 底部面板切换状态（全局）
const showTerminal = ref(false)
const showNotification = ref(false)
const showTask = ref(false)
const showSystemLog = ref(false)

function toggleTerminal() {
  showTerminal.value = !showTerminal.value
  if (showTerminal.value) {
    showNotification.value = false
    showTask.value = false
    showSystemLog.value = false
  }
}
function toggleNotification() {
  showNotification.value = !showNotification.value
  if (showNotification.value) {
    showTerminal.value = false
    showTask.value = false
    showSystemLog.value = false
  }
}
function toggleTask() {
  showTask.value = !showTask.value
  if (showTask.value) {
    showTerminal.value = false
    showNotification.value = false
    showSystemLog.value = false
  }
}
function toggleSystemLog() {
  showSystemLog.value = !showSystemLog.value
  if (showSystemLog.value) {
    showTerminal.value = false
    showNotification.value = false
    showTask.value = false
  }
}

// 通知面板定位项目，转发给对应页面处理
function onLocateProject(name: string) {
  showNotification.value = false
  window.dispatchEvent(new CustomEvent('locateProject', { detail: name }))
}

// 任务面板查看详情，转发给对应页面处理
function onViewDetail(taskId: string) {
  window.dispatchEvent(new CustomEvent('viewTaskDetail', { detail: taskId }))
}

// 闲置检测：5 分钟无操作暂停后台轮询
let idleTimer: number | undefined
const IDLE_TIMEOUT = 5 * 60 * 1000

function resetIdleTimer() {
  window.__appIdle = false
  clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    window.__appIdle = true
  }, IDLE_TIMEOUT)
}

function onUserActivity() {
  if (window.__appIdle) {
    window.__appIdle = false
    window.dispatchEvent(new CustomEvent('app-resume'))
  }
  resetIdleTimer()
}

// 读取保存的主题，初始化项目和运行状态，监听 IPC 事件
onMounted(async () => {
  const savedTheme = await window.electronAPI.invoke(IPC.settings.get, SETTINGS_KEYS.theme)
  if (savedTheme) theme.value = savedTheme
  applyTheme(theme.value)

  await Promise.all([store.loadSources(), store.loadProjects()])
  await store.refreshRunningInfo()

  // 子进程输出或启停时刷新运行状态（节流：最多每秒刷一次，页面隐藏时跳过）
  let refreshTimer: number | undefined
  function throttledRefresh() {
    if (refreshTimer) return
    if (document.hidden) return
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined
      store.refreshRunningInfo()
    }, 1000)
  }
  const appCleanups: (() => void)[] = []
  appCleanups.push(window.electronAPI.on('event:outputLine', () => throttledRefresh()))
  appCleanups.push(window.electronAPI.on('event:projectStarted', () => throttledRefresh()))
  appCleanups.push(window.electronAPI.on('event:projectStopped', () => throttledRefresh()))
  appCleanups.push(window.electronAPI.on('event:portDetected', () => throttledRefresh()))
  // 恢复可见时补刷一次运行状态与脚本状态
  const onVisibilityChange = () => {
    if (!document.hidden) {
      store.refreshRunningScripts()
      throttledRefresh()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  appCleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange))
  appCleanups.push(
    window.electronAPI.on('event:themeChanged', (newTheme: string) => {
      theme.value = newTheme
      applyTheme(newTheme)
    }),
  )
  // 用户活动监听（鼠标/键盘）
  document.addEventListener('mousemove', onUserActivity, { passive: true })
  document.addEventListener('mousedown', onUserActivity, { passive: true })
  document.addEventListener('keydown', onUserActivity, { passive: true })
  document.addEventListener('scroll', onUserActivity, { passive: true })
  resetIdleTimer()

  // 外部请求打开任务面板
  const onOpenTaskPanel = () => {
    showTask.value = true
    showTerminal.value = false
    showNotification.value = false
    showSystemLog.value = false
  }
  window.addEventListener('openTaskPanel', onOpenTaskPanel)
  window.__homeCleanups = window.__homeCleanups || []
  window.__homeCleanups.push(...appCleanups, () => window.removeEventListener('openTaskPanel', onOpenTaskPanel))
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
  clearTimeout(idleTimer)
  document.removeEventListener('mousemove', onUserActivity)
  document.removeEventListener('mousedown', onUserActivity)
  document.removeEventListener('keydown', onUserActivity)
  document.removeEventListener('scroll', onUserActivity)
  const cleanups = window.__homeCleanups
  if (cleanups) cleanups.forEach((fn) => fn())
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
:root {
  --app-sidebar-width: 180px;
}
html,
body,
#app {
  height: 100%;
  overflow: hidden;
  font-family: var(--el-font-family, 'Microsoft YaHei', Arial, sans-serif);
}
body {
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}
</style>

<style scoped>
.app-root {
  height: 100%;
  display: flex;
  background: var(--el-bg-color);
}
.sidebar {
  width: var(--app-sidebar-width);
  min-width: var(--app-sidebar-width);
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--el-bg-color-overlay);
  border-right: 1px solid var(--el-border-color);
}
.sidebar-menu {
  flex: 1;
  border-right: none;
}
.content-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-width: 0;
}
.main-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  padding: 16px 24px;
}
</style>
