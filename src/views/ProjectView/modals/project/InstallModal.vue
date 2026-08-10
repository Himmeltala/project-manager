<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \src\views\ProjectView\modals\InstallModal.vue
 * @Description: 安装依赖对话框 — 通过 ProjectFlowAdapter 注册表驱动命令列表和选项
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`安装依赖: ${projectName}`"
    width="500"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-form label-width="0">
      <el-alert
        :title="`将对 [${projectName}] 执行 ${selectedCommand}`"
        type="info"
        :closable="false"
        style="margin-bottom: 12px"
      />
      <template v-if="isNpmLike">
        <el-checkbox v-model="legacyPeers" style="margin-bottom: 8px">--legacy-peer-deps</el-checkbox>
        <br />
        <el-checkbox v-model="forceFlag" style="margin-bottom: 8px">--force</el-checkbox>
      </template>
      <template v-else>
        <el-checkbox v-model="skipTests" style="margin-bottom: 8px">-DskipTests</el-checkbox>
        <br />
        <el-checkbox v-model="updateSnapshots" style="margin-bottom: 8px">-U (强制更新快照)</el-checkbox>
      </template>
      <el-form-item label="额外参数:" style="margin-top: 8px; margin-bottom: 0">
        <el-input
          v-model="extraFlags"
          :placeholder="isNpmLike ? '如: --prefer-offline --no-audit' : '如: -Dmaven.test.skip=true -o'"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button plain size="small" type="primary" @click="confirm">执行</el-button>
      <el-button plain size="small" @click="emit('close')">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { getFlow } from '@/composables/strategies/registry'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectType: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', command: string): void
}>()

const legacyPeers = ref(true)
const forceFlag = ref(false)
const skipTests = ref(true)
const updateSnapshots = ref(false)
const extraFlags = ref('')

// 是否为 npm/pnpm 类型（控制安装选项复选框的显示）
const isNpmLike = computed(() => {
  const flow = getFlow(props.projectType)
  return flow.type === 'npm' || flow.type === 'pnpm'
})

// 当前项目的安装依赖命令列表，由 flow adapter 提供，默认选中第一项
const installCommands = computed(() => {
  const cmds = getFlow(props.projectType).installCommands
  return cmds.length > 0 ? cmds : ['npm install']
})

const selectedCommand = ref('')

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    legacyPeers.value = true
    forceFlag.value = false
    skipTests.value = true
    updateSnapshots.value = false
    extraFlags.value = ''
    selectedCommand.value = installCommands.value[0] || 'npm install'
  },
)

function confirm() {
  const flags: string[] = []
  if (isNpmLike.value) {
    if (legacyPeers.value) flags.push('--legacy-peer-deps')
    if (forceFlag.value) flags.push('--force')
  } else {
    if (skipTests.value) flags.push('-DskipTests')
    if (updateSnapshots.value) flags.push('-U')
  }
  const extra = extraFlags.value.trim()
  if (extra) flags.push(extra)

  let cmd = selectedCommand.value
  if (flags.length > 0) cmd += ' ' + flags.join(' ')
  emit('confirm', cmd)
  emit('close')
}
</script>
