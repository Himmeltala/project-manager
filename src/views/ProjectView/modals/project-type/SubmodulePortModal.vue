<!--
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-04
 * @FilePath: \src\views\ProjectView\modals\project-type\SubmodulePortModal.vue
 * @Description: 端口详情弹窗（Maven 多模块 / 单模块 / npm 通用）
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`端口详情: ${projectName}`"
    width="480"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-table :data="portList" size="small" style="width: 100%">
      <el-table-column prop="name" label="模块/进程名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="port" label="端口" width="100" align="center" />
      <el-table-column label="路径" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span style="font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary)">{{
            row.modulePath || '-'
          }}</span>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button plain size="small" @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  projectName: string
  portList: { name: string; port: number; modulePath?: string }[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>
