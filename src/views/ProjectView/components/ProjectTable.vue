<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\views\ProjectView\components\ProjectTable.vue
 * @Description: 项目表格组件，含分页、右键菜单
-->

<template>
  <div class="table-wrapper">
    <el-table
      ref="tableRef"
      :data="pagedData"
      style="width: 100%"
      :stripe="true"
      :highlight-current-row="true"
      row-key="origIdx"
      :current-row-key="currentRowKey"
      size="small"
      :default-sort="{ prop: 'portText', order: 'ascending' }"
      @row-contextmenu="onContextMenu"
      @row-click="onRowClick"
      height="100%"
    >
      <template #empty>
        <el-empty description="暂无数据" />
      </template>
      <el-table-column type="expand" width="36">
        <template #default="{ row }">
          <ProjectExpandPanel :project="row.project" :origIdx="row.origIdx" @run-script="onExpandRunScript" />
        </template>
      </el-table-column>
      <el-table-column prop="index" label="序号" width="80" sortable />
      <el-table-column prop="name" label="名称" min-width="120" sortable>
        <template #default="{ row }">
          <span :style="{ color: row.color }">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="typeLabel" label="类型" width="70" sortable />
      <el-table-column prop="scaffold" label="脚手架" width="80" sortable />
      <el-table-column prop="vcsLabel" label="仓库" width="70" sortable>
        <template #default="{ row }">
          <span
            :style="{ color: row.vcsLabel === '无' ? 'var(--el-text-color-secondary)' : 'var(--el-color-primary)' }"
            >{{ row.vcsLabel }}</span
          >
        </template>
      </el-table-column>
      <el-table-column prop="displayPath" label="路径" min-width="200" show-overflow-tooltip sortable />
      <!-- 脚本运行情况独立成列 -->
      <el-table-column prop="scriptText" label="脚本" width="130" align="center" sortable :sort-method="sortScripts">
        <template #default="{ row }">
          <span :class="row.scriptCount > 0 ? 'script-running' : 'script-idle'">{{ row.scriptText }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="portText" label="端口" align="center" width="120" sortable :sort-method="sortPort">
        <template #default="{ row }">
          <template v-if="row.ports.length > 0">
            <el-tag
              v-for="(p, pi) in row.ports.slice(0, 2)"
              :key="pi"
              size="small"
              type="success"
              effect="plain"
              style="cursor: pointer; margin-right: 2px"
              @click="onViewPorts(row.origIdx)"
            >
              {{ p.port }}
            </el-tag>
            <el-tag
              v-if="row.ports.length > 2"
              size="small"
              type="info"
              effect="plain"
              style="cursor: pointer"
              @click="onViewPorts(row.origIdx)"
            >
              +{{ row.ports.length - 2 }}
            </el-tag>
          </template>
          <span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :page-sizes="PAGE_SIZE_OPTIONS"
        :total="displayData.length"
        layout="total, sizes, prev, pager, next"
        size="small"
        background
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>
  </div>

  <!-- 右键菜单 -->
  <teleport to="body">
    <Transition name="context-fade">
      <div
        v-if="contextMenu.visible"
        :key="menuKey"
        class="context-menu"
        :class="{ 'context-menu-flip': contextMenu.flip }"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="context-menu-arrow" :style="{ left: contextMenu.arrowLeft + 'px' }"></div>
        <div class="context-menu-header">
          <div class="context-menu-header-name">{{ contextMenu.name }}</div>
          <div class="context-menu-header-path" :title="contextMenu.path">{{ contextMenu.path }}</div>
        </div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="handleAction('start')">启动</div>
        <div class="context-menu-item" @click="handleAction('stop')">停止</div>

        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="handleAction('open')">打开目录</div>
        <div class="context-menu-item context-menu-sub" @mouseenter="openSub = 'openWith'">
          通过软件打开 <span class="sub-arrow">></span>
          <div class="sub-menu" v-if="openSub === 'openWith'" @mouseleave="openSub = ''">
            <div class="context-menu-item" v-for="(o, i) in openers" :key="i" @click="openProjectWith(o)">
              {{ o.name }}
            </div>
          </div>
        </div>
        <div class="context-menu-item context-menu-sub" @mouseenter="openSub = 'openTerm'">
          通过终端打开 <span class="sub-arrow">></span>
          <div class="sub-menu" v-if="openSub === 'openTerm'">
            <div class="context-menu-item" v-for="(t, i) in terminalEntries" :key="i" @click="openTerminal(t)">
              {{ t.name }}
            </div>
          </div>
        </div>
        <div class="context-menu-sep" />
        <!-- VCS 子菜单（动态检测，非 SVN/Git 项目不显示） -->
        <div v-if="vcsType" class="context-menu-item context-menu-sub" @mouseenter="openSub = 'vcs'">
          {{ vcsType.label }} <span class="sub-arrow">></span>
          <div class="sub-menu" v-if="openSub === 'vcs'" @mouseleave="openSub = ''">
            <div class="context-menu-item" @click="handleAction('vcsUpdate')">获取更新</div>
            <div class="context-menu-item" @click="handleAction('vcsCommit')">查看提交</div>
            <div class="context-menu-item" @click="handleAction('vcsLog')">查看日志</div>
            <div class="context-menu-item" @click="handleAction('vcsRepoBrowser')">打开仓库浏览器</div>
            <div class="context-menu-item" @click="handleAction('vcsCheck')">检查变更</div>
          </div>
        </div>
        <!-- 构建子菜单（由后端 Provider 菜单结构驱动） -->
        <div
          v-if="contextMenu.menu?.buildGroup"
          class="context-menu-item context-menu-sub"
          @mouseenter="openSub = contextMenu.menu.buildGroup.key"
        >
          {{ contextMenu.menu.buildGroup.label }} <span class="sub-arrow">></span>
          <div class="sub-menu" v-if="openSub === contextMenu.menu.buildGroup.key" @mouseleave="openSub = ''">
            <div
              class="context-menu-item"
              v-for="(item, i) in contextMenu.menu.buildGroup.items"
              :key="i"
              @click="handleAction(item.id)"
            >
              {{ item.label }}
            </div>
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

        <!-- 类型专属设置项（后端 Provider 声明，动态值一体返回） -->
        <template v-if="contextMenu.menu?.typeActions?.length">
          <div
            class="context-menu-item"
            v-for="(item, i) in contextMenu.menu.typeActions"
            :key="i"
            @click="handleAction(item.id)"
          >
            {{ item.label }}{{ item.value ? ` (${item.value})` : '' }}
          </div>
        </template>

        <div class="context-menu-item context-menu-sub" @mouseenter="openSub = 'config'">
          配置文件 <span class="sub-arrow">></span>
          <div class="sub-menu" v-if="openSub === 'config'" @mouseleave="openSub = ''">
            <div
              v-if="openers.length > 0"
              class="context-menu-item context-menu-sub"
              @mouseenter="openConfigSub = true"
              @mouseleave="openConfigSub = false"
            >
              打开配置文件 <span class="sub-arrow">></span>
              <div class="sub-menu" v-if="openConfigSub">
                <div class="context-menu-item" v-for="(o, i) in openers" :key="i" @click="openConfigFile(o)">
                  {{ o.name }}
                </div>
              </div>
            </div>
            <!-- 配置操作项（后端 Provider 声明，如修改代理/修改端口） -->
            <div
              class="context-menu-item"
              v-for="(item, i) in contextMenu.menu?.configItems"
              :key="i"
              @click="handleAction(item.id)"
            >
              {{ item.label }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
// #region Imports & Setup
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { SETTINGS_KEYS } from '@/ipc/keys'
import { IPC } from '@/ipc/channels'

import type { Project } from '@/types/project'
import type { TerminalEntry, ConfigOpener } from '@/types/ipc'
import { getTypeLabel } from '@/utils/mockTypeLabel'
import { getCapabilities } from '@/composables/useProjectType'
import { useProjectStore } from '@/stores/project.store'
import type { ProjectAction } from '@/types/project-action'
import type { ActionContext } from '@/actions/types'
import { actionRegistry } from '@/actions/registry'
import ProjectExpandPanel from '@/views/ProjectView/components/ProjectExpandPanel.vue'

const props = defineProps<{
  projects: Project[]
  // 动作执行上下文，菜单点击后经注册表查询策略执行
  actionContext: ActionContext
}>()

const store = useProjectStore()

const emit = defineEmits<{
  (e: 'runScript', idx: number, command: string): void
}>()
// #endregion

// #region Pagination
const currentPage = ref(1)
const pageSize = ref(15)

// 分页可选每页条数：15 起跳，15 累加至 150
const PAGE_SIZE_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150]

// 持久化分页状态的 store key
const PAGINATION_STORE_KEY = 'project_table_pagination'

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return displayData.value.slice(start, start + pageSize.value)
})

