<template>
  <div class="filter-bar">
    <span style="font-size: 12px; color: var(--el-text-color-secondary)">状态:</span>
    <el-dropdown @command="handleCommand">
      <el-button plain size="small">{{ statusText }}</el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="all">显示全部</el-dropdown-item>
          <el-dropdown-menu>
            <el-dropdown-item command="running">
              <el-checkbox :model-value="showRunning" @click.stop="emit('update:showRunning', !showRunning)" /> 已启动
            </el-dropdown-item>
            <el-dropdown-item command="stopped">
              <el-checkbox :model-value="showStopped" @click.stop="emit('update:showStopped', !showStopped)" /> 未启动
            </el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  showRunning: boolean
  showStopped: boolean
}>()

const emit = defineEmits<{
  (e: 'update:showRunning', v: boolean): void
  (e: 'update:showStopped', v: boolean): void
}>()

const statusText = computed(() => {
  if (props.showRunning && props.showStopped) return '全部'
  const parts: string[] = []
  if (props.showRunning) parts.push('已启动')
  if (props.showStopped) parts.push('未启动')
  return parts.length > 0 ? parts.join('、') : '无'
})

function handleCommand(cmd: string) {
  if (cmd === 'all') {
    emit('update:showRunning', true)
    emit('update:showStopped', true)
    return
  }
  // The checkbox handles its own toggling via click
}
</script>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color);
  font-size: 12px;
}
</style>
