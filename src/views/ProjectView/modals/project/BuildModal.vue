<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-25
 * @FilePath: \src\views\ProjectView\modals\BuildModal.vue
 * @Description: 构建项目对话框
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`构建项目: ${projectName}`"
    width="500"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-form label-width="120px">
      <el-form-item label="构建名称:">
        <el-select
          v-model="buildName"
          filterable
          allow-create
          clearable
          placeholder="留空则使用项目名称"
          style="width: 100%"
        >
          <el-option v-for="n in savedNames" :key="n" :label="n" :value="n" />
        </el-select>
      </el-form-item>
      <el-form-item :label="`构建命令 (${typeLabel}):`">
        <el-select v-model="buildCommand" filterable allow-create style="width: 100%">
          <el-option v-for="opt in buildOptions" :key="opt" :label="opt" :value="opt" />
        </el-select>
      </el-form-item>
      <el-divider />
      <el-form-item label="压缩包命名:">
        <el-radio-group v-model="zipMode">
          <el-radio value="project">使用项目名称: dist-{{ projectName }}.zip</el-radio>
          <el-radio value="custom">自定义名称:</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="zipMode === 'custom'" label="">
        <el-select
          v-model="customName"
          filterable
          allow-create
          clearable
          placeholder="支持 {{timestamp}} 语法"
          style="width: 100%"
        >
          <el-option v-for="n in zipNames" :key="n" :label="n" :value="n" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button plain size="small" type="primary" @click="confirm">构建</el-button>
      <el-button plain size="small" @click="emit('close')">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { getTypeLabel } from '../../../../utils/mockTypeLabel'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectType: string
  scripts?: Record<string, string>
  buildCommands?: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', command: string, zipName: string): void
}>()

const zipMode = ref('project')
const customName = ref('')
const buildCommand = ref('')
const buildName = ref('')
const savedNames = ref<string[]>([])
const zipNames = ref<string[]>([])

const typeLabel = computed(() => getTypeLabel(props.projectType))

const buildOptions = computed(() => {
  const opts: string[] = []
  if (props.buildCommands && props.buildCommands.length > 0) {
    opts.push(...props.buildCommands)
  } else if (props.scripts && Object.keys(props.scripts).length > 0) {
    for (const name of Object.keys(props.scripts).filter((s) => /build/i.test(s))) {
      opts.push(`npm run ${name}`)
    }
  } else {
    opts.push('npm run build')
  }
  return opts
})

async function loadSavedNames() {
  try {
    const [names, zips] = await Promise.all([
      window.electronAPI.invoke('store:get', 'build_names'),
      window.electronAPI.invoke('store:get', 'build_zip_names'),
    ])
    savedNames.value = Array.isArray(names) ? names : []
    zipNames.value = Array.isArray(zips) ? zips : []
  } catch {
    savedNames.value = []
    zipNames.value = []
  }
}

async function saveName(name: string) {
  if (!name.trim()) return
  const list = savedNames.value.filter((n) => n !== name)
  list.unshift(name)
  if (list.length > 50) list.length = 50
  savedNames.value = list
  try {
    await window.electronAPI.invoke('store:set', 'build_names', list)
  } catch {
    // ignore
  }
}

async function saveZipName(name: string) {
  if (!name.trim()) return
  const list = zipNames.value.filter((n) => n !== name)
  list.unshift(name)
  if (list.length > 50) list.length = 50
  zipNames.value = list
  try {
    await window.electronAPI.invoke('store:set', 'build_zip_names', list)
  } catch {
    // ignore
  }
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    buildCommand.value = props.buildCommands?.[0] || 'npm run build'
    zipMode.value = 'project'
    customName.value = ''
    buildName.value = ''
    loadSavedNames()
  },
)

function confirm() {
  const cmd = buildCommand.value || props.buildCommands?.[0] || 'npm run build'
  const name = buildName.value?.trim()
  if (name) saveName(name)
  const zipName = zipMode.value === 'custom' && customName.value?.trim() ? customName.value.trim() : ''
  if (zipName) saveZipName(zipName)
  emit('confirm', cmd, zipName)
  emit('close')
}
</script>
