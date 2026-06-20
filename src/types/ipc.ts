import type { Project, ProjectSource, BuildArtifact, DependencyDir, TaskInfo } from './project'
import type { RunningInfo, ScriptTask, MigrationParams } from './process'
import type { NotificationItem } from './notification'

/** 范围更新/检查的起始结束序号 */
export interface VcsRangeParams {
  startIdx: number
  endIdx: number
}

/** VCS 检查结果（远程变更或本地未提交文件） */
export interface VcsCheckResult {
  projectName: string
  projectPath: string
  files: string[]
  count: number
  summary: string
  changeTypes?: string
}

/** 更新信息 */
export interface UpdateInfo {
  url: string
  filename: string
}

/** 代理配置中的单条代理条目 */
export interface ProxyEntry {
  path: string
  targets: ProxyTarget[]
  activeTarget: ProxyTarget | null
  entryStart: number
  entryEnd: number
  isCommented: boolean
}

/** 代理条目下的目标地址 */
export interface ProxyTarget {
  lineIndex: number
  isActive: boolean
  url: string
  comment: string
  rawLine: string
  commentType: string
}

/** 代理配置解析结果 */
export interface ProxyConfigResult {
  configPath: string
  projectType: string
  proxies: ProxyEntry[]
}

/** 数据目录扫描结果项 */
export interface DataDirItem {
  name: string
  path: string
  isDir: boolean
  size: number
  sizeStr: string
  category: string
}

/** 设置分类（对应 settings_schema.json 结构） */
export interface SettingsSchema {
  key: string
  label: string
  groups: SettingsGroup[]
}

/** 设置分组（一组相关设置项） */
export interface SettingsGroup {
  label: string
  settings: SettingsField[]
}

/** 单个设置字段定义 */
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

/** 渲染进程调用的全部 IPC 接口 */
export interface IpcApi {
  /**
   * 加载项目列表
   * @param configPath 配置文件的路径
   * @returns 项目数组
   */
  loadProjects: (configPath: string) => Promise<Project[]>

  /**
   * 保存项目列表
   * @param configPath 配置文件的路径
   * @param projects 项目列表
   */
  saveProjects: (configPath: string, projects: Project[]) => Promise<void>

  /**
   * 扫描目录发现项目
   * @param rootDir 根目录
   * @returns 发现的项目列表
   */
  discoverProjects: (rootDir: string) => Promise<Project[]>

  /**
   * 获取当前项目源的配置路径
   * @returns 配置文件路径
   */
  getDefaultConfigPath: () => Promise<string>

  /**
   * 列出所有项目源
   * @param includeCounts 是否包含项目数量
   * @returns 项目源列表
   */
  listSources: (includeCounts?: boolean) => Promise<ProjectSource[]>

  /**
   * 获取当前项目源名称
   * @returns 源名称
   */
  getActiveSource: () => Promise<string>

  /**
   * 获取当前项目源完整信息
   * @returns 项目源信息
   */
  getActiveSourceInfo: () => Promise<ProjectSource>

  /**
   * 切换项目源
   * @param name 源名称
   * @returns 是否切换成功
   */
  switchSource: (name: string) => Promise<boolean>

  /**
   * 添加项目源
   * @param name 源名称
   * @param configPath 配置路径
   * @param sourceType 源类型
   * @param extra 额外参数
   * @returns 是否添加成功
   */
  addSource: (name: string, configPath: string, sourceType: string, extra?: Record<string, string>) => Promise<boolean>

  /**
   * 重命名项目源
   * @param oldName 旧名称
   * @param newName 新名称
   * @returns 是否重命名成功
   */
  renameSource: (oldName: string, newName: string) => Promise<boolean>

  /**
   * 删除项目源
   * @param name 源名称
   * @returns 是否删除成功
   */
  removeSource: (name: string) => Promise<boolean>

  /**
   * 从目录创建项目源
   * @param name 源名称
   * @param directory 目录路径
   * @returns 是否创建成功
   */
  createSourceFromDirectory: (name: string, directory: string) => Promise<boolean>

