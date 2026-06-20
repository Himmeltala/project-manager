<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="dialogTitle"
    width="500"
    :close-on-click-modal="false"
  >
    <div style="font-weight: bold; color: var(--el-color-primary); margin-bottom: 8px">当前: {{ currentLabel }}</div>
    <el-radio-group v-model="selectedPath" style="display: flex; flex-direction: column; gap: 6px">
      <el-radio value="">系统默认</el-radio>
      <el-radio v-for="h in homes" :key="h.path" :value="h.path">{{ h.label }} ({{ h.path }})</el-radio>
    </el-radio-group>
    <div style="display: flex; gap: 8px; margin-top: 12px">
      <el-input v-model="customPath" placeholder="或手动输入路径..." readonly />
      <el-button plain size="small" @click="browse">浏览...</el-button>
    </div>
    <template #footer>
      <el-button plain size="small" type="primary" @click="confirm">确定</el-button>
      <el-button plain size="small" @click="emit('update:visible', false)">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  dialogTitle: string
  currentValue: string
  homes: { label: string; path: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', path: string): void
}>()

const selectedPath = ref('')
const customPath = ref('')

const currentLabel = computed(() => {
  if (!props.currentValue) return '系统默认'
  return props.currentValue.split('\\').pop() || props.currentValue
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    selectedPath.value = props.currentValue || ''
    customPath.value = ''
  },
)

function browse() {
  // In Electron, we can use IPC to open a directory dialog
  // For now, just show a prompt
  const input = document.createElement('input')
  input.type = 'text'
  input.value = customPath.value
}

function confirm() {
  const path = customPath.value || selectedPath.value
  emit('confirm', path)
  emit('update:visible', false)
}
</script>
