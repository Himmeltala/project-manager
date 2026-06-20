import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
  rmdirSync,
} from 'fs'
import { join, dirname, basename } from 'path'
import { execSync } from 'child_process'

export const TEMPLATE_FILES = new Set(['about.md'])
export const FORCE_SYNC_FILES = new Set(['settings_schema.json'])

export function getAppVersion(configPath: string): string {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function getSourceRoot(): string {
  // In Electron, the app root is __dirname (dist-electron) -> go up once
  const path = require('path')
  return path.resolve(__dirname, '..')
}

export function getDataDir(appName: string): string {
  const base = process.env.APPDATA || require('os').homedir()
  return join(base, appName)
}

export function getAssetDir(appName: string): string {
  return join(getDataDir(appName), 'assets')
}

export function ensureDataDir(appName: string, sourceRoot: string): string {
  const dataDir = getDataDir(appName)
  const assetDir = getAssetDir(appName)
  mkdirSync(assetDir, { recursive: true })

  const sourceAssetDir = join(sourceRoot, 'assets')
  if (existsSync(sourceAssetDir)) {
    syncTemplates(sourceAssetDir, assetDir, dataDir, appName, sourceRoot)
  }

  return dataDir
}

function syncTemplates(
  sourceAssetDir: string,
  targetAssetDir: string,
  dataDir: string,
  appName: string,
  sourceRoot: string,
): void {
  const version = getAppVersion(join(sourceRoot, 'config.json'))
  const verFile = join(dataDir, '.version')
  let oldVersion: string | null = null
  if (existsSync(verFile)) {
    oldVersion = readFileSync(verFile, 'utf-8').trim()
  }
  const isUpgrade = oldVersion !== null && oldVersion !== version

  try {
    for (const name of readdirSync(sourceAssetDir)) {
      const src = join(sourceAssetDir, name)
      const dst = join(targetAssetDir, name)
      const s = statSync(src)
      if (!s.isFile()) continue

      if (!existsSync(dst)) {
        writeFileSync(dst, readFileSync(src))
      } else if (FORCE_SYNC_FILES.has(name)) {
        writeFileSync(dst, readFileSync(src))
      } else if (isUpgrade && TEMPLATE_FILES.has(name)) {
        writeFileSync(dst, readFileSync(src))
      }
    }
  } catch {
    // ignore
  }

  writeFileSync(verFile, version, 'utf-8')
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function getDirSize(dirPath: string): number {
  let total = 0
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isFile()) {
        try {
          total += statSync(fullPath).size
        } catch {
          // ignore
        }
      } else if (entry.isDirectory()) {
        total += getDirSize(fullPath)
      }
    }
  } catch {
    // ignore
  }
  return total
}

export interface DataDirItem {
  name: string
  path: string
  isDir: boolean
  size: number
  sizeStr: string
  category: string
}

function classifyFile(name: string, isDir: boolean): string {
  if (name.startsWith('.')) return '配置'
  if (name === 'assets') return 'assets'
  if (name.endsWith('.log')) return '日志'
  if (name.endsWith('.json')) return '配置'
  if (['__pycache__', '.cache', 'temp', 'tmp', 'cache'].includes(name)) return '缓存'
  if (['build', 'dist', '.next', '.nuxt', 'node_modules', 'target', 'out', '.turbo', 'coverage'].includes(name))
    return '缓存'
  return '其他'
}

export function scanDataDir(appName: string): { items: DataDirItem[]; dataDir: string; totalSize: number } {
  const dataDir = getDataDir(appName)
  if (!existsSync(dataDir)) return { items: [], dataDir, totalSize: 0 }

  const items: DataDirItem[] = []
  let totalSize = 0

  try {
    for (const entry of readdirSync(dataDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = join(dataDir, entry.name)
      const isDir = entry.isDirectory()
      let size = 0
      if (isDir) {
        size = getDirSize(fullPath)
      } else {
        try {
          size = statSync(fullPath).size
        } catch {
          // ignore
        }
      }
      totalSize += size
      items.push({
        name: entry.name,
        path: fullPath,
        isDir,
        size,
        sizeStr: formatSize(size),
        category: classifyFile(entry.name, isDir),
      })
    }
  } catch {
    // ignore
  }

  return { items, dataDir, totalSize }
}

export function deleteItem(itemPath: string): boolean {
  try {
    const s = statSync(itemPath)
    if (s.isDirectory()) {
      execSync(`rmdir /s /q "${itemPath}"`, { windowsHide: true })
    } else {
      unlinkSync(itemPath)
    }
    return true
  } catch {
    return false
  }
}
