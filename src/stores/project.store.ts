import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, ProjectSource } from '../types/project'
import type { RunningInfo, ScriptTask } from '../types/process'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const sources = ref<ProjectSource[]>([])
  const activeSource = ref('')
  const runningInfo = ref<RunningInfo[]>([])
  const runningPaths = ref<Record<string, number | null>>({})
  // 搜索相关状态，由 SearchBar 组件写入
  const searchText = ref('')
  const searchCaseSensitive = ref(false)
  const searchWholeWord = ref(false)
  const searchRegex = ref(false)

  async function loadProjects() {
    const configPath = await window.electronAPI.getDefaultConfigPath()
    projects.value = await window.electronAPI.loadProjects(configPath)
  }

  async function loadSources() {
    sources.value = await window.electronAPI.listSources(true)
    activeSource.value = await window.electronAPI.getActiveSource()
  }

  // 刷新所有项目的运行状态和进程信息
  async function refreshRunningInfo() {
    runningInfo.value = await window.electronAPI.getRunningInfo()
    runningPaths.value = await window.electronAPI.getAllRunningPaths()
  }

  // 正在运行的索引集合，用于表格快速判断
  const runningIndices = computed(() => new Set(runningInfo.value.map((r) => r.index)))
  const runningPathSet = computed(() => new Set(Object.keys(runningPaths.value)))

  return {
    projects,
    sources,
    activeSource,
    runningInfo,
    runningPaths,
    runningIndices,
    runningPathSet,
    searchText,
    searchCaseSensitive,
    searchWholeWord,
    searchRegex,
    loadProjects,
    loadSources,
    refreshRunningInfo,
  }
})
