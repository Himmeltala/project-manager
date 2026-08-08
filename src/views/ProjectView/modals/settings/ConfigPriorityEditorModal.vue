<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-29
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-29
 * @FilePath: \src\views\ProjectView\modals\ConfigPriorityEditorModal.vue
 * @Description: 配置文件优先级可视化编辑器，支持排序、添加、编辑、删除
-->
<template>
  <div class="priority-editor">
    <div v-for="tool in tools" :key="tool.name" class="tool-section">
      <div class="tool-header" @click="tool.expanded = !tool.expanded">
        <el-icon><ArrowRight v-if="!tool.expanded" /><ArrowDown v-else /></el-icon>
        <span class="tool-label">{{ tool.label }}</span>
        <el-tag v-if="isCustomized(tool.name)" size="small" type="warning">已自定义</el-tag>
      </div>
      <div v-show="tool.expanded" class="file-list">
        <div v-for="(file, i) in tool.files" :key="i" class="file-row">
          <div class="sort-btns">
            <el-button size="small" plain :disabled="i === 0" @click="moveUp(tool, i)">
              <el-icon><ArrowUp /></el-icon>
            </el-button>
            <el-button size="small" plain :disabled="i === tool.files.length - 1" @click="moveDown(tool, i)">
              <el-icon><ArrowDown /></el-icon>
            </el-button>
          </div>
          <template v-if="tool.editingIndex === i">
            <el-input
              v-model="tool.editValue"
              size="small"
              class="edit-input"
              @keyup.enter="confirmEdit(tool)"
              @keyup.esc="cancelEdit(tool)"
              @blur="confirmEdit(tool)"
            />
          </template>
          <template v-else>
            <span class="file-name" @dblclick="startEdit(tool, i)">{{ file }}</span>
          </template>
          <el-tag v-if="isOriginal(tool.name, file, i)" size="small" type="info">默认</el-tag>
          <el-button size="small" type="danger" plain class="delete-btn" @click="removeFile(tool, i)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <div class="add-row">
          <el-input
            v-model="tool.newFile"
            size="small"
            placeholder="输入配置文件名，如 webpack.config.custom.js"
            @keyup.enter="addFile(tool)"
          />
          <el-button size="small" type="primary" plain :disabled="!tool.newFile.trim()" @click="addFile(tool)">
            添加
          </el-button>
        </div>
        <el-button size="small" plain @click="resetTool(tool)">恢复默认</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ArrowUp, ArrowDown, ArrowRight, Delete } from '@element-plus/icons-vue'

interface ToolSection {
  name: string
  label: string
  files: string[]
  defaultFiles: string[]
  expanded: boolean
  newFile: string
  editingIndex: number
  editValue: string
}

const props = defineProps<{
  settingKey: string
}>()

const tools = ref<ToolSection[]>([])

// 各构建工具的默认配置文件列表
const DEFAULT_CONFIG: Record<string, { label: string; files: string[] }> = {
  webpack: {
    label: 'Webpack',
    files: [
      'webpack.config.js',
      'webpack.config.ts',
      'webpack.dev.config.js',
      'webpack.prod.config.js',
      'webpack.common.config.js',
      'webpack.config.mjs',
    ],
  },
  vite: {
    label: 'Vite',
    files: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts'],
  },
  'vue-cli': {
    label: 'Vue CLI',
    files: ['vue.config.js'],
  },
  rspack: {
    label: 'Rspack',
    files: ['rspack.config.js', 'rspack.config.ts'],
  },
  rollup: {
    label: 'Rollup',
    files: ['rollup.config.js', 'rollup.config.ts', 'rollup.config.mjs'],
  },
  parcel: {
    label: 'Parcel',
    files: ['.parcelrc'],
  },
}

onMounted(async () => {
  await load()
})

async function load() {
  let saved: Record<string, string[]> = {}
  try {
    const raw: string = await window.electronAPI.invoke('settings:get', props.settingKey)
    if (raw) saved = JSON.parse(raw)
  } catch {
    // ignore
  }

  tools.value = Object.entries(DEFAULT_CONFIG).map(([name, config]) => ({
    name,
    label: config.label,
    files: saved[name] || [...config.files],
    defaultFiles: config.files,
    expanded: false,
    newFile: '',
    editingIndex: -1,
    editValue: '',
  }))
}

async function save() {
  const data: Record<string, string[]> = {}
  for (const tool of tools.value) {
    if (isCustomized(tool.name)) {
      data[tool.name] = tool.files
    }
  }
  await window.electronAPI.invoke('settings:set', props.settingKey, JSON.stringify(data))
}

function isCustomized(toolName: string): boolean {
  const tool = tools.value.find((t) => t.name === toolName)
  if (!tool) return false
  return JSON.stringify(tool.files) !== JSON.stringify(tool.defaultFiles)
}

function isOriginal(toolName: string, file: string, index: number): boolean {
  const tool = tools.value.find((t) => t.name === toolName)
  if (!tool) return false
  return tool.defaultFiles[index] === file && !isCustomized(toolName)
}

function moveUp(tool: ToolSection, i: number) {
  if (i <= 0) return
  const tmp = tool.files[i - 1]
  tool.files[i - 1] = tool.files[i]
  tool.files[i] = tmp
  save()
}

function moveDown(tool: ToolSection, i: number) {
  if (i >= tool.files.length - 1) return
  const tmp = tool.files[i + 1]
  tool.files[i + 1] = tool.files[i]
  tool.files[i] = tmp
  save()
}

function addFile(tool: ToolSection) {
  const fileName = tool.newFile.trim()
  if (!fileName) return
  if (tool.files.includes(fileName)) return
  tool.files.push(fileName)
  tool.newFile = ''
  save()
}

function removeFile(tool: ToolSection, index: number) {
  tool.files.splice(index, 1)
  save()
}

function startEdit(tool: ToolSection, index: number) {
  tool.editingIndex = index
  tool.editValue = tool.files[index]
}

function confirmEdit(tool: ToolSection) {
  if (tool.editingIndex < 0) return
  const newValue = tool.editValue.trim()
  if (newValue && newValue !== tool.files[tool.editingIndex]) {
    tool.files[tool.editingIndex] = newValue
    save()
  }
  tool.editingIndex = -1
  tool.editValue = ''
}

function cancelEdit(tool: ToolSection) {
  tool.editingIndex = -1
  tool.editValue = ''
}

function resetTool(tool: ToolSection) {
  tool.files = [...tool.defaultFiles]
  save()
}
</script>

<style scoped>
.priority-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-section {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}
.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  background: var(--el-fill-color-lighter);
  user-select: none;
}
.tool-header:hover {
  background: var(--el-fill-color-light);
}
.tool-label {
  font-size: 13px;
  font-weight: 500;
}
.file-list {
  padding: 6px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 3px;
}
.file-row:hover {
  background: var(--el-fill-color-lighter);
}
.sort-btns {
  display: flex;
  gap: 2px;
}
.sort-btns .el-button {
  padding: 2px 4px;
  min-height: 18px;
}
.file-name {
  font-size: 13px;
  font-family: monospace;
  cursor: pointer;
  flex: 1;
}
.file-name:hover {
  color: var(--el-color-primary);
}
.edit-input {
  flex: 1;
}
.delete-btn {
  padding: 2px 4px;
  min-height: 18px;
  margin-left: auto;
}
.add-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.add-row .el-input {
  flex: 1;
}
</style>