// 保存分页状态到 store
async function savePagination() {
  try {
    await window.electronAPI.invoke(IPC.store.set, PAGINATION_STORE_KEY, {
      currentPage: currentPage.value,
      pageSize: pageSize.value,
    })
  } catch {
    // 静默失败，不影响主功能
  }
}

// 从 store 加载分页状态
async function loadPagination() {
  try {
    const saved = await window.electronAPI.invoke(IPC.store.get, PAGINATION_STORE_KEY)
    if (saved && typeof saved === 'object') {
      if (saved.pageSize && PAGE_SIZE_OPTIONS.includes(saved.pageSize)) {
        pageSize.value = saved.pageSize
      }
      if (saved.currentPage && saved.currentPage > 0) {
        currentPage.value = saved.currentPage
      }
    }
  } catch {
    // 静默失败
  }
}

function onPageChange() {
  contextMenu.value.visible = false
  savePagination()
}
function onSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  savePagination()
}
// #endregion

// #region Data Processing
const colors = ['#00bcd4', '#4caf50', '#ffc107', '#2196f3', '#e91e63']
const colorCache = new Map<string, string>()

function getColor(name: string): string {
  if (colorCache.has(name)) return colorCache.get(name)!
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const color = colors[Math.abs(hash) % colors.length]
  colorCache.set(name, color)
  return color
}

