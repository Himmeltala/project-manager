/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\types\project.ts
 * @Description: 项目配置与相关数据结构定义
 */

import type { ProjectAction } from '@/types/project-action'

// Project config, each item in config.json
export interface Project {
  name: string
  path: string
  projectType: string
  javaHome: string
  mavenHome: string
  gradleHome: string
  tomcatHome: string
  tomcatWarName: string
}

// Project source config for switching project lists
export interface ProjectSource {
  name: string
  configPath: string
  type: string
  isActive?: boolean
  projectCount?: number
  rootDir?: string
}

// 右键菜单项
export interface ContextMenuItem {
  // 动作标识，与前端动作注册表的键一一对应
  id: ProjectAction
  // 显示文本
  label: string
  // 动态值（如当前版本号），可为 null
  value?: string | null
  // 是否禁用
  disabled?: boolean
}

// 右键菜单子菜单分组
export interface ProjectMenuGroup {
  // 分组唯一标识，如 'build'
  key: string
  // 子菜单标题
  label: string
  // 子菜单内叶子项
  items: ContextMenuItem[]
}

// 类型专属右键菜单结构，由后端 provider 声明，value 由 service 按项目注入
export interface ProjectMenu {
  // 构建子菜单，未声明则整个构建区块不显示
  buildGroup?: ProjectMenuGroup
  // 配置文件子菜单内的操作项，未声明则只保留打开配置文件
  configItems?: ContextMenuItem[]
  // 类型专属设置项，渲染在项目管理之后，如 Java/Maven/Tomcat 版本
  typeActions?: ContextMenuItem[]
}

// 可运行的子模块
export interface RunnableModule {
  name: string
  modulePath: string
  framework: 'spring-boot' | 'tomcat' | null
}

// 安装选项复选框组
export interface InstallFlagGroup {
  // 复选框追加的命令参数
  value: string
  // 复选框显示文本
  label: string
  // 是否默认勾选
  default?: boolean
}

// 项目类型静态能力，后端 provider 定义，前端启动时全量拉取缓存
export interface ProjectTypeCapability {
  // 唯一标识，如 'npm' / 'maven'
  type: string
  // 类型显示名称
  label: string
  // 启动模式：直接启动或选择子模块后启动
  startMode: 'direct' | 'module-select'
  // 子模块启动命令模板，{module} 为模块路径
  buildStartCommandTemplate: string
  // 子模块路径分隔符，非空时模块路径中的反斜杠替换为该分隔符
  modulePathSeparator: string
  // 构建命令候选列表
  buildCommands: string[]
  // 安装依赖命令候选列表
  installCommands: string[]
  // 安装选项复选框组
  installFlags: InstallFlagGroup[]
  // 额外参数输入框的提示文本
  installExtraPlaceholder: string
  // 任务执行命令模板，{script} 为任务名
  taskCommandTemplate: string
  // 构建命令回退值
  defaultBuildCommand: string
  // 是否支持脚手架检测
  supportsBuildToolDetection: boolean
  // 按目录名递归收集的构建产物目录（多模块场景），为空时按 profile.buildOutputDir 单点扫描
  nestedBuildOutputDirs: string[]
  // 类型专属菜单结构
  menu: ProjectMenu
}

// Command profile by projectType (npm/maven etc.)
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

// Task list parsed from pom.xml / package.json
export interface TaskInfo {
  type: string
  tasks: Record<string, string>
  error?: string
  file?: string
  taskListKey?: string | null
}

// Build artifact info for clean list
export interface BuildArtifact {
  path: string
  display: string
  sizeStr: string
  isDir: boolean
}

// Dependency directory (node_modules etc.)
export interface DependencyDir {
  name: string
  path: string
}
