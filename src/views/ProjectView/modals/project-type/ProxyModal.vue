<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\views\ProjectView\modals\ProxyModal.vue
 * @Description: Proxy 代理配置对话框（适配器模式版）
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`Proxy 代理配置: ${projectName}`"
    width="680"
    :close-on-click-modal="false"
  >
    <div v-if="loading" style="text-align: center; padding: 20px; color: var(--el-text-color-secondary)">
      <el-icon class="is-loading"><Loading /></el-icon> 加载中...
    </div>

    <div v-else-if="!adapterLabel" style="color: var(--el-text-color-secondary)">未找到可识别的配置文件或连接</div>

    <template v-if="proxies.length === 0 && adapterLabel">
      <div style="color: var(--el-text-color-secondary)">此项目未配置 proxy 代理</div>
    </template>

    <template v-if="proxies.length > 0">
      <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 8px">
        类型: {{ adapterLabel }}
      </div>
      <el-table :data="proxies" size="small" :stripe="true">
        <el-table-column label="代理路径" min-width="120">
          <template #default="{ row }">
            <span
              :style="{ color: row.isCommented ? 'var(--el-text-color-secondary)' : 'var(--el-text-color-primary)' }"
            >
              {{ row.isCommented ? `[注释] ${row.path}` : row.path }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="当前目标" min-width="180">
          <template #default="{ row }">
            <span
              v-if="row.activeTarget"
              :style="{ color: row.isCommented ? 'var(--el-text-color-secondary)' : 'var(--el-text-color-primary)' }"
            >
              {{ row.activeTarget.url }}
            </span>
            <span v-else style="color: var(--el-text-color-secondary)">{{
              row.isCommented ? '(已注释)' : '(无活动目标)'
            }}</span>
          </template>
        </el-table-column>
        <el-table-column label="切换" min-width="200">
          <template #default="{ row }">
            <el-select
              v-model="pending[row.path]"
              placeholder="选择备用目标..."
              size="small"
              style="width: 100%"
              filterable
              allow-create
              @change="(val: string) => onTargetChange(row.path, val)"
            >
              <el-option
                v-for="t in row.targets.filter((x: any) => !x.isActive)"
                :key="t.url"
                :label="t.url"
                :value="t.url"
              />
              <el-option :label="CUSTOM_URL_LABEL" :value="CUSTOM_URL_VALUE" />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
      <div
        v-if="Object.keys(pending).length > 0"
        style="margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary)"
      >
        待保存修改: {{ Object.keys(pending).length }} 个代理
      </div>
    </template>

    <template #footer>
      <el-button plain size="small" type="primary" :disabled="Object.keys(pending).length === 0" @click="save">
        保存修改
      </el-button>
      <el-button plain size="small" @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElIcon } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useSuccess, useError, usePrompt } from '@/composables/useMessage'

// 自定义 URL 选项的标识值与提示文案
const CUSTOM_URL_VALUE = '__custom__'
const CUSTOM_URL_LABEL = '自定义 URL...'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectPath: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const loading = ref(false)
const adapterLabel = ref('')
const proxies = ref<any[]>([])
const pending = ref<Record<string, string>>({})

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    loading.value = true
    pending.value = {}
    adapterLabel.value = ''
    proxies.value = []
    try {
      const result = await window.electronAPI.invoke('proxyConfig:detect', props.projectPath)
      if (result && result.adapter) {
        adapterLabel.value = result.label || ''
        proxies.value = result.proxies || []
      }
    } catch (e: any) {
      console.error('[ProxyModal] 加载代理配置失败:', e)
    } finally {
      loading.value = false
    }
  },
)

/**
 * 切换或自定义目标地址
 * @param path 代理路径
 * @param val 选中的目标地址
 */
async function onTargetChange(path: string, val: string) {
  const url =
    val === CUSTOM_URL_VALUE
      ? ((await usePrompt(CUSTOM_URL_LABEL, '请输入目标地址（http/https 开头）:')) || '').trim()
      : val.trim()
  if (url) {
    pending.value[path] = url
  } else {
    delete pending.value[path]
  }
}

async function save() {
  if (Object.keys(pending.value).length === 0) return
  try {
    const changes = JSON.parse(JSON.stringify(pending.value)) as Record<string, string>
    const result = await window.electronAPI.invoke('proxyConfig:update', props.projectPath, changes)
    if (result.failed.length > 0) {
      useError(`保存失败，未生效: ${result.failed.join(', ')}`)
    } else {
      useSuccess('代理配置已修改，重启 dev server 后生效')
      pending.value = {}
    }
    emit('close')
  } catch (e: any) {
    useError(`保存出错: ${e.message || e}`)
  }
}
</script>
