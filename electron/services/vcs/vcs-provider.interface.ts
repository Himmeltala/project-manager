/** VCS 检测到的文件变更 */
export interface VcsFileChange {
  path: string
  type: string
  typeName: string
  rawLine: string
}

/** 更新结果 */
export interface VcsUpdateResult {
  status: 'ok' | 'conflict' | 'error'
  text?: string
}

/** VCS 信息 */
export interface VcsInfo {
  url?: string
  root?: string
  relativeUrl?: string
}

/** 批量检查结果（主进程通知用） */
export interface VcsCheckResult {
  projectName: string
  projectPath: string
  files: string[]
  count: number
  summary: string
  changeTypes?: string
}

/** VCS 提供者接口 -- 每种版本控制系统实现一个 */
export interface VcsProvider {
  /** 唯一标识，如 'svn' / 'git' */
  readonly name: string
  /** 显示名称，如 'SVN' / 'Git' */
  readonly label: string

  /** 检测路径是否受该 VCS 管理 */
  isProject(path: string): boolean

  /** 拉取远程更新 */
  update(path: string): Promise<VcsUpdateResult>

  /** 获取提交日志 */
  log(path: string, limit?: number): Promise<boolean>

  /** 读取仓库信息（URL 等） */
  getInfo(path: string): VcsInfo | null

  /** 检查远程变更 */
  checkRemote(projects: { name: string; path: string }[]): Promise<VcsCheckResult[]>

  /** 检查本地未提交变更 */
  checkLocal(projects: { name: string; path: string }[]): Promise<VcsCheckResult[]>

  /** 打开提交 GUI（如 TortoiseSVN / TortoiseGit），可选 */
  openCommitGui?(path: string): boolean

  /** 打开日志 GUI，可选 */
  openLogGui?(path: string): boolean
}
