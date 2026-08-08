/*
 * @Author: zhengrenfu
 * @Date: 2026-07-25
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-25
 * @FilePath: \electron\services\store.service.ts
 * @Description: 通用数据存储服务，每个 key 存储为 store/{key}.json
 */
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'fs'

export interface Store {
  dir: string
}

/**
 * 创建通用存储实例，确保 store 目录存在
 * @param dataDir 应用数据根目录
 * @returns Store 实例
 */
export function createStore(dataDir: string): Store {
  const dir = join(dataDir, 'store')
  mkdirSync(dir, { recursive: true })
  return { dir }
}

/** 路径分隔符和 parent 引用正则，防止路径穿越 */
const KEY_INVALID = /[/\\]|\.\./

/**
 * 校验 key 是否合法（不包含路径分隔符或 parent 引用）
 */
function validateKey(key: string): void {
  if (KEY_INVALID.test(key)) {
    throw new Error(`Store key 包含非法字符: ${key}`)
  }
}

/**
 * 读取指定 key 的存储值
 * @param store Store 实例
 * @param key 键名，作为文件名使用
 * @returns 存储的值，不存在返回 null
 */
export function storeGet(store: Store, key: string): any {
  validateKey(key)
  const filePath = join(store.dir, `${key}.json`)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 写入指定 key 的存储值
 * @param store Store 实例
 * @param key 键名，作为文件名使用
 * @param value 要存储的值
 */
export function storeSet(store: Store, key: string, value: any): void {
  validateKey(key)
  const filePath = join(store.dir, `${key}.json`)
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

/**
 * 删除指定 key 的存储文件
 * @param store Store 实例
 * @param key 键名
 */
export function storeDelete(store: Store, key: string): void {
  validateKey(key)
  const filePath = join(store.dir, `${key}.json`)
  if (existsSync(filePath)) unlinkSync(filePath)
}

/**
 * 列出所有已存储的 key
 * @param store Store 实例
 * @returns key 列表
 */
export function storeKeys(store: Store): string[] {
  try {
    return readdirSync(store.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
  } catch {
    return []
  }
}
