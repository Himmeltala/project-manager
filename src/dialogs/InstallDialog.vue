<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="`安装依赖: ${projectName}`"
    width="420"
    :close-on-click-modal="false"
  >
    <el-form label-width="0">
      <el-alert
        :title="`将对 [${projectName}] 执行 ${defaultCmd}`"
        type="info"
        :closable="false"
        style="margin-bottom: 12px"
      />
      <template v-if="projectType === 'npm'">
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
          :placeholder="projectType === 'npm' ? '如: --prefer-offline --no-audit' : '如: -Dmaven.test.skip=true -o'"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button plain size="small" type="primary" @click="confirm">执行</el-button>
      <el-button plain size="small" @click="emit('update:visible', false)">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectType: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', command: string): void
}>()

const legacyPeers = ref(true)
const forceFlag = ref(false)
const skipTests = ref(true)
const updateSnapshots = ref(false)
const extraFlags = ref('')

const defaultCmd = computed(() => (props.projectType === 'maven' ? 'mvn install -DskipTests' : 'npm install'))

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    legacyPeers.value = true
    forceFlag.value = false
    skipTests.value = true
    updateSnapshots.value = false
    extraFlags.value = ''
  },
)

function confirm() {
  const flags: string[] = []
  if (props.projectType === 'npm') {
    if (legacyPeers.value) flags.push('--legacy-peer-deps')
    if (forceFlag.value) flags.push('--force')
  } else {
    if (skipTests.value) flags.push('-DskipTests')
    if (updateSnapshots.value) flags.push('-U')
  }
  const extra = extraFlags.value.trim()
  if (extra) flags.push(extra)

  let cmd = defaultCmd.value
  if (flags.length > 0) cmd += ' ' + flags.join(' ')
  emit('confirm', cmd)
  emit('update:visible', false)
}
</script>
