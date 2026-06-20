import type { CommandProfile, TaskInfo } from '../../../src/types/project'

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
  resolveStartCommand(path?: string): string

  /** 读取产物名称 */
  readArtifactName?(path: string): string | null

  /** 获取任务列表 */
  getTaskList?(path: string): TaskInfo | null
}
