/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\stores\project.store.ts
 * @Description: 项目列表与运行状态管理
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Project, ProjectSource } from '@/types/project'
import type { RunningInfo } from '@/types/process'
import { getFlow } from '@/composables/strategies/registry'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const sources = ref<ProjectSource[]>([])
  const activeSource = ref('')
  const runningInfo = ref<RunningInfo[]>([])
  const runningPaths = ref<Record<string, number | null>>({})
  // 项目路径 -> 运行中的脚本命令列表（以路径为键，跨源切换不丢失）
  const runningScripts = ref<Record<string, string[]>>({})
  // 构建工具缓存（path -> tool name）
  const buildTools = ref<Record<string, string | null>>({})
  // search state, written by SearchBar component
  const searchText = ref('')
  const searchCaseSensitive = ref(false)
  const searchWholeWord = ref(false)
  const searchRegex = ref(false)

  async function loadProjects() {
    const configPath = await window.electronAPI.invoke('project:getDefaultConfigPath')
    projects.value = await window.electronAPI.invoke('project:load', configPath)
    detectBuildTools()
  }

  /**
   * 批量检测 npm 项目的构建工具
   */
  async function detectBuildTools() {
    const npmPaths = projects.value
      .filter((p) => getFlow(p.projectType).supportsBuildToolDetection)
      .map((p) => p.path)
      .filter(Boolean)
    if (npmPaths.length === 0) return
    try {
      const result = await window.electronAPI.invoke('buildTool:detectBatch', npmPaths)
      buildTools.value = { ...buildTools.value, ...result }
    } catch {
      // 静默失败
    }
  }

  async function loadSources() {
    sources.value = await window.electronAPI.invoke('source:list', true)
    activeSource.value = await window.electronAPI.invoke('source:getActive')
  }

  /**
   * 刷新所有项目运行中的脚本状态
   */
  async function refreshRunningScripts() {
    runningScripts.value = await window.electronAPI.invoke('process:getAllRunningScripts')
  }

  // 刷新项目运行状态与进程信息
  async function refreshRunningInfo() {
    const [info, paths, scripts] = await Promise.all([
      window.electronAPI.invoke('process:getRunningInfo'),
      window.electronAPI.invoke('process:getAllRunningPaths'),
      window.electronAPI.invoke('process:getAllRunningScripts'),
    ])
    runningInfo.value = info
    runningPaths.value = paths
    runningScripts.value = scripts
  }

  return {
    projects,
    sources,
    activeSource,
    runningInfo,
    runningPaths,
    runningScripts,
    buildTools,
    searchText,
    searchCaseSensitive,
    searchWholeWord,
    searchRegex,
    loadProjects,
    loadSources,
    refreshRunningInfo,
    refreshRunningScripts,
  }
})
