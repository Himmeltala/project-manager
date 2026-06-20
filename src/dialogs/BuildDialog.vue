<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="`构建项目: ${projectName}`"
    width="500"
    :close-on-click-modal="false"
  >
    <el-form label-width="120px">
      <el-form-item :label="`构建命令 (${typeLabel}):`">
        <el-select v-model="buildCommand" filterable allow-create style="width: 100%">
          <el-option v-for="opt in buildOptions" :key="opt" :label="opt" :value="opt" />
        </el-select>
      </el-form-item>
      <el-divider />
      <el-form-item label="压缩包命名:">
        <el-radio-group v-model="zipMode">
          <el-radio value="project">使用项目名称: dist-{{ projectName }}-时间戳.zip</el-radio>
          <el-radio value="custom">自定义名称:</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="zipMode === 'custom'" label="">
        <el-input v-model="customName" placeholder="输入自定义名称（不含 .zip 后缀）" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button plain size="small" type="primary" @click="confirm">构建</el-button>
      <el-button plain size="small" @click="emit('update:visible', false)">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectPath: string
  projectType: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', command: string, zipName: string): void
}>()

const zipMode = ref('project')
const customName = ref('')
const buildCommand = ref('')

const typeLabel = computed(() => (props.projectType === 'maven' ? 'Maven' : 'npm'))

const buildOptions = computed(() => {
  const opts: string[] = []
  if (props.projectType === 'maven') {
    opts.push('mvn package -DskipTests', 'mvn package', 'mvn clean package', 'mvn install -DskipTests')
  } else {
    opts.push('npm run build', 'npm run build:prod')
  }
  return opts
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    buildCommand.value = props.projectType === 'maven' ? 'mvn package -DskipTests' : 'npm run build'
    zipMode.value = 'project'
    customName.value = ''
  },
)

function confirm() {
  const cmd = buildCommand.value || (props.projectType === 'maven' ? 'mvn package -DskipTests' : 'npm run build')
  const zipName = zipMode.value === 'custom' ? customName.value : ''
  emit('confirm', cmd, zipName)
  emit('update:visible', false)
}
</script>
