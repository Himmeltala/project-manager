<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-25
 * @FilePath: \src\views\ProjectView\modals\HomeSelectorModal.vue
 * @Description: Java/Maven/Tomcat 版本选择对话框
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="dialogTitle"
    width="500"
    top="2vh"
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
      <el-button plain size="small" @click="emit('close')">取消</el-button>
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
  (e: 'close'): void
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
  const input = document.createElement('input')
  input.type = 'text'
  input.value = customPath.value
}

function confirm() {
  const path = customPath.value || selectedPath.value
  emit('confirm', path)
  emit('close')
}
</script>