  /**
   * 刷新当前项目源
   * @returns 是否刷新成功
   */
  refreshCurrentSource: () => Promise<boolean>

  /**
   * 启动项目
   * @param idx 项目序号
   * @param command 启动命令（可选）
   * @returns 是否启动成功
   */
  startProject: (idx: number, command?: string) => Promise<boolean>

  /**
   * 停止项目
   * @param idx 项目序号
   * @returns 是否停止成功
   */
  stopProject: (idx: number) => Promise<boolean>

  /**
   * 停止指定的脚本
   * @param idx 项目序号
   * @param command 脚本命令
   * @returns 是否停止成功
   */
  stopScript: (idx: number, command: string) => Promise<boolean>

  /**
   * 检查项目是否在运行
   * @param idx 项目序号
   * @returns 是否运行中
   */
  isRunning: (idx: number) => Promise<boolean>

  /**
   * 获取所有项目的运行状态
   * @returns 运行信息列表
   */
  getRunningInfo: () => Promise<RunningInfo[]>

  /**
   * 获取所有运行中的项目路径映射
   * @returns 路径到序号的映射
   */
  getAllRunningPaths: () => Promise<Record<string, number | null>>

  /**
   * 获取总的脚本任务数量
   * @returns 任务数量
   */
  getTotalScriptsCount: () => Promise<number>

  /**
   * 获取项目正在运行的脚本列表
   * @param idx 项目序号
   * @returns 脚本任务列表
   */
  getRunningScripts: (idx: number) => Promise<ScriptTask[]>

  /**
   * 根据路径获取正在运行的脚本
   * @param path 项目路径
   * @returns 脚本命令列表
   */
  getRunningScriptsByPath: (path: string) => Promise<string[]>

  /**
   * 终止占用端口的进程
   * @param port 端口号
   * @returns 是否终止成功
   */
  killPort: (port: number) => Promise<boolean>

  /** 停止所有项目 */
  stopAll: () => Promise<void>

  /**
   * 解析目标标识
   * @param target 目标字符串
   * @returns 解析结果 [序号, 名称, 路径] 或 null
   */
  resolveTarget: (target: string) => Promise<[number, string, string] | null>

  /**
   * 按序号获取项目信息
   * @param configPath 配置路径
   * @param idx 项目序号
   * @returns 项目信息
   */
  getProjectByIndex: (configPath: string, idx: number) => Promise<Project | null>

  /**
   * 从列表移除项目（不删文件）
   * @param configPath 配置路径
   * @param idx 项目序号
   * @returns 是否移除成功
   */
  removeProject: (configPath: string, idx: number) => Promise<boolean>

  /**
   * 物理删除项目和目录
   * @param configPath 配置路径
   * @param idx 项目序号
   * @returns 是否删除成功
   */
  deleteProject: (configPath: string, idx: number) => Promise<boolean>

  /**
   * 重命名项目
   * @param configPath 配置路径
   * @param idx 项目序号
   * @param newName 新名称
   * @returns 是否重命名成功
   */
  renameProject: (configPath: string, idx: number, newName: string) => Promise<boolean>

  /**
   * 刷新项目列表
   * @param configPath 配置路径
   * @returns 刷新后的项目列表
   */
  refreshProjects: (configPath: string) => Promise<Project[]>

  /**
   * 在系统文件管理器中打开目录
   * @param path 目录路径
   * @returns 是否打开成功
   */
  openFolder: (path: string) => Promise<boolean>

  /**
   * 构建项目
   * @param idx 项目序号
   * @param command 构建命令
   * @param zipName 打包名
   */
  buildProject: (idx: number, command?: string, zipName?: string) => Promise<void>

  /**
   * 扫描构建产物（jar/war/dist 等）
   * @param idx 项目序号
   * @returns 构建产物列表
   */
  scanBuildArtifacts: (idx: number) => Promise<BuildArtifact[]>

  /**
   * 清理构建产物
   * @param idx 项目序号
   * @param paths 要清理的路径列表
   * @returns 清理的文件数量
   */
  cleanArtifacts: (idx: number, paths: string[]) => Promise<number>

