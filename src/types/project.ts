/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\types\project.ts
 * @Description: 项目配置与相关数据结构定义
 */

/** Project config, each item in config.json */
export interface Project {
  name: string
  path: string
  projectType: string
  javaHome: string
  mavenHome: string
  tomcatHome: string
  tomcatWarName: string
}

/** Project source config for switching project lists */
export interface ProjectSource {
  name: string
  configPath: string
  type: string
  isActive?: boolean
  projectCount?: number
  rootDir?: string
}

/** 右键菜单项 */
export interface ContextMenuItem {
  /** 动作标识，与 handleAction 的 action 参数一致 */
  id: string
  /** 显示文本 */
  label: string
  /** 动态值（如当前版本号），可为 null */
  value?: string | null
  /** 是否禁用 */
  disabled?: boolean
}

/** Command profile by projectType (npm/maven etc.) */
export interface CommandProfile {
  start: string
  build: string
  install: string
  runScript: string
  cleanDirs: string[]
  buildOutputDir: string
  taskListFile: string | null
  taskListKey: string | null
}

/** Task list parsed from pom.xml / package.json */
export interface TaskInfo {
  type: string
  tasks: Record<string, string>
  error?: string
  file?: string
  taskListKey?: string | null
}

/** Build artifact info for clean list */
export interface BuildArtifact {
  path: string
  display: string
  sizeStr: string
  isDir: boolean
}

/** Dependency directory (node_modules etc.) */
export interface DependencyDir {
  name: string
  path: string
}
