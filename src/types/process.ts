/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\types\process.ts
 * @Description: 子进程与任务运行相关类型
 */

// Running status pushed by main process periodically
export interface RunningInfo {
  index: number
  name: string
  path: string
  port: number | null
  modulePath?: string
}

// Migration params (switch repo or copy directory)
export interface MigrationParams {
  mode: 'svn' | 'git' | 'copy'
  targetDir: string
  svnUrl: string
}
