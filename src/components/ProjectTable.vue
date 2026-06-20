<template>
  <el-table
    ref="tableRef"
    :data="displayData"
    style="width: 100%; height: 100%"
    :stripe="true"
    :highlight-current-row="true"
    row-key="index"
    :current-row-key="currentRowKey"
    size="small"
    @row-dblclick="onDoubleClick"
    @row-contextmenu="onContextMenu"
    @row-click="onRowClick"
    height="100%"
  >
    <el-table-column prop="index" label="序号" width="80" sortable />
    <el-table-column prop="name" label="名称" min-width="120" sortable>
      <template #default="{ row }">
        <span :style="{ color: row.color }">{{ row.name }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="typeLabel" label="类型" width="70" sortable />
    <el-table-column prop="vcsLabel" label="仓库" width="70" sortable>
      <template #default="{ row }">
        <span
          :style="{ color: row.vcsLabel === '无' ? 'var(--el-text-color-secondary)' : 'var(--el-color-primary)' }"
          >{{ row.vcsLabel }}</span
        >
      </template>
    </el-table-column>
    <el-table-column prop="displayPath" label="路径" min-width="200" show-overflow-tooltip sortable />
    <el-table-column prop="statusText" label="状态" width="140" sortable :sort-method="sortStatus">
      <template #default="{ row }">
        <span :style="{ color: row.isRunning ? 'var(--el-color-success)' : 'var(--el-color-danger)' }">
          {{ row.statusText }}
        </span>
      </template>
    </el-table-column>
    <el-table-column prop="portText" label="端口" width="80" sortable :sort-method="sortPort" />
  </el-table>

  <!-- 右键菜单 -->
  <teleport to="body">
    <div
      v-show="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="handleAction('start')">启动</div>
      <div class="context-menu-item" @click="handleAction('stop')">停止</div>

      <!-- 运行中脚本 -->
      <template v-if="runningScripts.length > 0">
        <div class="context-menu-sep" />
        <div class="context-menu-item context-menu-sub" @mouseenter="openSub = 'scripts'">
          运行中脚本 ({{ runningScripts.length }}) <span class="sub-arrow">></span>
          <div class="sub-menu" v-if="openSub === 'scripts'" @mouseleave="openSub = ''">
            <div class="context-menu-item" v-for="s in runningScripts" :key="s.command" @click="stopScript(s.command)">
              停止: {{ s.command }}
            </div>
          </div>
        </div>
      </template>

      <div class="context-menu-sep" />
      <div class="context-menu-item" @click="handleAction('open')">打开目录</div>
      <div class="context-menu-sep" />
      <!-- VCS 子菜单（动态检测，非 SVN/Git 项目不显示） -->
      <div v-if="vcsType" class="context-menu-item context-menu-sub" @mouseenter="openSub = 'vcs'">
        {{ vcsType.label }} <span class="sub-arrow">></span>
        <div class="sub-menu" v-if="openSub === 'vcs'" @mouseleave="openSub = ''">
          <div class="context-menu-item" @click="handleAction('vcsUpdate')">获取更新</div>
          <div class="context-menu-item" @click="handleAction('vcsCommit')">查看提交</div>
          <div class="context-menu-item" @click="handleAction('vcsLog')">查看日志</div>
          <div class="context-menu-item" @click="handleAction('vcsCheck')">检查状态</div>
        </div>
      </div>
      <div class="context-menu-item context-menu-sub" @mouseenter="openSub = 'build'">
        构建 <span class="sub-arrow">></span>
        <div class="sub-menu" v-if="openSub === 'build'" @mouseleave="openSub = ''">
          <div class="context-menu-item" @click="handleAction('build')">构建项目</div>
          <div class="context-menu-item" @click="handleAction('install')">安装依赖</div>
          <div class="context-menu-item" @click="handleAction('clean')">清理构建产物</div>
          <div class="context-menu-item" @click="handleAction('cleanModules')">清理依赖目录</div>
        </div>
      </div>
      <div class="context-menu-item context-menu-sub" @mouseenter="openSub = 'proj'">
        项目管理 <span class="sub-arrow">></span>
        <div class="sub-menu" v-if="openSub === 'proj'" @mouseleave="openSub = ''">
          <div class="context-menu-item" @click="handleAction('rename')">重命名</div>
          <div class="context-menu-item" @click="handleAction('migrate')">迁移项目</div>
          <div class="context-menu-item" @click="handleAction('remove')">移除项目</div>
          <div class="context-menu-item context-menu-danger" @click="handleAction('delete')">物理删除</div>
        </div>
      </div>
      <div class="context-menu-sep" />

      <!-- 类型专属 -->
      <template v-if="projTaskType">
        <div class="context-menu-item" @click="handleAction('java')" v-if="showJava">Java 版本 ({{ javaLabel }})</div>
        <div class="context-menu-item" @click="handleAction('maven')" v-if="showMaven">
          Maven 版本 ({{ mavenLabel }})
        </div>
        <div class="context-menu-item" @click="handleAction('tomcat')" v-if="showTomcat">
          Tomcat 版本 ({{ tomcatLabel }})
        </div>
        <div class="context-menu-item" @click="handleAction('warName')" v-if="showTomcat">
          WAR 名称 ({{ warNameLabel }})
        </div>
      </template>

      <div class="context-menu-item" @click="handleAction('proxy')">修改代理</div>

      <!-- 项目任务子菜单 -->
      <template v-if="Object.keys(taskScripts).length > 0">
        <div class="context-menu-sep" />
        <div class="context-menu-item context-menu-sub" @mouseenter="openSub = 'tasks'">
          {{ taskTypeLabel }} 任务 <span class="sub-arrow">></span>
          <div class="sub-menu" v-if="openSub === 'tasks'" @mouseleave="openSub = ''">
            <div class="context-menu-item" v-for="(desc, name) in taskScripts" :key="name" @click="runTaskScript(name)">
              {{ name }}{{ desc ? ` (${desc})` : '' }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { Project } from '../types/project'
import type { RunningInfo } from '../types/process'
import { getTypeLabel } from './mockTypeLabel'

const props = defineProps<{
  projects: Project[]
  runningInfo: RunningInfo[]
  runningPaths: Record<string, number | null>
  allSourcesMode: boolean
}>()

const emit = defineEmits<{
  (e: 'start', idx: number): void
  (e: 'stop', idx: number): void
  (e: 'openFolder', path: string): void
  (e: 'build', idx: number): void
  (e: 'install', idx: number): void
  (e: 'clean', idx: number): void
  (e: 'cleanModules', idx: number): void
  (e: 'vcsUpdate', idx: number): void
  (e: 'vcsLog', idx: number): void
  (e: 'vcsCommit', idx: number): void
  (e: 'vcsCheck', idx: number): void
  (e: 'rename', idx: number): void
  (e: 'remove', idx: number): void
  (e: 'delete', idx: number): void
  (e: 'migrate', idx: number): void
  (e: 'proxy', idx: number): void
  (e: 'runScript', idx: number, command: string): void
  (e: 'setJava', idx: number): void
  (e: 'setMaven', idx: number): void
  (e: 'setTomcat', idx: number): void
  (e: 'setWarName', idx: number): void
}>()

const selectedIndex = ref<number | null>(null)

const colors = ['#00bcd4', '#4caf50', '#ffc107', '#2196f3', '#e91e63']

function getColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const vcsLabels = ref<Record<number, string>>({})

// 把项目列表转成表格数据，附带运行状态和端口
const displayData = computed(() => {
  const runningSet = new Map(props.runningInfo.map((r) => [r.index, r]))
  return props.projects.map((p, i) => {
    const idx = i + 1
    const isRunning = runningSet.has(idx)
    const runInfo = runningSet.get(idx)
    return {
      index: idx,
      name: p.name,
      typeLabel: getTypeLabel(p.projectType),
      vcsLabel: vcsLabels.value[idx] || '-',
      displayPath: p.path,
      isRunning,
      statusText: isRunning ? '● 运行中' : '○ 未启动',
      portText: isRunning && runInfo?.port ? String(runInfo.port) : '-',
      color: getColor(p.name),
      project: p,
    }
  })
})

async function detectAllVcs() {
  const paths = props.projects.map((p) => p.path)
  const results = await window.electronAPI.detectVcsBatch(paths)
  const map: Record<number, string> = {}
  for (let i = 0; i < results.length; i++) {
    map[i + 1] = results[i]?.label || '无'
  }
  vcsLabels.value = map
}

// 右键菜单
const contextMenu = ref({ visible: false, x: 0, y: 0, idx: -1 })
const openSub = ref('')
const vcsType = ref<{ name: string; label: string } | null>(null)

// 动态菜单数据
const runningScripts = ref<{ command: string }[]>([])
const taskScripts = ref<Record<string, string>>({})
const taskTypeLabel = ref('')
const projTaskType = ref('')
const showJava = ref(false)
const showMaven = ref(false)
const showTomcat = ref(false)
const javaLabel = ref('系统默认')
const mavenLabel = ref('系统默认')
const tomcatLabel = ref('系统默认')
const warNameLabel = ref('自动检测')

function onRowClick(row: any) {
  selectedIndex.value = row.index
}

async function onDoubleClick(row: any) {
  const idx = row.index
  if (props.runningInfo.some((r) => r.index === idx)) {
    emit('stop', idx)
  } else {
    emit('start', idx)
  }
}

function sortStatus(a: any, b: any) {
  // 运行中排前面，未启动排后面
  const order: Record<string, number> = { '● 运行中': 0, '○ 未启动': 1 }
  const va = order[a.statusText] ?? 1
  const vb = order[b.statusText] ?? 1
  return va - vb
}

function sortPort(a: any, b: any) {
  const va = a.portText === '-' ? 9999 : parseInt(a.portText) || 9999
  const vb = b.portText === '-' ? 9999 : parseInt(b.portText) || 9999
  return va - vb
}

// 异步加载右键菜单的动态数据：VCS 类型、运行中脚本、项目任务列表
async function onContextMenu(row: any, _column: any, event: MouseEvent) {
  event.preventDefault()
  selectedIndex.value = row.index
  // 右键菜单贴底部显示，不够空间则翻到上面
  const menuHeight = 440
  const spaceBelow = window.innerHeight - event.clientY
  const y = spaceBelow < menuHeight ? Math.max(0, event.clientY - menuHeight) : event.clientY
  openSub.value = ''
  contextMenu.value = { visible: true, x: event.clientX, y, idx: row.index }

  // 异步加载动态菜单数据
  const idx = row.index
  const proj = props.projects[idx - 1]
  if (!proj) return

  // 检测 VCS 类型
  vcsType.value = await window.electronAPI.detectVcs(proj.path)

  runningScripts.value = await window.electronAPI.getRunningScripts(idx)

  const taskInfo = await window.electronAPI.getTaskList(idx)
  if (taskInfo && taskInfo.tasks) {
    projTaskType.value = taskInfo.type
    taskTypeLabel.value = taskInfo.type === 'maven' ? 'Maven' : 'npm'
    taskScripts.value = taskInfo.tasks
  } else {
    projTaskType.value = ''
    taskScripts.value = {}
  }

  showJava.value = proj.projectType === 'maven'
  showMaven.value = proj.projectType === 'maven'
  showTomcat.value = proj.projectType === 'maven'
  javaLabel.value = proj.javaHome ? proj.javaHome.split('\\').pop() || '系统默认' : '系统默认'
  mavenLabel.value = proj.mavenHome ? proj.mavenHome.split('\\').pop() || '系统默认' : '系统默认'
  tomcatLabel.value = proj.tomcatHome ? proj.tomcatHome.split('\\').pop() || '系统默认' : '系统默认'
  warNameLabel.value = proj.tomcatWarName || '自动检测'
}

function handleAction(action: string) {
  const idx = contextMenu.value.idx
  contextMenu.value.visible = false
  if (idx < 0) return
  switch (action) {
    case 'start':
      emit('start', idx)
      break
    case 'stop':
      emit('stop', idx)
      break
    case 'open':
      emit('openFolder', props.projects[idx - 1]?.path || '')
      break
    case 'vcsUpdate':
      emit('vcsUpdate', idx)
      break
    case 'vcsLog':
      emit('vcsLog', idx)
      break
    case 'vcsCommit':
      emit('vcsCommit', idx)
      break
    case 'vcsCheck':
      emit('vcsCheck', idx)
      break
    case 'build':
      emit('build', idx)
      break
    case 'install':
      emit('install', idx)
      break
    case 'clean':
      emit('clean', idx)
      break
    case 'cleanModules':
      emit('cleanModules', idx)
      break
    case 'rename':
      emit('rename', idx)
      break
    case 'migrate':
      emit('migrate', idx)
      break
    case 'remove':
      emit('remove', idx)
      break
    case 'delete':
      emit('delete', idx)
      break
    case 'proxy':
      emit('proxy', idx)
      break
    case 'java':
      emit('setJava', idx)
      break
    case 'maven':
      emit('setMaven', idx)
      break
    case 'tomcat':
      emit('setTomcat', idx)
      break
    case 'warName':
      emit('setWarName', idx)
      break
    default:
      break
  }
}

function stopScript(command: string) {
  const idx = contextMenu.value.idx
  contextMenu.value.visible = false
  if (idx < 0) return
  window.electronAPI.stopScript(idx, command)
}

function runTaskScript(name: string) {
  const idx = contextMenu.value.idx
  contextMenu.value.visible = false
  if (idx < 0) return
  const proj = props.projects[idx - 1]
  if (!proj) return
  const template = proj.projectType === 'maven' ? 'mvn {script}' : 'npm run {script}'
  const command = template.replace('{script}', name)
  emit('runScript', idx, command)
}

const tableRef = ref<any>(null)
const currentRowKey = ref<number | undefined>(undefined)

// 定位到行时滚动视图并直接操作 DOM 闪烁
watch(currentRowKey, async (key) => {
  if (key == null) return
  await nextTick()

  const tableEl = tableRef.value?.$el
  if (!tableEl) return

  // 找到对应的行元素
  const bodyWrapper = tableEl.querySelector('.el-table__body-wrapper')
  if (!bodyWrapper) return
  const rows = bodyWrapper.querySelectorAll('.el-table__row')
  const row = rows[key - 1]
  if (!row) return

  // 滚动到该行
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })

  // 直接给所有单元格加闪烁类
  const cells = row.querySelectorAll('td')
  cells.forEach((td) => td.classList.add('cell-flash'))
  setTimeout(() => {
    cells.forEach((td) => td.classList.remove('cell-flash'))
  }, 1200)
})