const vcsLabels = ref<Record<number, string>>({})

// 把项目列表转成表格数据，附带脚本运行情况和端口
// 脚本状态以项目路径为键，切换源或重挂载后依然保留记录
// 用 Object.freeze 阻止 Vue 深度响应式代理，减少 diff 开销
const displayData = computed(() => {
  const labels = vcsLabels.value
  const scriptsMap = store.runningScripts
  const tools = store.buildTools
  return props.projects.map((p: any, i) => {
    const origIdx = p._origIdx ?? i + 1
    const idx = i + 1
    const ports = store.runningInfo
      .filter((r) => r.index === origIdx && r.port != null)
      .map((r) => ({ port: r.port!, name: r.name, modulePath: r.modulePath }))
    const portText = ports.length > 0 ? ports.map((p) => String(p.port)).join(', ') : '-'
    const scriptCount = scriptsMap[p.path]?.length || 0
    return Object.freeze({
      index: idx,
      origIdx,
      name: p.name,
      typeLabel: getTypeLabel(p.projectType),
      scaffold: getCapabilities(p.projectType).supportsBuildToolDetection ? tools[p.path] || '-' : '-',
      vcsLabel: labels[origIdx] || '-',
      displayPath: p.path,
      scriptText: scriptCount > 0 ? `${scriptCount} 个脚本运行中` : '-',
      scriptCount,
      portText,
      ports,
      color: getColor(p.name),
      project: p,
    })
  })
})

async function detectAllVcs() {
  const paths = props.projects.map((p: any) => p.path)
  const results = await window.electronAPI.invoke(IPC.vcs.detectBatch, paths)
  const map: Record<number, string> = {}
  for (let i = 0; i < results.length; i++) {
    const p = props.projects[i] as any
    map[p._origIdx ?? i + 1] = results[i]?.label || '无'
  }
  vcsLabels.value = map
}
// #endregion

