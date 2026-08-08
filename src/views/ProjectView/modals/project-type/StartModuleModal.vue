<!--
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-09
 * @FilePath: \src\views\ProjectView\modals\StartModuleModal.vue
 * @Description: 选择启动模块对话框（Maven/Gradle 多模块项目）
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
    <el-radio-group v-model="selected" style="width: 100%">
      <el-radio
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
      </el-radio>
    </el-radio-group>

    <template #footer>
      <el-button plain size="small" type="primary" :disabled="!selected" @click="confirm">启动</el-button>
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
  (e: 'confirm', module: RunnableModule): void
}>()

const selected = ref('')

watch(
  () => props.visible,
  (v) => {
    if (v && props.modules.length > 0) {
      selected.value = props.modules[0].modulePath
    } else {
      selected.value = ''
    }
  },
)

function confirm() {
  const mod = props.modules.find((m) => m.modulePath === selected.value)
  if (mod) {
    emit('confirm', mod)
  }
}
</script>
