<template>
  <el-dialog v-model="visible" title="管理项目源" width="650" :close-on-click-modal="false">
    <el-table :data="sources" size="small" :stripe="true" height="300" style="width: 100%" @row-dblclick="switchSource">
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
        <el-button plain size="small" @click="renameSource">重命名</el-button>
        <el-button plain size="small" @click="switchSource">设为当前</el-button>
        <el-button plain size="small" @click="refreshSource">刷新</el-button>
        <el-button plain type="danger" size="small" @click="deleteSource">删除源</el-button>
        <div style="flex: 1" />
        <el-button plain size="small" @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useConfirm, usePrompt, useSuccess, useError, useWarning } from '../composables/useMessage'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const visible = ref(false)
const sources = ref<any[]>([])
const selectedName = ref('')

watch(
  () => props.visible,
  async (v) => {
    visible.value = v
    if (v) await load()
  },
)
watch(visible, (v) => {
  emit('update:visible', v)
})

async function load() {
  sources.value = await window.electronAPI.listSources(true)
  sources.value = sources.value.map((s) => ({ ...s, typeLabel: s.type === 'file' ? '文件' : '目录' }))
}

const selectedSource = computed(() => sources.value.find((s) => s.isActive))

async function switchSource(row?: any) {
  const name = row?.name || selectedName.value
  if (!name) {
    useWarning('请选择要切换的源')
    return
  }
  if (name === sources.value.find((s) => s.isActive)?.name) return
  await window.electronAPI.switchSource(name)
  useSuccess(`已切换到: ${name}`)
  await load()
}

async function renameSource() {
  const name = selectedName.value
  if (!name) {
    useWarning('请选择要重命名的源')
    return
  }
  const newName = await usePrompt('重命名源', `修改 [${name}] 的名称:`, name)
  if (!newName || !newName.trim() || newName.trim() === name) return
  await window.electronAPI.renameSource(name, newName.trim())
  useSuccess(`已重命名为: ${newName}`)
  await load()
}

async function deleteSource() {
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
  await window.electronAPI.removeSource(name)
  useSuccess(`已删除: ${name}`)
  await load()
}

async function refreshSource() {
  const name = selectedName.value
  if (!name) {
    useWarning('请选择要刷新的源')
    return
  }
  await window.electronAPI.refreshCurrentSource()
  useSuccess(`已刷新: ${name}`)
  await load()
}
</script>
