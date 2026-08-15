<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-25
 * @FilePath: \src\views\ProjectView\modals\MigrateModal.vue
 * @Description: 迁移项目对话框
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`迁移项目: ${projectName}`"
    width="600"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-alert
      :title="`项目: ${projectName}\n路径: ${projectPath}`"
      type="info"
      :closable="false"
      style="margin-bottom: 12px"
    />

    <el-form label-width="100px">
      <el-form-item label="迁移方式:">
        <el-radio-group v-model="mode">
          <el-radio value="svn">SVN 仓库迁移</el-radio>
          <el-radio value="copy">普通复制迁移</el-radio>
        </el-radio-group>
      </el-form-item>

      <template v-if="mode === 'svn'">
        <el-form-item label="SVN 地址:">
          <el-input v-model="svnUrl" :placeholder="detectedSvnUrl || '输入 SVN 仓库地址'" />
          <div v-if="detectedSvnUrl" style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px">
            自动检测到: {{ detectedSvnUrl }}
          </div>
        </el-form-item>
      </template>

      <el-form-item label="目标方式:">
        <el-radio-group v-model="targetMode">
          <el-radio value="source">已有源目录</el-radio>
          <el-radio value="custom">自定义目录</el-radio>
        </el-radio-group>
      </el-form-item>

      <template v-if="targetMode === 'source'">
        <el-form-item label="目标源:">
          <el-select v-model="selectedSource" style="width: 100%">
            <el-option v-for="s in sources" :key="s.name" :label="sourceLabel(s)" :value="s.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="子目录:">
          <el-input v-model="subDir" placeholder="如: subdir/my-project-v2" />
        </el-form-item>
        <el-form-item v-if="sourcePreview" label="完整路径:">
          <div style="color: var(--el-color-success); font-family: Consolas; font-size: 12px">{{ sourcePreview }}</div>
        </el-form-item>
      </template>

      <template v-if="targetMode === 'custom'">
        <el-form-item label="目标目录:">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-input v-model="customDir" placeholder="选择或输入目标目录" style="flex: 1" />
            <el-button plain size="small" @click="browseDir">浏览...</el-button>
          </div>
        </el-form-item>
      </template>

      <el-form-item v-if="mode === 'copy' && targetMode === 'custom'" label=" ">
        <div style="font-size: 12px; color: var(--el-text-color-secondary)">
          自动排除: node_modules, .git, dist, build, .next, .nuxt, .cache, __pycache__, .idea, .vscode, *.zip, target
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button plain size="small" type="primary" @click="confirm">开始迁移</el-button>
      <el-button plain size="small" @click="emit('close')">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { IPC } from '@/ipc/channels'

import { useError } from '@/composables/useMessage'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectPath: string
  svnInfo: { url?: string; root?: string } | null
  sources: { name: string; type?: string; rootDir?: string; configPath?: string }[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', mode: 'svn' | 'copy', targetDir: string, svnUrl: string): void
}>()

const mode = ref<'svn' | 'copy'>('copy')
const svnUrl = ref('')
const targetMode = ref<'source' | 'custom'>('custom')
const selectedSource = ref('')
const subDir = ref('')
const customDir = ref('')

const detectedSvnUrl = computed(() => props.svnInfo?.url || '')

function sourceLabel(s: { name: string; type?: string; rootDir?: string }) {
  if (s.type === 'directory' && s.rootDir) return `${s.name} (${s.rootDir})`
  return s.name
}

const sourcePreview = computed(() => {
  const src = props.sources.find((s) => s.name === selectedSource.value)
  if (!src) return ''
  const base = src.rootDir || (src.configPath ? src.configPath.replace(/\\[^\\]+$/, '') : '')
  return subDir.value ? `${base}\\${subDir.value}` : base
})

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    mode.value = props.svnInfo?.url ? 'svn' : 'copy'
    svnUrl.value = props.svnInfo?.url || ''
    targetMode.value = 'custom'
    selectedSource.value = props.sources[0]?.name || ''
    subDir.value = ''
    customDir.value = props.projectPath + '_backup'
  },
)

async function browseDir() {
  const dir = await window.electronAPI.invoke(IPC.system.selectDirectory)
  if (dir) {
    customDir.value = dir
  }
}

function resolveTargetDir(): string {
  if (targetMode.value === 'source') {
    const src = props.sources.find((s) => s.name === selectedSource.value)
    if (!src) return ''
    const base = src.rootDir || (src.configPath ? src.configPath.replace(/\\[^\\]+$/, '') : '')
    return subDir.value ? `${base}\\${subDir.value}` : base
  }
  return customDir.value
}

function confirm() {
  if (mode.value === 'svn' && !svnUrl.value) {
    useError('请输入 SVN 仓库地址')
    return
  }
  const targetDir = resolveTargetDir()
  if (!targetDir) {
    useError('请输入目标位置')
    return
  }
  emit('confirm', mode.value, targetDir, mode.value === 'svn' ? svnUrl.value : '')
  emit('close')
}
</script>
