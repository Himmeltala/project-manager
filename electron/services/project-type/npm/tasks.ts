/**
 * npm 任务列表（package.json scripts）
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { TaskInfo } from '@/types/project'

export function getTaskList(path: string): TaskInfo | null {
  const pkgPath = join(path, 'package.json')
  if (!existsSync(pkgPath)) {
    return { type: 'npm', tasks: {}, error: '未找到 package.json' }
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return { type: 'npm', tasks: pkg.scripts || {}, file: pkgPath }
  } catch (e: any) {
    return { type: 'npm', tasks: {}, error: e.message }
  }
}
