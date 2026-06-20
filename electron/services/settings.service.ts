import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export class AppSettings {
  private path: string
  private schemaPath: string
  private data: Record<string, any> = {}

  constructor(settingsPath: string, schemaPath?: string) {
    this.path = settingsPath
    this.schemaPath = schemaPath || ''
    this.buildDefaults()
    this.load()
  }

  private buildDefaults(): void {
    this.data = { last_source: 'default' }
    if (!this.schemaPath || !existsSync(this.schemaPath)) return
    try {
      const schema = JSON.parse(readFileSync(this.schemaPath, 'utf-8'))
      for (const cat of schema) {
        for (const group of cat.groups || []) {
          for (const setting of group.settings || []) {
            if (setting.default !== undefined && setting.default !== null) {
              this.setNested(setting.key, setting.default)
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private setNested(key: string, value: any): void {
    const parts = key.split('.')
    let d = this.data
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in d) || typeof d[parts[i]] !== 'object') {
        d[parts[i]] = {}
      }
      d = d[parts[i]]
    }
    d[parts[parts.length - 1]] = value
  }

  private load(): void {
    if (!existsSync(this.path)) {
      this.save()
      return
    }
    try {
      const loaded = JSON.parse(readFileSync(this.path, 'utf-8'))
      Object.assign(this.data, loaded)
    } catch {
      // ignore
    }
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  get(key: string, defaultVal?: any): any {
    const parts = key.split('.')
    let d: any = this.data
    for (const part of parts) {
      if (d && typeof d === 'object' && part in d) {
        d = d[part]
      } else {
        return defaultVal
      }
    }
    return d
  }

  set(key: string, value: any): void {
    this.setNested(key, value)
    this.save()
  }

  get protectedPorts(): Set<number> {
    const raw = this.data.protected_ports || ''
    if (!raw || !raw.toString().trim()) return new Set()
    return new Set(
      raw
        .toString()
        .split(',')
        .map((s: string) => parseInt(s.trim(), 10))
        .filter((n: number) => !isNaN(n)),
    )
  }

  set protectedPorts(value: Set<number> | string) {
    if (value instanceof Set) {
      this.data.protected_ports = Array.from(value)
        .sort((a, b) => a - b)
        .join(',')
    } else {
      this.data.protected_ports = value
    }
    this.save()
  }

  get lastSource(): string {
    return this.data.last_source || 'default'
  }

  set lastSource(name: string) {
    this.data.last_source = name
    this.save()
  }

  get theme(): string {
    return this.data.theme || 'dark'
  }

  set theme(value: string) {
    this.data.theme = value
    this.save()
  }
}
