<!--
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-09
 * @FilePath: \src\views\ProjectView\modals\project-type\StartModuleModal.vue
 * @Description: 选择启动模块对话框（Maven/Gradle 多模块项目，支持多选）
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    :title="`选择启动模块: ${projectName}`"
    width="480"
    top="2vh"
    :close-on-click-modal="false"
  >
    <el-checkbox-group v-model="selected" style="width: 100%">
      <el-checkbox
        v-for="mod in modules"
        :key="mod.modulePath"
        :value="mod.modulePath"
        style="
          display: block;
          margin-bottom: 12px;
          padding: 8px 12px;
          border: 1px solid var(--el-border-color-light);
          border-radius: 6px;
          width: 100%;
        "
      >
        <div style="font-weight: 600">{{ mod.name }}</div>
        <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px">
          {{ mod.modulePath }}
          <el-tag v-if="mod.framework" size="small" style="margin-left: 8px" type="success">{{
            mod.framework === 'spring-boot' ? 'Spring Boot' : 'Tomcat'
          }}</el-tag>
        </div>
      </el-checkbox>
    </el-checkbox-group>

    <template #footer>
      <el-button plain size="small" type="primary" :disabled="selected.length === 0" @click="confirm">启动</el-button>
      <el-button plain size="small" @click="emit('close')">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface RunnableModule {
  name: string
  modulePath: string
  framework: 'spring-boot' | 'tomcat' | null
}

const props = defineProps<{
  visible: boolean
  projectName: string
  modules: RunnableModule[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', modules: RunnableModule[]): void
}>()

const selected = ref<string[]>([])

watch(
  () => props.visible,
  (v) => {
    if (v && props.modules.length > 0) {
      selected.value = [props.modules[0].modulePath]
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