  /**
   * 获取依赖目录（node_modules / .m2 等）
   * @param idx 项目序号
   * @returns 依赖目录列表
   */
  getDependencyDirs: (idx: number) => Promise<DependencyDir[]>

  /**
   * 清理依赖目录
   * @param idx 项目序号
   * @returns 是否清理成功
   */
  cleanDependencies: (idx: number) => Promise<boolean>

  /**
   * 获取项目可用任务列表
   * @param idx 项目序号
   * @returns 任务信息
   */
  getTaskList: (idx: number) => Promise<TaskInfo | null>

  /**
   * 执行脚本命令
   * @param idx 项目序号
   * @param command 脚本命令
   * @returns 是否执行成功
   */
  runScript: (idx: number, command: string) => Promise<boolean>

  /**
   * 执行项目任务
   * @param idx 项目序号
   * @param command 任务命令
   * @returns 是否执行成功
   */
  runTask: (idx: number, command: string) => Promise<boolean>

  /**
   * VCS 更新单个项目
   * @param idx 项目序号
   * @returns 更新结果：ok 成功 / conflict 冲突 / error 失败
   */
  vcsUpdate: (idx: number) => Promise<'ok' | 'conflict' | 'error'>

  /**
   * 范围 VCS 更新
   * @param params 起始结束序号
   * @returns 各结果的数量
   */
  vcsUpdateRange: (params: VcsRangeParams) => Promise<{ ok: number; conflicts: number; errors: number }>

  /**
   * 查看 VCS 日志
   * @param idx 项目序号
   * @param limit 日志条数限制
   * @returns 操作结果
   */
  vcsLog: (idx: number, limit?: number) => Promise<'ok' | 'error'>

  /**
   * 打开 VCS 日志 GUI
   * @param idx 项目序号
   * @returns 是否打开成功
   */
  vcsOpenLogGui: (idx: number) => Promise<boolean>

  /**
   * 打开 VCS 提交 GUI
   * @param idx 项目序号
   * @returns 是否打开成功
   */
  vcsOpenCommitGui: (idx: number) => Promise<boolean>

  /**
   * 检查远程是否有更新
   * @param projects 项目列表
   * @returns 有更新的项目列表
   */
  vcsCheckRemote: (projects: { name: string; path: string }[]) => Promise<VcsCheckResult[]>

  /**
   * 检查本地是否有未提交变更
   * @param projects 项目列表
   * @returns 有本地变更的项目列表
   */
  vcsCheckLocal: (projects: { name: string; path: string }[]) => Promise<VcsCheckResult[]>

  /**
   * 获取 VCS 信息
   * @param idx 项目序号
   * @returns VCS 信息
   */
  vcsGetInfo: (idx: number) => Promise<{ url?: string; root?: string; relativeUrl?: string } | null>

  /**
   * 统计范围内 VCS 项目数量
   * @param projects 项目列表
   * @returns VCS 项目数
   */
  vcsCount: (projects: { name: string; path: string }[]) => Promise<number>

  /**
   * 迁移项目（换仓库或复制）
   * @param idx 项目序号
   * @param params 迁移参数
   * @returns 是否迁移成功
   */
  vcsMigrate: (idx: number, params: MigrationParams) => Promise<boolean>

  /**
   * 检测项目的 VCS 类型
   * @param projectPath 项目路径
   * @returns VCS 信息或 null
   */
  detectVcs: (projectPath: string) => Promise<{ name: string; label: string } | null>

  /**
   * 批量检测 VCS 类型
   * @param projectPaths 项目路径列表
   * @returns VCS 信息列表
   */
  detectVcsBatch: (projectPaths: string[]) => Promise<({ name: string; label: string } | null)[]>

  /**
   * 自动检测代理配置文件（nginx/apache）
   * @param projectPath 项目路径
   * @returns 代理配置或 null
   */
  detectConfigFile: (projectPath: string) => Promise<ProxyConfigResult | null>

