/*
 * @Author: zhengrenfu
 * @Date: 2026-07-29
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \electron\services\proxy-config\parser.ts
 * @Description: 代理配置解析器 — 纯函数，从配置文件中提取代理条目
 */
import { readFileSync } from 'fs'

// #region Types
export interface ProxyTarget {
  lineIndex: number
  isActive: boolean
  url: string
  comment: string
  rawLine: string
  commentType: string
}

export interface ProxyEntry {
  path: string
  targets: ProxyTarget[]
  activeTarget: ProxyTarget | null
  entryStart: number
  entryEnd: number
  isCommented: boolean
}
// #endregion

// #region Internal Helpers
function classifyComment(comment: string): string {
  if (!comment) return ''
  const stripped = comment.trim()
  if (/^https?:\/\//.test(stripped)) return 'url'
  if (/^https?:/.test(stripped)) return 'url'
  if (/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(stripped)) return 'url'
  return 'name'
}

function braceDelta(line: string): number {
  let stripped: string
  if (/^\s*\/\//.test(line)) {
    stripped = line.replace(/^\s*\/\/\s*/, '')
  } else {
    stripped = line.replace(/\/\/.*$/, '')
  }
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '')
  return (stripped.match(/\{/g) || []).length - (stripped.match(/\}/g) || []).length
}

function findProxyBlock(lines: string[]): [number, number] | null {
  let proxyStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*proxy\s*:\s*\{/.test(lines[i]) || /^\s*proxy\s*:\s*\[\s*\{/.test(lines[i])) {
      proxyStart = i
      break
    }
  }
  if (proxyStart === -1) return null

  let depth = 0
  let started = false
  for (let i = proxyStart; i < lines.length; i++) {
    depth += braceDelta(lines[i])
    if (depth > 0) started = true
    if (started && depth === 0) return [proxyStart, i]
  }
  return null
}

function parseProxyEntries(lines: string[], blockStart: number, blockEnd: number): ProxyEntry[] {
  const proxies: ProxyEntry[] = []
  let i = blockStart + 1

  while (i < blockEnd) {
    const entryMatch = lines[i].match(/^\s*(?:\/\/\s*)?['"`]([^'"`]+)['"`]\s*:\s*\{/)
    if (!entryMatch) {
      i++
      continue
    }

    const proxyPath = entryMatch[1]
    const isEntryCommented = lines[i].includes('//')
    let entryDepth = 0
    let entryStarted = false
    let entryEnd = i

    for (let j = i; j <= blockEnd; j++) {
      entryDepth += braceDelta(lines[j])
      if (entryDepth > 0) entryStarted = true
      if (entryStarted && entryDepth === 0) {
        entryEnd = j
        break
      }
    }

    const targets: ProxyTarget[] = []
    for (let j = i; j <= entryEnd; j++) {
      const line = lines[j]
      const isActive = !/^\s*\/\//.test(line)

      const targetIdx = line.search(/target\s*:/)
      if (targetIdx === -1) {
        const commentUrl = line.match(/^\s*\/\/\s*(https?:\/\/[^\s,;\]）\)]+)/)
        if (commentUrl) {
          const url = commentUrl[1].replace(/[，,、;；\s\)）\]]+$/, '')
          if (!targets.some((t) => t.url === url)) {
            targets.push({
              lineIndex: j,
              isActive: false,
              url,
              comment: `备用: ${url}`,
              rawLine: line,
              commentType: 'url',
            })
          }
        }
        continue
      }

      const colonIdx = line.indexOf(':', targetIdx + 6)
      if (colonIdx === -1) continue
      const afterTarget = line.slice(colonIdx + 1)
      const quoteMatch = afterTarget.match(/(['"`])(.*?)\1/)
      if (!quoteMatch) continue

      const url = quoteMatch[2]
      let comment = ''
      const urlEnd = line.indexOf(quoteMatch[1], colonIdx + 1) + 1
      const afterUrl = line.slice(urlEnd)
      const slMatch = afterUrl.match(/\/\/(.*)$/)
      if (slMatch) {
        comment = slMatch[1].trim()
      } else {
        const blockMatch = afterUrl.match(/\/\*([\s\S]*?)\*\//)
        if (blockMatch) {
          comment = blockMatch[1].trim()
        }
      }

      targets.push({
        lineIndex: j,
        isActive,
        url,
        comment,
        rawLine: line,
        commentType: classifyComment(comment),
      })
    }

    const active = targets.find((t) => t.isActive) || null
    proxies.push({
      path: proxyPath,
      targets,
      activeTarget: active,
      entryStart: i,
      entryEnd,
      isCommented: isEntryCommented,
    })

    i = entryEnd + 1
  }

  return proxies
}
// #endregion

// #region Public API
/**
 * 从行数组解析 proxy 块中的代理条目
 * @param lines 配置文件行数组
 * @returns 代理条目列表
 */
export function parseProxyLines(lines: string[]): ProxyEntry[] {
  const block = findProxyBlock(lines)
  if (!block) return []
  return parseProxyEntries(lines, block[0], block[1])
}

/**
 * 解析配置文件中的 proxy 配置块
 * @param configPath 配置文件绝对路径
 * @returns 文件行数组和解析出的代理条目列表
 */
export function parseProxyConfig(configPath: string): { lines: string[]; proxies: ProxyEntry[] } {
  const content = readFileSync(configPath, 'utf-8')
  const lines = content.split('\n')
  return { lines, proxies: parseProxyLines(lines) }
}

/**
 * 对单条代理路径应用 URL 变更（新增或切换）
 * @param lines 配置文件行数组
 * @param proxies 当前解析出的代理条目列表
 * @param proxyPath 代理路径
 * @param newUrl 目标 URL
 * @returns 是否成功
 */
export function applySingleChange(lines: string[], proxies: ProxyEntry[], proxyPath: string, newUrl: string): boolean {
  const proxy = proxies.find((p) => p.path === proxyPath)
  if (!proxy) return false

  const url = newUrl.trim()
  if (!/^https?:\/\//i.test(url)) return false

  const active = proxy.targets.find((t) => t.isActive)
  // 与当前活动目标相同则无需修改，避免产生重复行
  if (active && active.url === url) return true

  // 目标已以"注释的 target 行"存在：注释旧活动行，激活该行
  const existingTarget = proxy.targets.find((t) => !t.isActive && t.url === url && t.rawLine.includes('target:'))
  if (existingTarget) {
    if (active) {
      lines[active.lineIndex] = lines[active.lineIndex].replace(/^(\s*)(target\s*:)/, '$1// $2')
    }
    let newLine = lines[existingTarget.lineIndex].replace(/^(\s*)\/\/(\s*target\s*:)/, '$1$2')
    if (!/,\s*$/.test(newLine)) {
      newLine = newLine.replace(/\s*$/, '') + ','
    }
    lines[existingTarget.lineIndex] = newLine
    return true
  }

  // 目标不存在（或仅以裸 URL 注释存在）：统一注释旧活动行并在其后追加新行
  if (!active) return false
  const activeLine = lines[active.lineIndex]
  const indent = activeLine.match(/^(\s*)/)?.[1] || ''
  lines[active.lineIndex] = indent + '// ' + activeLine.trim()
  lines.splice(active.lineIndex + 1, 0, indent + `target: '${url}',`)
  return true
}
// #endregion
