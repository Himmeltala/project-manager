import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { EventEmitter } from 'events'
import type { ProjectSource } from '../../src/types/project'
import { ProjectRepository } from './project.service'

export class SourceManager extends EventEmitter {
  private sourcesPath: string
  private sources: Map<string, ProjectSource> = new Map()
  private active: string = 'default'

  constructor(sourcesPath: string) {
    super()
    this.sourcesPath = sourcesPath
    this.load()
  }

  private load(): void {
    if (existsSync(this.sourcesPath)) {
      try {
        const data = JSON.parse(readFileSync(this.sourcesPath, 'utf-8'))
        for (const s of data.sources || []) {
          // 兼容旧版 snake_case 字段名
          const normalized: ProjectSource = {
            name: s.name,
            configPath: s.configPath || s.config_path || '',
            type: s.type || 'file',
          }
          if (s.rootDir) normalized.rootDir = s.rootDir
          if (s.isActive !== undefined) normalized.isActive = s.isActive
          this.sources.set(s.name, normalized)
        }
        this.active = data.active || ''
        if (!this.sources.has(this.active) && this.sources.size > 0) {
          this.active = this.sources.keys().next().value
        }
        return
      } catch {
        // ignore
      }
    }
  }

  save(): void {
    mkdirSync(dirname(this.sourcesPath), { recursive: true })
    const data = {
      active: this.active,
      sources: Array.from(this.sources.values()),
    }
    writeFileSync(this.sourcesPath, JSON.stringify(data, null, 2), 'utf-8')
  }

  getActiveSourceName(): string {
    return this.active
  }

  getActiveConfigPath(): string {
    return this.sources.get(this.active)?.configPath || ''
  }

  getActiveSource(): ProjectSource {
    const src = this.sources.get(this.active)
    return src ? { ...src, isActive: true } : { name: '', configPath: '', type: 'file', isActive: true }
  }

  listSources(includeCounts = false): ProjectSource[] {
    return Array.from(this.sources.values()).map((s) => {
      let count = 0
      if (includeCounts && existsSync(s.configPath)) {
        try {
          count = JSON.parse(readFileSync(s.configPath, 'utf-8')).length
        } catch {
          // ignore
        }
      }
      return { ...s, isActive: s.name === this.active, projectCount: count }
    })
  }

  getSource(name: string): ProjectSource | undefined {
    const s = this.sources.get(name)
    return s ? { ...s } : undefined
  }

  addSource(name: string, configPath: string, sourceType: string = 'file', extra?: Record<string, string>): boolean {
    if (this.sources.has(name)) return false
    const entry: ProjectSource = { name, configPath, type: sourceType, ...extra }
    this.sources.set(name, entry)
    this.save()
    return true
  }

  renameSource(oldName: string, newName: string): boolean {
    if (!this.sources.has(oldName) || this.sources.has(newName)) return false
    const entry = this.sources.get(oldName)!
    this.sources.delete(oldName)
    entry.name = newName
    this.sources.set(newName, entry)
    if (this.active === oldName) this.active = newName
    this.save()
    return true
  }

  removeSource(name: string): boolean {
    if (!this.sources.has(name) || this.sources.size <= 1) return false
    this.sources.delete(name)
    if (this.active === name) {
      this.active = this.sources.keys().next().value
    }
    this.save()
    return true
  }

  switchSource(name: string): boolean {
    if (!this.sources.has(name)) return false
    if (name === this.active) return true
    this.active = name
    this.save()
    const info = this.sources.get(name)!
    this.emit('sourceChanged', { name, configPath: info.configPath })
    return true
  }

  async createSourceFromDirectory(name: string, directory: string): Promise<boolean> {
    const absDir = require('path').resolve(directory)
    if (!existsSync(absDir) || this.sources.has(name)) return false

    const discovered = await ProjectRepository.discover(absDir)
    if (discovered.length === 0) return false

    const safeName = name.replace(/[ /\\]/g, '_')
    const outputPath = join(dirname(this.sourcesPath), `projects_${safeName}.json`)

    ProjectRepository.save(outputPath, discovered)

    this.sources.set(name, {
      name,
      configPath: outputPath,
      type: 'directory',
      rootDir: absDir,
    })
    this.save()
    return true
  }

  async refreshCurrentSource(): Promise<boolean> {
    const source = this.sources.get(this.active)
    if (!source || source.type !== 'directory' || !source.rootDir || !existsSync(source.rootDir)) {
      return false
    }

    const discovered = await ProjectRepository.discover(source.rootDir)
    ProjectRepository.save(source.configPath, discovered)
    return true
  }
}
