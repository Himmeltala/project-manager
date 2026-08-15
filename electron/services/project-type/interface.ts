import type { CommandProfile, InstallFlagGroup, ProjectMenu, TaskInfo, Project, RunnableModule } from '@/types/project'

export type { RunnableModule } from '@/types/project'

/* 项目类型提供者 -- 每种项目类型实现一个，类型能力的单一事实来源 */
export interface ProjectTypeProvider {
  /* 唯一标识，如 'npm' / 'maven' */
  readonly type: string
  /* 显示名称 */
  readonly label: string
  /* 启动模式：直接启动 或 选择子模块后启动 */
  readonly startMode: 'direct' | 'module-select'
  /* 子模块启动命令模板，{module} 为模块路径 */
  readonly buildStartCommandTemplate: string
  /* 子模块路径分隔符，非空时模块路径中的反斜杠替换为该分隔符 */
  readonly modulePathSeparator: string
  /* 构建命令候选列表 */
  readonly buildCommands: string[]
  /* 安装依赖命令候选列表 */
  readonly installCommands: string[]
  /* 安装选项复选框组 */
  readonly installFlags: InstallFlagGroup[]
  /* 额外参数输入框的提示文本 */
  readonly installExtraPlaceholder: string
  /* 任务执行命令模板，{script} 为任务名 */
  readonly taskCommandTemplate: string
  /* 构建命令回退值 */
  readonly defaultBuildCommand: string
  /* 是否支持脚手架检测（build-tool） */
  readonly supportsBuildToolDetection: boolean
  /* 按目录名递归收集的构建产物目录（多模块场景），为空时按 profile.buildOutputDir 单点扫描 */
  readonly nestedBuildOutputDirs: string[]

  /* 检测路径是否为此类型 */
  detect(path: string): boolean

  /* 获取命令配置 */
  getProfile(): CommandProfile

  /* 解析启动命令（可能含动态检测逻辑） */
  resolveStartCommand(path?: string, module?: RunnableModule): string

  /* 检测多模块项目中可运行的子模块 */
  detectRunnableModules?(path: string): RunnableModule[]

  /* 读取产物名称 */
  readArtifactName?(path: string): string | null

  /* 获取任务列表 */
  getTaskList?(path: string): TaskInfo | null

  /* 类型专属右键菜单结构声明 */
  getMenu(): ProjectMenu

  /**
   * 为菜单项注入项目相关动态值，返回 null 表示该菜单项无动态值
   * @param id 菜单项标识
   * @param proj 项目对象
   */
  resolveMenuValue?(id: string, proj: Project): string | null

  /**
   * 获取项目的主配置文件路径
   * @param path 项目根目录
   * @returns 配置文件绝对路径，不存在返回 null
   */
  getConfigFilePath?(path: string): string | null
}
