import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

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

export interface ProxyConfigResult {
  configPath: string
  projectType: string
  proxies: ProxyEntry[]
}

function classifyComment(comment: string): string {
  if (!comment) return ''
  const stripped = comment.trim()
  if (/^https?:\/\//.test(stripped)) return 'url'
  if (/^https?:/.test(stripped)) return 'url'
  if (/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(stripped)) return 'url'
  return 'name'
}

function findConfigFileInDir(dir: string): { configPath: string; projectType: string } | null {
  const checks: [string, string][] = [
    ['vite.config.js', 'Vite'],
    ['vite.config.ts', 'Vite'],
    ['vue.config.js', 'Vue CLI'],
    ['webpack.dev.config.js', 'Webpack'],
    ['build/webpack.dev.config.js', 'Webpack'],
  ]
  for (const [filename, ptype] of checks) {
    const full = join(dir, filename)
    if (existsSync(full)) return { configPath: full, projectType: ptype }
  }
  return null
}

function parseEnvFile(envPath: string): Record<string, string> {
  try {
    const content = readFileSync(envPath, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      // 去掉引号
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1)
      }
      // 只保留以 VITE_ 或 VUE_APP_ 开头且值为 URL 的变量
      if ((key.startsWith('VITE_') || key.startsWith('VUE_APP_')) && /^https?:\/\//.test(val)) {
        vars[key] = val
      }
    }
    return vars
  } catch {
    return {}
  }
}

function findEnvFile(dir: string): Record<string, string> | null {
  for (const name of ['.env.development', '.env']) {
    const full = join(dir, name)
    if (existsSync(full)) {
      const vars = parseEnvFile(full)
      if (Object.keys(vars).length > 0) return vars
    }
  }
  return null
}

export interface ConfigFileResult {
  configPath: string
  projectType: string
  envVars?: Record<string, string>
}

export function detectConfigFile(projectPath: string): ConfigFileResult | null {
  // 1. 先查项目根目录
  let rootResult = findConfigFileInDir(projectPath)
  if (!rootResult) {
    // 2. 查常见前端子目录
    const subDirs = ['webfront', 'frontend', 'web', 'webapp', 'front', 'client', 'ui']
    for (const sub of subDirs) {
      const subPath = join(projectPath, sub)
      if (existsSync(subPath)) {
        rootResult = findConfigFileInDir(subPath)
        if (rootResult) break
      }
    }
  }

  // 3. 顺便扫 .env 文件，无论是否找到 JS 配置
  let envVars = findEnvFile(projectPath)
  if (!envVars) {
    for (const sub of ['webfront', 'frontend', 'web', 'webapp']) {
      const subPath = join(projectPath, sub)
      if (existsSync(subPath)) {
        envVars = findEnvFile(subPath)
        if (envVars) break
      }
    }
  }

  if (rootResult) {
    return { ...rootResult, envVars }
  }
  if (envVars) {
    return { configPath: '', projectType: '.env', envVars }
  }
  return null
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
      // 判断是否以 // 开头（注释掉的行）
      const isActive = !/^\s*\/\//.test(line)

      // 提取 target: 'url' 或 target: "url" 或 target: `url`
      // 手工找引号，比纯正则更抗噪
      const targetIdx = line.search(/target\s*:/)
      if (targetIdx === -1) {
        // 不是 target 行，检查是否为独立注释 URL
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

      // 找到 target: 后面的引号
      const colonIdx = line.indexOf(':', targetIdx + 6) // +6 跳过 "target"
      if (colonIdx === -1) continue
      const afterTarget = line.slice(colonIdx + 1)
      const quoteMatch = afterTarget.match(/(['"`])(.*?)\1/)
      if (!quoteMatch) continue

      const url = quoteMatch[2]
      // 收集行尾注释（// 后面的内容），从 URL 结束之后找
      let comment = ''
      const urlEnd = line.indexOf(quoteMatch[1], colonIdx + 1) + 1
      const ci = line.indexOf('//', urlEnd)
      if (ci !== -1) {
        comment = line.slice(ci + 2).trim()
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

export function parseProxyConfig(configPath: string): { lines: string[]; proxies: ProxyEntry[] } {
  const content = readFileSync(configPath, 'utf-8')
  const lines = content.split('\n')
  const block = findProxyBlock(lines)

  if (!block) return { lines, proxies: [] }

  const proxies = parseProxyEntries(lines, block[0], block[1])
  return { lines, proxies }
}

export function updateProxyTarget(configPath: string, proxyPath: string, newUrl: string): [boolean, string | null] {
  const { lines, proxies } = parseProxyConfig(configPath)
  const [ok, err] = applySingleChange(lines, proxies, proxyPath, newUrl)
  if (!ok) return [false, err]

  writeFileSync(configPath, lines.join('\n'), 'utf-8')
  return [true, null]
}

export function batchUpdateProxyTargets(
  configPath: string,
  changes: Record<string, string>,
): { failed: [string, string][]; lines: string[]; proxies: ProxyEntry[] } {
  let { lines, proxies } = parseProxyConfig(configPath)
  const failed: [string, string][] = []

  for (const [proxyPath, newUrl] of Object.entries(changes)) {
    const [ok, err] = applySingleChange(lines, proxies, proxyPath, newUrl)
    if (!ok) failed.push([proxyPath, err!])
  }

  writeFileSync(configPath, lines.join('\n'), 'utf-8')
  const result = parseProxyConfig(configPath)
  return { failed, lines: result.lines, proxies: result.proxies }
}

function applySingleChange(
  lines: string[],
  proxies: ProxyEntry[],
  proxyPath: string,
  newUrl: string,
): [boolean, string | null] {
  const proxy = proxies.find((p) => p.path === proxyPath)
  if (!proxy) return [false, `未找到代理路径: ${proxyPath}`]

  const active = proxy.targets.find((t) => t.isActive)
  const existingAlt = proxy.targets.find((t) => !t.isActive && t.url === newUrl)

  if (existingAlt) {
    if (existingAlt.rawLine.includes('target:')) {
      // 标准的 target: 行切换注释
      if (active) {
        lines[active.lineIndex] = lines[active.lineIndex].replace(/^(\s*)(target\s*:)/, '$1// $2')
      }
      lines[existingAlt.lineIndex] = lines[existingAlt.lineIndex].replace(/^(\s*)\/\/(\s*target\s*:)/, '$1$2')
    } else {
      // 注释行里的 URL — 直接替换 active 行的 URL 值
      if (!active) return [false, '没有活动目标可以修改']
      lines[active.lineIndex] = lines[active.lineIndex].replace(/(target\s*:\s*)(['"`])(.*?)\2/, `$1$2${newUrl}$2`)
    }
  } else {
    if (!active) return [false, '没有活动目标可以修改']
    lines[active.lineIndex] = lines[active.lineIndex].replace(/(target\s*:\s*)(['"`])(.*?)\2/, `$1$2${newUrl}$2`)
  }

  return [true, null]
}
