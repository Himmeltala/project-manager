<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-04
 * @FilePath: \src\views\ProjectView\modals\PortModal.vue
 * @Description: Dev Server 端口配置对话框 — 读取/修改 vue.config.js / vite.config.ts 中的端口
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`端口配置: ${projectName}`"
    width="500"
    top="2vh"
    :close-on-click-modal="false"
  >
    <div v-if="loading" style="text-align: center; padding: 20px; color: var(--el-text-color-secondary)">
      <el-icon class="is-loading"><Loading /></el-icon> 加载中...
    </div>

    <template v-else-if="!adapterLabel">
      <div style="color: var(--el-text-color-secondary)">未找到可识别的构建工具配置</div>
      <div style="font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); margin-top: 4px">
        支持的构建工具: Vue CLI (vue.config.js)、Vite (vite.config.ts)、Webpack (webpack.dev.config.js)、Rspack
        (rspack.config.js)
      </div>
    </template>

    <template v-else>
      <el-form label-width="80px" size="small">
        <el-form-item label="项目类型">
          <span style="color: var(--el-text-color-secondary)">{{ adapterLabel }}</span>
        </el-form-item>
        <el-form-item label="当前端口">
          <span v-if="currentPort !== null" style="font-size: var(--el-font-size-medium); font-weight: 500">{{
            currentPort
          }}</span>
          <span v-else style="color: var(--el-text-color-secondary)">未配置</span>
        </el-form-item>
        <el-form-item label="新端口">
          <el-input
            v-model="newPort"
            type="number"
            :min="1"
            :max="65535"
            :placeholder="currentPort !== null ? String(currentPort) : '输入端口号'"
          />
        </el-form-item>
        <el-form-item>
          <span style="font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary)"
            >保存后需重启 dev server 生效</span
          >
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button
        plain
        size="small"
        type="primary"
        :disabled="!adapterLabel || !newPort || newPort === currentPort"
        @click="save"
      >
        保存修改
      </el-button>
      <el-button plain size="small" @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IPC } from '@/ipc/channels'

import { ElIcon } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useSuccess, useError } from '@/composables/useMessage'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectPath: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const loading = ref(false)
const adapterLabel = ref('')
const currentPort = ref<number | null>(null)
const newPort = ref<number | null>(null)

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    loading.value = true
    adapterLabel.value = ''
    currentPort.value = null
    newPort.value = null
    try {
      const result = await window.electronAPI.invoke(IPC.portConfig.detect, props.projectPath)
      if (result.adapter) {
        adapterLabel.value = result.label || ''
        currentPort.value = result.port
        newPort.value = result.port
      }
    } catch (e: any) {
      console.error('[PortModal] 检测失败:', e)
    } finally {
      loading.value = false
    }
  },
)

async function save() {
  if (newPort.value === null || newPort.value === currentPort.value) return
  try {
    const ok = await window.electronAPI.invoke(IPC.portConfig.update, props.projectPath, newPort.value)
    if (ok) {
      useSuccess(`端口已修改为 ${newPort.value}，重启 dev server 后生效`)
      currentPort.value = newPort.value
    } else {
      useError('端口修改失败，请检查文件权限或配置文件格式')
    }
    emit('close')
  } catch (e: any) {
    useError(`保存出错: ${e.message || e}`)
  }
}
</script>
