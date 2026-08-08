<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-22 08:44:38
 * @FilePath: \src\views\ProjectView\components\SearchBar.vue
 * @Description:
-->
<template>
  <div class="search-bar">
    <el-input
      ref="searchInput"
      v-model="localSearchText"
      placeholder="搜索项目名称或路径..."
      :prefix-icon="'Search'"
      clearable
      @input="onSearch"
    />
    <el-button-group style="margin-left: 4px">
      <el-button plain :type="store.searchCaseSensitive ? 'primary' : 'default'" title="区分大小写" @click="toggleCase"
        >Aa</el-button
      >
      <el-button plain :type="store.searchWholeWord ? 'primary' : 'default'" title="全词匹配" @click="toggleWord"
        >Ab</el-button
      >
      <el-button plain :type="store.searchRegex ? 'primary' : 'default'" title="正则表达式" @click="toggleRegex"
        >.*</el-button
      >
    </el-button-group>
    <el-divider direction="vertical" />
    <el-select v-model="scope" style="width: 130px" @change="onScopeChange">
      <el-option
        v-for="s in store.sources"
        :key="s.name"
        :label="s.name + (s.isActive ? ' [当前]' : '')"
        :value="s.name"
      />
      <el-option label="所有源" value="__all__" />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../../../stores/project.store'
import type { ElInput } from 'element-plus'

const emit = defineEmits<{
  (e: 'scopeChange', val: string): void
}>()

const searchInput = ref<InstanceType<typeof ElInput> | null>(null)

const store = useProjectStore()
const scope = ref('')

// 本地搜索文字（带防抖），写回 store
const localSearchText = ref(store.searchText)
let searchTimer: number | undefined
function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    store.searchText = localSearchText.value
  }, 200)
}

watch(
  () => store.sources,
  (sources) => {
    if (sources.length > 0) {
      scope.value = sources.find((s) => s.isActive)?.name || sources[0]?.name || '__all__'
    }
  },
  { immediate: true },
)

onMounted(() => {
  const handler = () => {
    searchInput.value?.focus()
    localSearchText.value = ''
    store.searchText = ''
  }
  window.addEventListener('focusSearch', handler)
  onUnmounted(() => window.removeEventListener('focusSearch', handler))
})

function toggleCase() {
  store.searchCaseSensitive = !store.searchCaseSensitive
}
function toggleWord() {
  store.searchWholeWord = !store.searchWholeWord
}
function toggleRegex() {
  store.searchRegex = !store.searchRegex
}

async function onScopeChange(val: string) {
  if (val === '__all__') {
    emit('scopeChange', '__all__')
    return
  }
  if (val === store.activeSource) {
    // 从"所有源"模式切回同一源时仍需通知父组件重置 allSourcesMode
    emit('scopeChange', val)
    return
  }
  try {
    await window.electronAPI.invoke('source:switch', val)
    await Promise.all([store.loadProjects(), store.refreshRunningInfo()])
    await store.loadSources()
    emit('scopeChange', val)
  } catch (e) {
    console.error('切换项目源失败:', e)
  }
}
</script>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  padding: 4px 0;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color);
}
.search-bar .el-input {
  flex: 1;
}
</style>
