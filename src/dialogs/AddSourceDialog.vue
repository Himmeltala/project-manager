<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    title="添加项目源"
    width="480"
    :close-on-click-modal="false"
  >
    <el-form label-width="100px">
      <el-form-item label="源名称:">
        <el-input v-model="name" placeholder="输入项目源名称" />
      </el-form-item>
      <el-form-item label="目录:">
        <div style="display: flex; gap: 8px; width: 100%">
          <el-input v-model="directory" placeholder="选择项目目录" style="flex: 1" readonly />
          <el-button plain size="small" @click="browseDir">浏览...</el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button plain size="small" type="primary" :disabled="!name || !directory" @click="confirm">开始扫描</el-button>
      <el-button plain size="small" @click="emit('update:visible', false)">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSuccess } from '../composables/useMessage'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
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
  const dir = await window.electronAPI.selectDirectory()
  if (dir) {
    directory.value = dir
    if (!name.value) name.value = dir.split(/[/\\]/).pop() || ''
  }
}

async function confirm() {
  const created = await window.electronAPI.createSourceFromDirectory(name.value, directory.value)
  if (created) {
    useSuccess(`已创建项目源: ${name.value}`)
    await window.electronAPI.switchSource(name.value)
    emit('done')
    emit('update:visible', false)
  } else {
    // Fallback: 创建文件类型的空源
    const configPath = await window.electronAPI.getDefaultConfigPath()
    const basePath = configPath.replace(/[^\\/]+$/, '')
    const srcPath = `${basePath}projects_${name.value}.json`
    await window.electronAPI.saveProjects(srcPath, [])
    const ok = await window.electronAPI.addSource(name.value, srcPath, 'file')
    if (ok) {
      useSuccess(`已创建项目源: ${name.value}`)
      await window.electronAPI.switchSource(name.value)
      emit('done')
      emit('update:visible', false)
    }
  }
}
</script>
