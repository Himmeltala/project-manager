/**
 * Maven 任务列表 — 动态检测可用命令
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { TaskInfo } from '@/types/project'

/** Maven 标准生命周期（始终可用） */
const LIFECYCLE_TASKS: Record<string, string> = {
  clean: '清理构建产物',
  compile: '编译项目',
  test: '运行测试',
  package: '打包',
  verify: '验证',
  install: '安装到本地仓库',
  site: '生成站点',
}

/** 常见插件 goal → 显示名 */
const KNOWN_PLUGINS: Record<string, string> = {
  'spring-boot:run': '运行 Spring Boot',
  'docker:build': '构建 Docker 镜像',
  'exec:java': '执行 Java 程序',
  'dependency:tree': '查看依赖树',
  'checkstyle:check': '代码风格检查',
  'jacoco:report': '生成覆盖率报告',
}

export function getTaskList(path: string): TaskInfo | null {
  const tasks: Record<string, string> = { ...LIFECYCLE_TASKS }

  // 从 pom.xml 检测可用的插件 goal
  const pomPath = join(path, 'pom.xml')
  if (existsSync(pomPath)) {
    try {
      const content = readFileSync(pomPath, 'utf-8')
      for (const [goal, label] of Object.entries(KNOWN_PLUGINS)) {
        const artifactId = goal.split(':')[0]
        if (content.includes(`${artifactId}-maven-plugin`)) {
          tasks[goal] = label
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { type: 'maven', tasks, taskListKey: null }
}
