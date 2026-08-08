import type { CommandProfile, TaskInfo } from '@/types/project'

/** 可运行的子模块 */
export interface RunnableModule {
  name: string
  modulePath: string
  framework: 'spring-boot' | 'tomcat' | null
}

/** 项目类型提供者 -- 每种项目类型实现一个 */
export interface ProjectTypeProvider {
  /** 唯一标识，如 'npm' / 'maven' */
  readonly type: string
  /** 显示名称 */
  readonly label: string

  /** 检测路径是否为此类型 */
  detect(path: string): boolean

  /** 获取命令配置 */
  getProfile(): CommandProfile

  /** 解析启动命令（可能含动态检测逻辑） */
  resolveStartCommand(path?: string, module?: RunnableModule): string

  /** 检测多模块项目中可运行的子模块 */
  detectRunnableModules?(path: string): RunnableModule[]

  /** 读取产物名称 */
  readArtifactName?(path: string): string | null

  /** 获取任务列表 */
  getTaskList?(path: string): TaskInfo | null

  /** 获取右键菜单项列表（不返回表示无类型专属菜单） */
  getContextMenuItems?(path: string): import('@/types/project').ContextMenuItem[]

  /**
   * 获取项目的主配置文件路径
   * @param path 项目根目录
   * @returns 配置文件绝对路径，不存在返回 null
   */
  getConfigFilePath?(path: string): string | null
}
