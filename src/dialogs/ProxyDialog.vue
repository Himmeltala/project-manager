<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="`Proxy 代理配置: ${projectName}`"
    width="680"
    :close-on-click-modal="false"
  >
    <div v-if="!configPath && envKeys.length === 0" style="color: var(--el-text-color-secondary)">
      未找到可识别的配置文件或连接
    </div>

    <!-- .env 环境变量中的连接 -->
    <template v-if="envKeys.length > 0">
      <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 8px">环境变量 ( .env )</div>
      <el-table :data="envVarsList" size="small" :stripe="true">
        <el-table-column prop="key" label="变量名" min-width="160" />
        <el-table-column prop="value" label="连接地址" min-width="280" show-overflow-tooltip />
      </el-table>
    </template>

    <div
      v-if="!configPath && envKeys.length > 0"
      style="margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary)"
    >
      注意：环境变量显示的是当前值，修改它们需要在 IDE 中编辑 .env 文件
    </div>

    <template v-if="proxies.length === 0 && configPath">
      <div v-if="envKeys.length > 0" style="margin-top: 8px" />
      <div style="color: var(--el-text-color-secondary)">此项目未配置 proxy 代理</div>
    </template>
    <template v-if="proxies.length > 0">
      <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 8px">
        类型: {{ projectType }} | {{ configPath }}
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
            >
              <el-option
                v-for="t in row.targets.filter((x: any) => !x.isActive)"
                :key="t.url"
                :label="t.url"
                :value="t.url"
              />
              <el-option label="自定义 URL..." value="__custom__" />
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
      <el-button plain size="small" type="primary" :disabled="Object.keys(pending).length === 0" @click="save"
        >保存修改</el-button
      >
      <el-button plain size="small" @click="emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useSuccess, useError } from '../composables/useMessage'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectPath: string
}>()

const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const configPath = ref('')
const projectType = ref('')
const proxies = ref<any[]>([])
const pending = ref<Record<string, string>>({})
const envVarsList = ref<{ key: string; value: string }[]>([])
const envKeys = computed(() => envVarsList.value.map((e) => e.key))

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    pending.value = {}
    envVarsList.value = []
    const result = await window.electronAPI.detectConfigFile(props.projectPath)
    if (!result) {
      configPath.value = ''
      proxies.value = []
      return
    }
    configPath.value = result.configPath || ''
    projectType.value = result.projectType || ''
    proxies.value = result.proxies || []
    if (result.envVars) {
      envVarsList.value = Object.entries(result.envVars).map(([key, value]) => ({ key, value }))
    }
  },
)

async function save() {
  try {
    // 逐条调用 update_proxy_target
    let failCount = 0
    for (const [proxyPath, newUrl] of Object.entries(pending.value)) {
      const ok = await window.electronAPI.updateProxyTarget(configPath.value, proxyPath, newUrl)
      if (!ok) failCount++
    }
    if (failCount > 0) {
      useError(`保存失败: ${failCount} 个代理修改未生效`)
    } else {
      useSuccess('代理配置已修改，重启 dev server 后生效')
      pending.value = {}
    }
  } catch (e: any) {
    useError(`保存出错: ${e.message || e}`)
  }
}
</script>
