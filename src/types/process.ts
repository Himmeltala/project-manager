/** 子进程句柄（PID、端口等） */
export interface ProcessHandle {
  pid: number
  name: string
  path: string
  port: number | null
  command?: string
}

/** 项目运行状态，主进程定期推送 */
export interface RunningInfo {
  index: number
  name: string
  path: string
  port: number | null
}

/** 项目关联的脚本任务 */
export interface ScriptTask {
  command: string
  handle?: ProcessHandle
}

/** 项目迁移参数（换仓库或复制目录） */
export interface MigrationParams {
  mode: 'svn' | 'git' | 'copy'
  targetDir: string
  svnUrl: string
}
