<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \src\views\ProjectView\modals\settings\ConfigOpenersEditorModal.vue
 * @Description: 配置文件打开程序列表可视化编辑器，支持增删改
-->
<template>
  <div class="opener-editor">
    <div v-for="(entry, i) in entries" :key="i" class="entry-row">
      <div class="sort-btns">
        <div>
          <el-button size="small" plain :disabled="i === 0" @click="moveUp(i)">
            <el-icon><ArrowUp /></el-icon>
          </el-button>
        </div>
        <div>
          <el-button size="small" plain :disabled="i === entries.length - 1" @click="moveDown(i)">
            <el-icon><ArrowDown /></el-icon>
          </el-button>
        </div>
      </div>
      <div class="entry-fields">
        <el-input v-model="entry.name" placeholder="显示名称" size="small" @input="onChange" />
        <el-input v-model="entry.path" placeholder="程序路径" size="small" @input="onChange" />
        <el-input v-model="entry.args" placeholder="启动参数 ({file} 替换为文件路径)" size="small" @input="onChange" />
      </div>
      <el-button size="small" type="danger" plain @click="removeEntry(i)">删除</el-button>
    </div>
    <el-button size="small" type="primary" plain @click="addEntry">+ 添加打开程序</el-button>
    <div v-if="error" class="editor-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { IPC } from '@/ipc/channels'

import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'

interface ConfigOpener {
  name: string
  path: string
  args: string
}

const props = defineProps<{
  settingKey: string
}>()

const entries = ref<ConfigOpener[]>([])
const error = ref('')

// 宿主对话框（SettingsModal）开启 destroy-on-close，本组件随对话框内容在每次关闭时销毁、
// 打开时重新挂载，因此在此处加载即可保证每次打开都读取到最新配置
onMounted(async () => {
  await load()
})

async function load() {
  try {
    const raw: string = await window.electronAPI.invoke(IPC.settings.get, props.settingKey)
    if (raw) {
      entries.value = JSON.parse(raw)
    } else {
      entries.value = [{ name: 'VS Code', path: 'code.cmd', args: '{file}' }]
    }
  } catch {
    entries.value = [{ name: 'VS Code', path: 'code.cmd', args: '{file}' }]
  }
}

async function save() {
  try {
    const json = JSON.stringify(entries.value, null, 2)
    await window.electronAPI.invoke(IPC.settings.set, props.settingKey, json)
    error.value = ''
  } catch {
    error.value = '保存失败'
  }
}

function onChange() {
  save()
}

function addEntry() {
  entries.value.push({ name: '', path: '', args: '{file}' })
  save()
}

function moveUp(i: number) {
  if (i <= 0) return
  const tmp = entries.value[i - 1]
  entries.value[i - 1] = entries.value[i]
  entries.value[i] = tmp
  save()
}

function moveDown(i: number) {
  if (i >= entries.value.length - 1) return
  const tmp = entries.value[i + 1]
  entries.value[i + 1] = entries.value[i]
  entries.value[i] = tmp
  save()
}

function removeEntry(i: number) {
  entries.value.splice(i, 1)
  save()
}
</script>

<style scoped>
.opener-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.entry-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}
.sort-btns {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sort-btns .el-button {
  padding: 0 4px;
  min-height: 18px;
}
.entry-fields {
  flex: 1;
  display: flex;
  gap: 6px;
}
.editor-error {
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
