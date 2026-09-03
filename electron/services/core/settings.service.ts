/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \electron\services\settings.service.ts
 * @Description: 应用设置管理服务
 */
// #region Imports
// #region Imports
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

// #endregion

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

  /**
   * 深度合并源对象到目标对象，仅普通对象递归合并，数组与标量整体替换
   * 防止文件中的对象组（如历史遗留 terminal 组）覆盖同组其余默认键
   * @param target 目标对象，合并结果写入此对象
   * @param source 源对象，其值覆盖目标对象的同名字段
   * @returns 合并后的目标对象
   */
  private deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key]
      const targetValue = target[key]
      // 双方都是普通对象时逐键深入，否则整体替换
      if (this.isPlainObject(sourceValue) && this.isPlainObject(targetValue)) {
        target[key] = this.deepMerge(targetValue, sourceValue)
      } else {
        target[key] = sourceValue
      }
    }
    return target
  }

  /**
   * 判断值是否为可递归合并的普通对象，数组与 null 不参与递归
   * @param value 待判断的值
   * @returns 是否为普通对象
   */
  private isPlainObject(value: any): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }

  private load(): void {
    if (!existsSync(this.path)) {
      this.save()
      return
    }
    try {
      const loaded = JSON.parse(readFileSync(this.path, 'utf-8'))
      // 以深度合并代替浅合并，schema 默认值打底、文件值逐键覆盖
      this.deepMerge(this.data, loaded)
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

  /**
   * 获取设置字段定义（settings_schema.json 内容）
   */
  getSchema(): any[] {
    if (!this.schemaPath || !existsSync(this.schemaPath)) return []
    try {
      return JSON.parse(readFileSync(this.schemaPath, 'utf-8'))
    } catch {
      return []
    }
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

// #endregion