  /**
   * 解析代理配置文件
   * @param configPath 配置文件路径
   * @returns 解析结果
   */
  parseProxyConfig: (configPath: string) => Promise<{ lines: string[]; proxies: ProxyEntry[] }>

  /**
   * 修改代理目标地址
   * @param configPath 配置路径
   * @param proxyPath 代理路径
   * @param newUrl 新地址
   * @returns 是否修改成功
   */
  updateProxyTarget: (configPath: string, proxyPath: string, newUrl: string) => Promise<boolean>

  /**
   * 批量修改代理目标地址
   * @param configPath 配置路径
   * @param changes URL 变更映射
   * @returns 失败的路径列表
   */
  batchUpdateProxyTargets: (configPath: string, changes: Record<string, string>) => Promise<string[]>

  /**
   * 获取设置值
   * @param key 设置键名
   * @returns 设置值
   */
  getSetting: (key: string) => Promise<any>

  /**
   * 写入设置值
   * @param key 设置键名
   * @param value 设置值
   */
  setSetting: (key: string, value: any) => Promise<void>

  /**
   * 获取设置字段定义
   * @returns 设置分组列表
   */
  getSettingsSchema: () => Promise<SettingsGroup[]>

  /**
   * 获取设置文件路径
   * @returns 路径字符串
   */
  getSettingsPath: () => Promise<string>

  /**
   * 检查是否有可用更新
   * @returns 更新信息或 null
   */
  checkUpdate: () => Promise<UpdateInfo | null>

  /**
   * 下载更新包
   * @param url 下载地址
   * @param filename 文件名
   * @returns 下载后的文件路径
   */
  downloadUpdate: (url: string, filename: string) => Promise<string>

  /**
   * 安装更新包
   * @param filePath 文件路径
   */
  installUpdate: (filePath: string) => Promise<void>

  /**
   * 获取进行中的任务
   * @returns 任务列表
   */
  getActiveTasks: () => Promise<any[]>

  /**
   * 获取所有历史任务
   * @returns 任务列表
   */
  getAllTasks: () => Promise<any[]>

  /**
   * 获取单个任务
   * @param taskId 任务 ID
   * @returns 任务信息
   */
  getTask: (taskId: string) => Promise<any>

  /**
   * 取消任务
   * @param taskId 任务 ID
   * @returns 是否取消成功
   */
  cancelTask: (taskId: string) => Promise<boolean>

  /**
   * 获取全部通知
   * @returns 通知列表
   */
  getNotifications: () => Promise<NotificationItem[]>

  /**
   * 获取未读通知数量
   * @returns 未读数量
   */
  getUnreadCount: () => Promise<number>

  /**
   * 创建通知
   * @param type 通知类型
   * @param title 标题
   * @param message 内容
   * @param projectName 关联项目名
   * @returns 通知 ID 或 null
   */
  createNotification: (type: string, title: string, message: string, projectName?: string) => Promise<string | null>

  /**
   * 标记已读
   * @param id 通知 ID
   * @returns 是否标记成功
   */
  markRead: (id: string) => Promise<boolean>

  /** 全部标记已读 */
  markAllRead: () => Promise<void>

  /** 清空所有通知 */
  clearAllNotifications: () => Promise<void>

  /**
   * 启动远程 VCS 定时检查
   * @param intervalMinutes 间隔分钟
   */
  startRemoteCheck: (intervalMinutes: number) => Promise<void>

  /**
   * 启动本地 VCS 定时检查
   * @param intervalMinutes 间隔分钟
   */
  startLocalCheck: (intervalMinutes: number) => Promise<void>

  /** 停止 VCS 定时检查 */
  stopVcsChecks: () => Promise<void>

  /**
   * 获取应用版本号
   * @returns 版本字符串
   */
  getVersion: () => Promise<string>

  /**
   * 获取数据目录路径
   * @returns 目录路径
   */
  getDataDir: () => Promise<string>

  /**
   * 获取应用资源根目录（开发=项目根，打包=resources）
   * @returns 目录路径
   */
  getSourceRoot: () => Promise<string>

