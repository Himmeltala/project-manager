<template>
  <el-dialog v-model="visible" title="数据目录管理" width="700" :close-on-click-modal="false">
    <div class="data-dir-info">
      <span class="data-dir-path">{{ dataDir }}</span>
      <el-button plain size="small" @click="openDir">打开目录</el-button>
      <span class="data-dir-total">总大小: {{ totalSizeStr }}</span>
    </div>
    <el-table :data="items" size="small" :stripe="true" height="300" style="width: 100%">
      <el-table-column prop="name" label="名称" min-width="150" />
      <el-table-column prop="category" label="分类" width="100" />
      <el-table-column prop="sizeStr" label="大小" width="100" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button plain type="danger" size="small" @click="deleteItem(row.path, row.name)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button plain size="small" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useConfirm, useSuccess, useError } from '../composables/useMessage'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const visible = ref(false)
const items = ref<any[]>([])
const dataDir = ref('')
const totalSizeStr = ref('')

watch(
  () => props.visible,
  (v) => {
    visible.value = v
  },
)
watch(visible, (v) => {
  emit('update:visible', v)
})

onMounted(async () => {
  const result = await window.electronAPI.scanDataDir()
  items.value = result.items
  dataDir.value = result.dataDir
  totalSizeStr.value = formatSize(result.totalSize)
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function openDir() {
  window.electronAPI.openFolder(dataDir.value)
}

async function deleteItem(path: string, name: string) {
  const ok = await useConfirm('确认删除', `确认删除 ${name}？`)
  if (!ok) return
  const success = await window.electronAPI.deleteDataDirItem(path)
  if (success) {
    useSuccess(`已删除: ${name}`)
    const result = await window.electronAPI.scanDataDir()
    items.value = result.items
    totalSizeStr.value = formatSize(result.totalSize)
  } else {
    useError(`删除失败: ${name}`)
  }
}
</script>

<style scoped>
.data-dir-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 8px;
  background: var(--el-bg-color-overlay);
  border-radius: 4px;
}
.data-dir-path {
  font-family: Consolas;
  font-size: 12px;
  color: var(--el-color-primary);
}
.data-dir-total {
  font-size: 14px;
  font-weight: bold;
  color: var(--el-color-warning);
}
</style>
