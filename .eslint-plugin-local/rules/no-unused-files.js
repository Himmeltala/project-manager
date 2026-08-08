/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/rules/no-unused-files.js
 * @Description: 检测未被其他文件引用的文件
 */

import path from 'path'
import fs from 'fs'

const ROOT = process.cwd()

let scanDone = false
const importRefs = new Set()

const ENTRY_POINTS = new Set([
  '/src/main.ts',
  '/src/App.vue',
  '/src/env.d.ts',
])

const SKIP_PREFIXES = ['/src/types/']

function normalize(filePath) {
  let p = filePath.replace(/\\/g, '/')
  const idx = p.indexOf('/src/')
  if (idx === -1) return null
  p = p.slice(idx + 5)
  p = p.replace(/\.(js|ts|vue)$/, '')
  return p
}

function scanProject() {
  if (scanDone) return
  scanDone = true

  const srcDir = path.join(ROOT, 'src')
  if (!fs.existsSync(srcDir)) return

  const files = walkDir(srcDir)
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const dir = path.dirname(file)
    extractImportPaths(content, dir)
  }
}

function walkDir(dir) {
  const result = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          result.push(...walkDir(fullPath))
        }
      } else if (
        entry.name.endsWith('.js') ||
        entry.name.endsWith('.ts') ||
        entry.name.endsWith('.vue')
      ) {
        result.push(fullPath)
      }
    }
  } catch {
    // ignore
  }
  return result
}

function extractImportPaths(content, currentDir) {
  for (const source of extractRawImportPaths(content)) {
    if (/[*?]/.test(source)) {
      resolveGlobPattern(source, currentDir)
      continue
    }

    if (source.startsWith('@/')) {
      const basic = source.slice(2).replace(/\.(js|ts|vue)$/, '')
      importRefs.add(basic)
      importRefs.add(basic + '/index')
    } else if (source.startsWith('.')) {
      const resolved = path.resolve(currentDir, source)
      const rel = '/' + path.relative(ROOT, resolved).replace(/\\/g, '/')
      const basic = normalize(rel)
      if (basic) {
        importRefs.add(basic)
        importRefs.add(basic + '/index')
      }
    }
  }
}

function resolveGlobPattern(globPath, currentDir) {
  if (!globPath.startsWith('.') && !globPath.startsWith('@/')) return

  let baseDir
  let prefix

  if (globPath.startsWith('@/')) {
    const relPath = globPath.slice(2).replace(/\.(js|ts|vue)$/, '')
    const starIdx = relPath.indexOf('*')
    if (starIdx === -1) return
    baseDir = path.join(ROOT, 'src', relPath.slice(0, starIdx))
    prefix = relPath.slice(0, starIdx)
  } else {
    const starIdx = globPath.indexOf('*')
    if (starIdx === -1) return
    baseDir = path.resolve(currentDir, globPath.slice(0, starIdx))
    prefix = '/' + path.relative(ROOT, baseDir).replace(/\\/g, '/')
  }

  if (!fs.existsSync(baseDir)) return

  const ext = path.extname(globPath.replace(/\*/g, '')) || '.js'
  const entries = fs.readdirSync(baseDir)
  for (const entry of entries) {
    if (entry.endsWith(ext) || entry.endsWith('.vue')) {
      const fullPath = path.join(baseDir, entry)
      const rel = '/' + path.relative(ROOT, fullPath).replace(/\\/g, '/')
      const basic = normalize(rel)
      if (basic) {
        importRefs.add(basic)
        importRefs.add(basic + '/index')
      }
    }
  }
}

function extractRawImportPaths(content) {
  const results = []
  let match

  const fromRegex = /from\s+['"]([^'"]+)['"]/g
  while ((match = fromRegex.exec(content)) !== null) {
    results.push(match[1])
  }

  const sideEffectRegex = /^import\s+['"]([^'"]+)['"]/gm
  while ((match = sideEffectRegex.exec(content)) !== null) {
    results.push(match[1])
  }

  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = requireRegex.exec(content)) !== null) {
    results.push(match[1])
  }

  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = dynamicRegex.exec(content)) !== null) {
    results.push(match[1])
  }

  const globRegex =
    /import\.meta\.glob(?:Eager)?\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = globRegex.exec(content)) !== null) {
    results.push(match[1])
  }

  return results
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: '检测未被其他文件引用的文件' },
    messages: {
      unused: '文件 "{{ file }}" 未被其他文件引用，如不再需要请删除',
    },
  },

  create(context) {
    scanProject()

    const f = context.filename || ''
    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')

    if (!rel.startsWith('/src/') || !rel.match(/\.(js|ts|vue)$/)) return {}
    if (ENTRY_POINTS.has(rel)) return {}
    if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) return {}

    return {
      'Program:exit'() {
        const normalized = normalize(rel)
        if (!normalized) return
        if (importRefs.has(normalized)) return

        const dirPattern = normalized.replace(/\/index$/, '')
        if (dirPattern !== normalized && importRefs.has(dirPattern)) return

        context.report({
          node: context.sourceCode.ast,
          messageId: 'unused',
          data: { file: rel.replace('/src/', '') },
        })
      },
    }
  },
}
