/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-20
 * @FilePath: \electron\services\project-repository.service.ts
 * @Description: 项目配置持久化服务
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, promises as fs } from 'fs'
import { join, dirname, resolve, basename } from 'path'
import type { Project } from '@/types/project'
import { MARKER_FILES } from '@electron/services/tool-discovery.service'
import { projectTypeRegistry } from '@electron/services/project-type/registry'

const SCAN_IGNORE =
  /(node_modules|\.git|dist|build|\.idea|\.vscode|__pycache__|\.cache|coverage|\.next|\.nuxt|\.output|\.vercel|\.serverless|\.serverless_nextjs|\.pnpm-store|\.tmp|\.temp|\.swp|\.DS_Store|Thumbs\.db|target)/i

export class ProjectRepository {
  static load(configPath: string): Project[] {
    if (!existsSync(configPath)) {
      mkdirSync(dirname(configPath), { recursive: true })
      this.save(configPath, [])
      return []
    }
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
      return raw.map((item: any) => ({
        name: item.name,
        path: item.path,
        projectType: item.type || projectTypeRegistry.detect(item.path).type,
        javaHome: item.java_home || '',
        mavenHome: item.maven_home || '',
        tomcatHome: item.tomcat_home || '',
        tomcatWarName: item.tomcat_war_name || '',
      }))
    } catch {
      return []
    }
  }

  static save(configPath: string, projects: Project[]): void {
    const data = projects.map((p) => ({
      name: p.name,
      path: p.path,
      type: p.projectType,
      java_home: p.javaHome,
      maven_home: p.mavenHome,
      tomcat_home: p.tomcatHome,
      tomcat_war_name: p.tomcatWarName,
    }))
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
  }

  static async discover(rootDir: string): Promise<Project[]> {
    const discovered: Project[] = []
    const absolute = resolve(rootDir)
    if (!existsSync(absolute)) return []

    const walk = async (dir: string) => {
      let entries: { name: string; isDirectory: () => boolean }[]
      try {
        entries = (await fs.readdir(dir, { withFileTypes: true })) as any
      } catch {
        return
      }

      const dirs: string[] = []
      const files: string[] = []
      for (const e of entries) {
        if (SCAN_IGNORE.test(e.name)) continue
        if (e.isDirectory()) {
          dirs.push(e.name)
        } else {
          files.push(e.name)
        }
      }

      for (const fn of files) {
        if (MARKER_FILES.has(fn.toLowerCase())) {
          discovered.push({
            name: basename(dir),
            path: dir,
            projectType: projectTypeRegistry.detect(dir).type,
            javaHome: '',
            mavenHome: '',
            tomcatHome: '',
            tomcatWarName: '',
          })
          return
        }
      }

      for (const d of dirs) {
        await walk(join(dir, d))
      }
    }

    await walk(absolute)
    return discovered
  }
}
