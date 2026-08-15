<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-25
 * @FilePath: \src\views\ProjectView\modals\AddSourceModal.vue
 * @Description: 添加项目源对话框
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    title="添加项目源"
    width="500"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-form label-width="100px">
      <el-form-item label="源名称:">
        <el-input v-model="name" placeholder="输入项目源名称" />
      </el-form-item>
      <el-form-item label="目录:">
        <div style="display: flex; gap: 8px; width: 100%">
          <el-input v-model="directory" placeholder="选择项目目录" style="flex: 1" readonly />
          <el-button plain @click="browseDir">浏览...</el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button plain type="primary" :disabled="!name || !directory" @click="confirm">开始扫描</el-button>
      <el-button plain @click="emit('close')">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IPC } from '@/ipc/channels'

import { useError } from '@/composables/useMessage'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const name = ref('')
const directory = ref('')

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    name.value = ''
    directory.value = ''
  },
)

async function browseDir() {
  const dir = await window.electronAPI.invoke(IPC.system.selectDirectory)
  if (dir) {
    directory.value = dir
    if (!name.value) name.value = dir.split(/[/\\]/).pop() || ''
  }
}

async function confirm() {
  try {
    await window.electronAPI.invoke(IPC.source.startScanTask, name.value, directory.value)
    emit('done')
    emit('close')
    window.dispatchEvent(new CustomEvent('openTaskPanel'))
  } catch (e) {
    useError(`启动扫描失败: ${(e as Error).message || e}`)
  }
}
</script>
