<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15 14:39:49
 * @FilePath: /src/views/ProjectView/modals/project/InstallModal.vue
 * @Description: 安装依赖对话框
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`安装依赖: ${projectName}`"
    width="30vw"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-form label-width="160px">
      <el-alert
        :title="`将对 [${projectName}] 执行 ${selectedCommand}`"
        type="info"
        :closable="false"
        style="margin-bottom: 12px"
      />
      <!-- 安装选项复选框组，由类型能力声明驱动 -->
      <template v-for="(flag, i) in installFlagGroups" :key="flag.value">
        <el-checkbox v-model="flagChecked[flag.value]" style="margin-bottom: 8px">{{ flag.label }}</el-checkbox>
        <br v-if="i < installFlagGroups.length - 1" />
      </template>
      <el-form-item label="额外参数" style="margin-top: 8px; margin-bottom: 0">
        <el-input v-model="extraFlags" :placeholder="installExtraPlaceholder" />
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
import { getCapabilities } from '@/composables/useProjectType'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectType: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', command: string): void
}>()

const extraFlags = ref('')
// 安装选项复选框的勾选状态，按参数值索引
const flagChecked = ref<Record<string, boolean>>({})

// 当前项目的类型能力
const capability = computed(() => getCapabilities(props.projectType))

// 安装选项复选框组（由类型能力声明）
const installFlagGroups = computed(() => capability.value.installFlags)

// 额外参数输入框提示（由类型能力声明）
const installExtraPlaceholder = computed(() => capability.value.installExtraPlaceholder)

// 当前项目的安装依赖命令列表，默认选中第一项
const installCommands = computed(() => {
  const cmds = capability.value.installCommands
  return cmds.length > 0 ? cmds : [capability.value.defaultBuildCommand]
})

const selectedCommand = ref('')

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    // 按能力声明的默认值初始化复选框状态
    const checked: Record<string, boolean> = {}
    for (const flag of capability.value.installFlags) {
      checked[flag.value] = flag.default ?? false
    }
    flagChecked.value = checked
    extraFlags.value = ''
    selectedCommand.value = installCommands.value[0] || capability.value.defaultBuildCommand
  },
)

function confirm() {
  // 收集勾选的安装参数，复选框声明完全由类型能力驱动
  const flags: string[] = []
  for (const flag of capability.value.installFlags) {
    if (flagChecked.value[flag.value]) flags.push(flag.value)
  }
  const extra = extraFlags.value.trim()
  if (extra) flags.push(extra)

  let cmd = selectedCommand.value
  if (flags.length > 0) cmd += ' ' + flags.join(' ')
  emit('confirm', cmd)
  emit('close')
}
</script>
