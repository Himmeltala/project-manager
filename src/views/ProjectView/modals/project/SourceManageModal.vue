<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \src\views\ProjectView\modals\project\SourceManageModal.vue
 * @Description: 管理项目源对话框
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    title="管理项目源"
    width="650"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-table
      :data="sources"
      size="small"
      stripe
      highlight-current-row
      height="300"
      style="width: 100%"
      @row-dblclick="switchSource"
      @current-change="onCurrentChange"
    >
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="typeLabel" label="类型" width="80" />
      <el-table-column prop="projectCount" label="项目数" width="80" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.isActive" size="small" type="primary">当前</el-tag>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <div style="display: flex; gap: 8px">
        <el-button plain size="small" :disabled="pullStore.pulling" @click="renameSource">重命名</el-button>
        <el-button plain size="small" :disabled="pullStore.pulling" @click="switchSource">设为当前</el-button>
        <el-button plain size="small" :disabled="pullStore.pulling" @click="refreshSource">刷新</el-button>
        <el-button plain type="danger" size="small" :disabled="pullStore.pulling" @click="deleteSource"
          >删除源</el-button
        >
        <div style="flex: 1" />
        <el-button plain size="small" @click="emit('close')">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IPC } from '@/ipc/channels'

import { useProjectStore } from '@/stores/project.store'
import { usePullStore } from '@/stores/pull.store'
import { useConfirm, usePrompt, useSuccess, useError, useWarning } from '@/composables/useMessage'

const store = useProjectStore()
const pullStore = usePullStore()

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const sources = ref<any[]>([])
const selectedName = ref('')

function onCurrentChange(row: any) {
  selectedName.value = row?.name || ''
}

watch(
  () => props.visible,
  async (v) => {
    if (v) await load()
  },
)

async function load() {
  sources.value = await window.electronAPI.invoke(IPC.source.list, true)
  sources.value = sources.value.map((s) => ({ ...s, typeLabel: s.type === 'file' ? '文件' : '目录' }))
}

async function switchSource(row?: any) {
  if (pullStore.pulling) {
    useWarning('正在拉取项目，暂不能切换项目源')
    return
  }
  const name = row?.name || selectedName.value
  if (!name) {
    useWarning('请选择要切换的源')
    return
  }
  if (name === sources.value.find((s) => s.isActive)?.name) return
  await window.electronAPI.invoke(IPC.source.switch, name)
  useSuccess(`已切换到: ${name}`)
  await load()
  await store.loadProjects()
  await store.refreshRunningInfo()
  await store.loadSources()
}

async function renameSource() {
  if (pullStore.pulling) {
    useWarning('正在拉取项目，暂不能重命名项目源')
    return
  }
  const name = selectedName.value
  if (!name) {
    useWarning('请选择要重命名的源')
    return
  }
  const newName = await usePrompt('重命名源', `修改 [${name}] 的名称:`, name)
  if (!newName || !newName.trim() || newName.trim() === name) return
  await window.electronAPI.invoke(IPC.source.rename, name, newName.trim())
  useSuccess(`已重命名为: ${newName}`)
  await load()
}

async function deleteSource() {
  if (pullStore.pulling) {
    useWarning('正在拉取项目，请等待完成或先中断')
    return
  }
  const name = selectedName.value
  if (!name) {
    useWarning('请选择要删除的源')
    return
  }
  if (sources.value.length <= 1) {
    useError('至少保留一个项目源')
    return
  }
  const ok = await useConfirm('确认删除', `确认删除项目源 '${name}'？`)
  if (!ok) return
  await window.electronAPI.invoke(IPC.source.remove, name)
  useSuccess(`已删除: ${name}`)
  await load()
}

async function refreshSource() {
  if (pullStore.pulling) {
    useWarning('正在拉取项目，请等待完成或先中断')
    return
  }
  const name = selectedName.value
  if (!name) {
    useWarning('请选择要刷新的源')
    return
  }
  await window.electronAPI.invoke(IPC.source.refreshCurrent, name)
  await load()
}
</script>
