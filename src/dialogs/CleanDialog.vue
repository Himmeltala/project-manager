<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="`清理构建产物: ${projectName}`"
    width="480"
    :close-on-click-modal="false"
  >
    <el-alert :title="`[${projectName}] 的构建产物：`" type="info" :closable="false" style="margin-bottom: 12px" />
    <div v-if="items.length === 0" style="color: var(--el-text-color-secondary); padding: 12px 0">
      未发现需要清理的文件
    </div>
    <el-checkbox-group v-model="selected" v-else style="margin-bottom: 12px">
      <div v-for="item in items" :key="item.path" style="padding: 4px 0">
        <el-checkbox :label="item.path">{{ item.display }} ({{ item.sizeStr }})</el-checkbox>
      </div>
    </el-checkbox-group>
    <div v-if="items.length > 0" style="display: flex; gap: 8px; margin-bottom: 8px">
      <el-button plain size="small" @click="selectAll(true)">全选</el-button>
      <el-button plain size="small" @click="selectAll(false)">取消全选</el-button>
    </div>
    <template #footer>
      <el-button plain size="small" type="primary" :disabled="selected.length === 0" @click="confirm"
        >清理选中</el-button
      >
      <el-button plain size="small" @click="emit('update:visible', false)">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BuildArtifact } from '../types/project'

const props = defineProps<{
  visible: boolean
  projectName: string
  items: BuildArtifact[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', paths: string[]): void
}>()

const selected = ref<string[]>([])

watch(
  () => props.visible,
  (v) => {
    if (v) selected.value = props.items.map((i) => i.path)
  },
)

function selectAll(checked: boolean) {
  selected.value = checked ? props.items.map((i) => i.path) : []
}

function confirm() {
  emit('confirm', [...selected.value])
  emit('update:visible', false)
}
</script>