// #region Context Menu
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  idx: -1,
  name: '',
  path: '',
  row: null as any,
  flip: false,
  arrowLeft: 0,
  // 类型专属菜单结构（后端 Provider 返回，含动态 value）
  menu: null as import('@/types/project').ProjectMenu | null,
})
const menuKey = ref(0)
const openSub = ref('')
// "打开配置文件"内部嵌套子菜单
const openConfigSub = ref(false)
const vcsType = ref<{ name: string; label: string } | null>(null)
const terminalEntries = ref<TerminalEntry[]>([])
const openers = ref<ConfigOpener[]>([])

function onRowClick(_row: any) {}

function sortScripts(a: any, b: any) {
  // 运行中脚本多的排前面，没有脚本的排最后
  return b.scriptCount - a.scriptCount
}

function sortPort(a: any, b: any) {
  const va = a.portText === '-' ? 9999 : parseInt(a.portText) || 9999
  const vb = b.portText === '-' ? 9999 : parseInt(b.portText) || 9999
  return va - vb
}

// 异步加载右键菜单的动态数据：VCS 类型、运行中脚本、项目任务列表
async function onContextMenu(row: any, _column: any, event: MouseEvent) {
  event.preventDefault()
  openSub.value = ''
  const proj = row.project

  // 位置计算：不超出视口边界
  const menuW = 260
  const menuH = 440
  const spaceRight = window.innerWidth - event.clientX
  const spaceBelow = window.innerHeight - event.clientY
  const flip = spaceBelow < menuH
  const x = spaceRight < menuW ? Math.max(0, window.innerWidth - menuW) : event.clientX
  const y = flip ? Math.max(0, event.clientY - menuH) : event.clientY
  const arrowLeft = Math.max(10, Math.min(event.clientX - x, menuW - 20))

  menuKey.value++
  contextMenu.value = {
    visible: true,
    x,
    y,
    flip,
    arrowLeft,
    idx: row.origIdx,
    name: proj?.name || '',
    path: proj?.path || '',
    row,
    menu: null,
  }

  // 异步加载动态菜单数据
  const idx = row.origIdx
  if (!proj) return

  // 检测 VCS 类型
  vcsType.value = await window.electronAPI.invoke(IPC.vcs.detect, proj.path)

  // 获取终端命令列表（右键菜单"打开终端"子菜单）
  terminalEntries.value = await window.electronAPI.invoke(IPC.system.getTerminalEntries)

  // 获取外部程序列表（"通过软件打开"和"打开配置文件"共用）
  try {
    const raw: string = await window.electronAPI.invoke(IPC.settings.get, SETTINGS_KEYS.openers)
    openers.value = raw ? JSON.parse(raw) : []
  } catch {
    openers.value = []
  }

  // 获取类型专属菜单结构（后端 Provider 声明并注入动态 value）
  contextMenu.value.menu = await window.electronAPI.invoke(IPC.projectMgr.getContextMenu, idx)
}

function handleAction(action: ProjectAction) {
  const idx = contextMenu.value.idx
  contextMenu.value.visible = false
  if (idx < 0) return
  // 经注册表查询动作策略并执行
  actionRegistry.get(action)?.run(props.actionContext, idx)
}

// 端口标签点击，直接经注册表执行端口详情策略
function onViewPorts(origIdx: number) {
  actionRegistry.get('viewPorts')?.run(props.actionContext, origIdx)
}

// 打开右键菜单选中的终端命令
function openTerminal(entry: TerminalEntry) {
  contextMenu.value.visible = false
  const path = contextMenu.value.row?.project?.path
  // spread 剥离响应式代理，避免 structured clone 无法序列化 Vue Proxy
  if (path) window.electronAPI.invoke(IPC.system.openTerminal, path, { ...entry })
}

// 通过外部程序打开项目目录
function openProjectWith(opener: ConfigOpener) {
  contextMenu.value.visible = false
  const path = contextMenu.value.row?.project?.path
  if (path) window.electronAPI.invoke(IPC.system.openFileWith, path, { ...opener })
}

// 通过外部程序打开配置文件
async function openConfigFile(opener: ConfigOpener) {
  contextMenu.value.visible = false
  const proj = contextMenu.value.row?.project
  if (!proj) return

  // 检测项目配置文件（优先级：构建工具配置 > 脚手架主文件）
  const configPath = await window.electronAPI.invoke(IPC.project.detectConfigFile, proj.path)
  if (configPath) {
    await window.electronAPI.invoke(IPC.system.openFileWith, configPath, { ...opener })
  }
}