onMounted(() => {
  detectAllVcs()
  document.addEventListener('click', () => {
    contextMenu.value.visible = false
    openSub.value = ''
  })
  // 通知点击后从 HomeView 派发高亮事件，触发行的滚动和闪烁
  window.addEventListener('highlightProject', ((e: CustomEvent) => {
    const idx = e.detail
    if (idx <= 0 || idx > props.projects.length) return
    currentRowKey.value = idx
  }) as EventListener)
})

watch(
  () => props.projects,
  () => detectAllVcs(),
  { deep: true },
)

onUnmounted(() => {
  document.removeEventListener('click', () => {})
  window.removeEventListener('highlightProject', (() => {}) as EventListener)
})
</script>

<style scoped>
.el-table {
  --el-table-bg-color: var(--el-fill-color-blank);
  --el-table-tr-bg-color: var(--el-fill-color-blank);
  --el-table-header-bg-color: var(--el-bg-color-overlay);
  --el-table-border-color: var(--el-border-color);
  --el-table-text-color: var(--el-text-color-primary);
  --el-table-header-text-color: var(--el-text-color-primary);
  --el-table-row-hover-bg-color: var(--el-fill-color-light);
  --el-table-current-row-bg-color: var(--el-color-primary-light-9);
  --el-table-header-text-color: var(--el-text-color-primary);
}
html.dark .el-table__body tr.el-table__row--striped td.el-table__cell {
  background: var(--el-fill-color-lighter);
}
:deep(.el-table__body tr.el-table__row--striped) td {
  background: var(--el-fill-color-lighter);
}
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 150px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}
.context-menu-item {
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.context-menu-item:hover {
  background: var(--el-fill-color-light);
}
.context-menu-sep {
  height: 1px;
  background: var(--el-border-color);
  margin: 4px 0;
}
.context-menu-sub {
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-primary);
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.context-menu-sub:hover {
  background: var(--el-fill-color-light);
}
.context-menu-danger {
  color: var(--el-color-danger);
}
.context-menu-label {
  padding: 2px 16px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  cursor: default;
}
.context-menu-subitem {
  padding-left: 24px;
  font-size: 12px;
}
.sub-arrow {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 12px;
}
.sub-menu {
  position: absolute;
  left: 100%;
  top: -4px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
}
.sub-menu .context-menu-item {
  white-space: nowrap;
}

/* 定位行闪烁动画 — 直接操作 td 加 class */
@keyframes cell-flash {
  0%,
  100% {
    background-color: var(--el-color-primary-light-5) !important;
  }
  50% {
    background-color: var(--el-color-warning-light-5) !important;
  }
}
:deep(.cell-flash) {
  animation: cell-flash 0.3s ease-in-out 4 !important;
}
</style>