  /**
   * 扫描数据目录
   * @returns 扫描结果
   */
  scanDataDir: () => Promise<{ items: DataDirItem[]; dataDir: string; totalSize: number }>

  /**
   * 删除数据目录下的项
   * @param itemPath 项路径
   * @returns 是否删除成功
   */
  deleteDataDirItem: (itemPath: string) => Promise<boolean>

  /**
   * 获取已安装的 JDK 列表
   * @returns JDK 列表
   */
  getJavaHomes: () => Promise<{ label: string; path: string }[]>

  /**
   * 获取已安装的 Maven 列表
   * @returns Maven 列表
   */
  getMavenHomes: () => Promise<{ label: string; path: string }[]>

  /**
   * 获取已安装的 Tomcat 列表
   * @returns Tomcat 列表
   */
  getTomcatHomes: () => Promise<{ label: string; path: string }[]>

  /**
   * 读取 maven 打包后的 war/jar 文件名
   * @param projectPath 项目路径
   * @returns 文件名或 null
   */
  readPomFinalName: (projectPath: string) => Promise<string | null>

  /**
   * 读取 markdown 文件内容
   * @param fileName 文件名
   * @returns 文件内容或 null
   */
  readMarkdown: (fileName: string) => Promise<string | null>

  /**
   * 监听子进程输出行
   * @param callback 收到 { index, name, line } 时的回调
   */
  onOutputLine: (callback: (data: { index: number; name: string; line: string }) => void) => void

  /**
   * 监听任务开始
   * @param callback 收到 { taskId, name } 时的回调
   */
  onTaskStarted: (callback: (data: { taskId: string; name: string }) => void) => void

  /**
   * 监听任务进度
   * @param callback 收到 { taskId, name, progress, message } 时的回调
   */
  onTaskProgress: (
    callback: (data: { taskId: string; name: string; progress: number; message: string }) => void,
  ) => void

  /**
   * 监听任务完成
   * @param callback 收到 { taskId, name } 时的回调
   */
  onTaskCompleted: (callback: (data: { taskId: string; name: string }) => void) => void

  /**
   * 监听任务失败
   * @param callback 收到 { taskId, name, error } 时的回调
   */
  onTaskFailed: (callback: (data: { taskId: string; name: string; error: string }) => void) => void

  /**
   * 监听新通知创建
   * @param callback 收到通知数据时的回调
   */
  onNotificationCreated: (
    callback: (data: { id: string; type: string; title: string; projectName: string; timestamp: number }) => void,
  ) => void

  /** 监听通知清空 */
  onNotificationsCleared: (callback: () => void) => void

  /**
   * 监听项目启动
   * @param callback 收到 { index, name } 时的回调
   */
  onProjectStarted: (callback: (data: { index: number; name: string }) => void) => void

  /**
   * 监听项目停止
   * @param callback 收到 { index, name } 时的回调
   */
  onProjectStopped: (callback: (data: { index: number; name: string }) => void) => void

  /**
   * 监听端口检测
   * @param callback 收到 { index, port } 时的回调
   */
  onPortDetected: (callback: (data: { index: number; port: number }) => void) => void

  /**
   * 监听主题切换（菜单栏切换时触发）
   * @param callback 收到新主题名称时的回调
   */
  onThemeChanged: (callback: (data: string) => void) => void

  /**
   * 监听原生菜单点击
   * @param callback 收到 { action } 时的回调
   */
  onMenuEvent: (callback: (data: { action: string }) => void) => void

  /**
   * 选择目录对话框
   * @param defaultPath 默认路径
   * @returns 选中路径或 null
   */
  selectDirectory: (defaultPath?: string) => Promise<string | null>

  /**
   * 写入日志面板
   * @param type 日志类型（info / warning / success / error）
   * @param text 内容
   */
  logOutput: (type: string, text: string) => Promise<void>

  /**
   * 监听日志面板新行推送
   * @param callback 收到 { type, text } 时的回调
   */
  onOutput: (callback: (data: { type: string; text: string }) => void) => void
}