// #endregion

// #region Row Highlight
function onExpandRunScript(idx: number, command: string) {
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

  // 找到对应的行元素（通过 data-row-key 属性匹配 origIdx）
  const bodyWrapper = tableEl.querySelector('.el-table__body-wrapper')
  if (!bodyWrapper) return
  const row = bodyWrapper.querySelector(`[data-row-key="${key}"]`)
  if (!row) return

  // 滚动到该行
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })

  // 直接给所有单元格加闪烁类
  const cells = row.querySelectorAll('td')
  for (const td of cells) {
    td.classList.add('cell-flash')
  }
  setTimeout(() => {
    for (const td of cells) {
      td.classList.remove('cell-flash')
    }
  }, 1200)
})

const onClickOutside = () => {
  contextMenu.value.visible = false
  openSub.value = ''
}
const onHighlight = ((e: CustomEvent) => {
  const origIdx = e.detail
  const found = props.projects.find((p: any) => p._origIdx === origIdx)
  if (!found) return
  currentRowKey.value = origIdx
}) as (e: Event) => void
// #endregion

// #region Lifecycle
onMounted(() => {
  detectAllVcs()
  loadPagination()
  document.addEventListener('click', onClickOutside)
  window.addEventListener('highlightProject', onHighlight)
})

// 防抖：项目路径变更时重新检测 VCS，避免启动期间频繁触发
let detectVcsTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => props.projects.map((p) => (p as any).path),
  (newPaths, oldPaths) => {
    if (detectVcsTimer) clearTimeout(detectVcsTimer)
    // 仅路径列表实际变更时才触发检测
    if (oldPaths && newPaths.length === oldPaths.length && newPaths.every((p, i) => p === oldPaths[i])) return
    detectVcsTimer = setTimeout(() => detectAllVcs(), 300)
  },
  { deep: false },
)

onUnmounted(() => {
  if (detectVcsTimer) clearTimeout(detectVcsTimer)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
  window.removeEventListener('highlightProject', onHighlight)
})
// #endregion
</script>

<style scoped>
.table-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.context-menu {
  --context-menu-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  position: fixed;
  z-index: 9999;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 150px;
  box-shadow: var(--context-menu-shadow);
}
.context-menu-arrow {
  position: absolute;
  top: -6px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid var(--el-border-color);
  pointer-events: none;
}
.context-menu-arrow::after {
  content: '';
  position: absolute;
  top: 1px;
  left: -5px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid var(--el-bg-color-overlay);
}
.context-menu-flip .context-menu-arrow {
  top: auto;
  bottom: -6px;
  border-bottom: none;
  border-top: 6px solid var(--el-border-color);
}
.context-menu-flip .context-menu-arrow::after {
  top: -6px;
  border-bottom: none;
  border-top: 5px solid var(--el-bg-color-overlay);
}
.context-menu-header {
  padding: 8px 12px 6px;
  cursor: default;
  width: 200px;
}
.context-menu-header-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.context-menu-header-path {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  box-shadow: var(--context-menu-shadow);
  z-index: 10000;
}
.sub-menu .context-menu-item {
  white-space: nowrap;
}

/* 定位行闪烁动画 — td 元素直接添加 cell-flash 类，提升选择器优先级替代 !important */
@keyframes cell-flash {
  0%,
  100% {
    background-color: var(--el-color-primary-light-5);
  }
  50% {
    background-color: var(--el-color-warning-light-5);
  }
}
:deep(td.cell-flash) {
  animation: cell-flash 0.3s ease-in-out 4;
}

.script-running {
  color: var(--el-color-success);
}
.script-idle {
  color: var(--el-text-color-secondary);
}
.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  padding: 4px 8px;
  background: var(--el-bg-color-overlay);
  flex-shrink: 0;
}
.context-fade-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.context-fade-leave-active {
  transition: opacity 0.1s ease;
}
.context-fade-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.context-fade-leave-to {
  opacity: 0;
}
</style>
