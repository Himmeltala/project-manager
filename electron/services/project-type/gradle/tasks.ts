/**
 * Gradle 任务列表 — 动态检测可用命令
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { TaskInfo } from '@/types/project'

/** Gradle 标准任务（始终可用） */
const STANDARD_TASKS: Record<string, string> = {
  clean: '清理构建产物',
  build: '构建项目',
  test: '运行测试',
  assemble: '打包',
  check: '验证',
  javadoc: '生成 JavaDoc',
}

/** 常见插件 task → 显示名 */
const KNOWN_PLUGINS: Record<string, string> = {
  bootRun: '运行 Spring Boot',
  dockerBuild: '构建 Docker 镜像',
  quarkusDev: '运行 Quarkus Dev',
  dependencyUpdates: '检查依赖更新',
}

export function getTaskList(path: string): TaskInfo | null {
  const tasks: Record<string, string> = { ...STANDARD_TASKS }

  const buildFiles = ['build.gradle', 'build.gradle.kts']
  for (const bf of buildFiles) {
    const gp = join(path, bf)
    if (existsSync(gp)) {
      try {
        const content = readFileSync(gp, 'utf-8')
        for (const [task, label] of Object.entries(KNOWN_PLUGINS)) {
          if (content.includes(task) || content.includes(`'${task}'`)) {
            tasks[task] = label
          }
        }
      } catch {
        /* ignore */
      }
      break
    }
  }

  return { type: 'gradle', tasks, taskListKey: null }
}
