<template>
  <div class="search-bar">
    <el-input
      ref="searchInput"
      v-model="searchText"
      placeholder="搜索项目名称或路径..."
      :prefix-icon="'Search'"
      clearable
      size="small"
      @input="onSearch"
    />
    <el-button-group style="margin-left: 4px">
      <el-button plain :type="caseSensitive ? 'primary' : 'default'" size="small" title="区分大小写" @click="toggleCase"
        >Aa</el-button
      >
      <el-button plain :type="wholeWord ? 'primary' : 'default'" size="small" title="全词匹配" @click="toggleWord"
        >Ab</el-button
      >
      <el-button plain :type="useRegex ? 'primary' : 'default'" size="small" title="正则表达式" @click="toggleRegex"
        >.*</el-button
      >
    </el-button-group>
    <el-divider direction="vertical" />
    <el-select v-model="scope" size="small" style="width: 130px" @change="onScopeChange">
      <el-option
        v-for="s in store.sources"
        :key="s.name"
        :label="s.name + (s.isActive ? ' [当前]' : '')"
        :value="s.name"
      />
      <el-option label="所有源" value="__all__" />
    </el-select>
    <el-button
      plain
      :type="showFilter ? 'primary' : 'default'"
      size="small"
      style="margin-left: 4px"
      @click="toggleFilter"
      >筛选</el-button
    >
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useProjectStore } from '../stores/project.store'
import type { ElInput } from 'element-plus'

const emit = defineEmits<{
  (e: 'search', text: string, caseSensitive: boolean, wholeWord: boolean, useRegex: boolean): void
  (e: 'toggleFilter'): void
}>()

const searchInput = ref<InstanceType<typeof ElInput> | null>(null)

const store = useProjectStore()
const searchText = ref('')
const caseSensitive = ref(false)
const wholeWord = ref(false)
const useRegex = ref(false)
const scope = ref('')
const showFilter = ref(false)

watch(
  () => store.sources,
  (sources) => {
    if (sources.length > 0 && !scope.value) {
      scope.value = sources.find((s) => s.isActive)?.name || sources[0]?.name || '__all__'
    }
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('focusSearch', () => {
    searchInput.value?.focus()
    searchText.value = ''
    onSearch()
  })
})

function onSearch() {
  emit('search', searchText.value, caseSensitive.value, wholeWord.value, useRegex.value)
}

function toggleCase() {
  caseSensitive.value = !caseSensitive.value
  onSearch()
}
function toggleWord() {
  wholeWord.value = !wholeWord.value
  onSearch()
}
function toggleRegex() {
  useRegex.value = !useRegex.value
  onSearch()
}
function toggleFilter() {
  showFilter.value = !showFilter.value
  emit('toggleFilter')
}

async function onScopeChange(val: string) {
  if (val === '__all__') {
    // Switch to all sources mode
  } else if (val !== store.activeSource) {
    await window.electronAPI.switchSource(val)
    await store.loadProjects()
    await store.refreshRunningInfo()
  }
}
</script>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color);
}
.search-bar .el-input {
  flex: 1;
}
</style>
