/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\types\ipc.ts
 * @Description: IPC 通道类型定义，声明主进程与渲染进程之间的接口
 */

/* 范围更新/检查的起始结束序号 */
export interface VcsRangeParams {
  startIdx: number
  endIdx: number
}

/* VCS 检查结果（远程变更或本地未提交文件） */
export interface VcsCheckResult {
  projectName: string
  projectPath: string
  files: string[]
  count: number
  summary: string
  changeTypes?: string
}

/* 右键菜单终端命令条目 */
export interface TerminalEntry {
  name: string
  path: string
  args: string
  init: string
}

/* 配置文件打开程序条目 */
export interface ConfigOpener {
  name: string
  path: string
  args: string
}

/* 更新信息 */
export interface UpdateInfo {
  url: string
  filename: string
}

/* 代理配置中的单条代理条目 */
export interface ProxyEntry {
  path: string
  targets: ProxyTarget[]
  activeTarget: ProxyTarget | null
  entryStart: number
  entryEnd: number
  isCommented: boolean
}

/* 代理条目下的目标地址 */
export interface ProxyTarget {
  lineIndex: number
  isActive: boolean
  url: string
  comment: string
  rawLine: string
  commentType: string
}

/* 代理配置解析结果 */
export interface ProxyConfigResult {
  configPath: string
  projectType: string
  proxies: ProxyEntry[]
  /* .env 环境变量键值对 */
  envVars?: Record<string, string>
}

/* 数据目录扫描结果项 */
export interface DataDirItem {
  name: string
  path: string
  isDir: boolean
  size: number
  sizeStr: string
  category: string
}

/* 设置分类（对应 settings_schema.json 结构） */
export interface SettingsSchema {
  key: string
  label: string
  groups: SettingsGroup[]
}

/* 设置分组（一组相关设置项） */
export interface SettingsGroup {
  label: string
  settings: SettingsField[]
}

/* 单个设置字段定义 */
export interface SettingsField {
  key: string
  label: string
  type: string
  default: any
  options?: { label: string; value: string }[]
  description?: string
  min?: number
  max?: number
  step?: number
  suffix?: string
  placeholder?: string
  dependsOn?: string
  dependsValue?: string
}

/* 渲染进程调用的全部 IPC 接口 */
/* 渲染进程调用的全部 IPC 接口 */
export interface IpcApi {
  /* 通用 IPC 调用 */
  invoke: (channel: string, ...args: any[]) => Promise<any>
  /* 事件监听，返回清理函数 */
  on: (channel: string, callback: (...args: any[]) => void) => () => void
}
