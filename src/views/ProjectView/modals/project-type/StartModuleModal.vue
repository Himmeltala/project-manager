<!--
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-09
 * @FilePath: \src\views\ProjectView\modals\project-type\StartModuleModal.vue
 * @Description: 选择启动模块对话框（Maven/Gradle 多模块项目，支持多选/停止）
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`${mode === 'stop' ? '停止模块' : '选择启动模块'}: ${projectName}`"
    width="520"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-checkbox-group v-model="selected">
      <div
        v-for="mod in displayModules"
        :key="mod.modulePath"
        style="
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          padding: 8px 10px;
          border: 1px solid var(--el-border-color-light);
          border-radius: 6px;
        "
      >
        <el-checkbox :value="mod.modulePath" :disabled="isRunning(mod)" style="margin-right: 0" />
        <div style="flex: 1; min-width: 0">
          <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
            {{ mod.name }}
          </div>
          <div
            style="
              font-size: 12px;
              color: var(--el-text-color-secondary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            "
          >
            {{ mod.modulePath }}
          </div>
        </div>
        <el-tag v-if="mod.framework" size="small" type="success">
          {{ mod.framework === 'spring-boot' ? 'SB' : 'TC' }}
        </el-tag>
        <el-tag v-if="isRunning(mod)" size="small" type="warning">运行中</el-tag>
        <el-button v-if="isRunning(mod)" size="small" type="danger" plain @click.stop="stopModule(mod)">停止</el-button>
      </div>
    </el-checkbox-group>

    <template #footer>
      <el-button
        v-if="mode === 'stop'"
        plain
        size="small"
        type="danger"
        :disabled="runningModules.length === 0"
        @click="stopAll"
      >
        全部停止
      </el-button>
      <el-button v-else plain size="small" type="primary" :disabled="selected.length === 0" @click="confirm"
        >启动</el-button
      >
      <el-button plain size="small" @click="emit('close')">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

interface RunnableModule {
  name: string
  modulePath: string
  framework: 'spring-boot' | 'tomcat' | null
}

const props = defineProps<{
  visible: boolean
  projectName: string
  modules: RunnableModule[]
  runningCommands?: string[]
  mode?: 'start' | 'stop'
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', modules: RunnableModule[]): void
  (e: 'stop', module: RunnableModule): void
  (e: 'stopAll'): void
}>()

const selected = ref<string[]>([])

const runningModules = computed(() => props.modules.filter((m) => isRunning(m)))

const displayModules = computed(() => {
  if (props.mode === 'stop') {
    return runningModules.value.length > 0 ? runningModules.value : props.modules
  }
  return props.modules
})

function isRunning(mod: RunnableModule): boolean {
  if (!props.runningCommands) return false
  return props.runningCommands.some((rc) => rc.includes(mod.modulePath))
}

function stopModule(mod: RunnableModule) {
  emit('stop', mod)
}

function stopAll() {
  emit('stopAll')
}

watch(
  () => props.visible,
  (v) => {
    if (v && props.modules.length > 0) {
      const firstNotRunning = props.modules.find((m) => !isRunning(m))
      selected.value = firstNotRunning ? [firstNotRunning.modulePath] : []
    } else {
      selected.value = []
    }
  },
)

function confirm() {
  const mods = props.modules.filter((m) => selected.value.includes(m.modulePath))
  if (mods.length > 0) {
    emit('confirm', mods)
  }
}
</script>
