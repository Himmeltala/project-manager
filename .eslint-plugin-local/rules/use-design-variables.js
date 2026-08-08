/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/rules/use-design-variables.js
 * @Description: 禁止在 Vue 组件 <style> 中硬编码颜色值，必须使用 var(--xxx) 引用
 */

import path from 'path'

const ROOT = process.cwd()

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const RGB_RE = /rgba?\s*\([^)]+\)/g
const HSL_RE = /hsla?\s*\([^)]+\)/g

const ALLOWED_KEYWORDS = new Set([
  'transparent',
  'currentColor',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
])

const NAMED_COLOR_RE =
  /(?<![-\w])(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey|silver|gold|navy|teal|aqua|cyan|magenta|lime|olive|maroon|coral|tan|plum|violet|indigo|salmon|tomato|wheat|khaki|beige|ivory|whitesmoke|lightgray|lightgrey|lightblue|lightgreen|lightyellow|lightpink|lightcyan|darkgray|darkgrey|darkblue|darkgreen|darkred|darkcyan|darkmagenta|darkorange|darkpurple|dimgray|dimgrey|slategray|slategrey)(?![-\w])/gi

function isVarOnlyLine(line) {
  const trimmed = line.trim()
  if (/^var\(--/.test(trimmed)) return true
  if (/^--\w/.test(trimmed)) return true
  if (/^@\w+\s/.test(trimmed)) return true
  return false
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        '禁止在 Vue 组件 <style> 中硬编码颜色值，必须使用 var(--xxx) 引用',
    },
    messages: {
      hardcodedColor:
        '禁止硬编码颜色值 "{{ value }}"（{{ type }}），请使用 var(--xxx) 自定义属性替代',
    },
  },

  create(context) {
    const f = context.filename || ''
    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')

    if (!rel.startsWith('/src/') || !f.endsWith('.vue')) return {}

    const source = context.sourceCode.text

    const styleBlocks = []
    const styleOpenRe = /<style\b[^>]*>/gi
    const styleCloseRe = /<\/style\b\s*>/gi

    let openMatch
    while ((openMatch = styleOpenRe.exec(source)) !== null) {
      const closeIdx = source.slice(openMatch.index).search(styleCloseRe)
      if (closeIdx === -1) break

      const contentStart = openMatch.index + openMatch[0].length
      const content = source.slice(contentStart, contentStart + closeIdx)
      styleBlocks.push({
        content,
        startLine: source.slice(0, openMatch.index).split('\n').length,
      })
    }

    if (styleBlocks.length === 0) return {}

    const reported = new Set()

    for (const block of styleBlocks) {
      const lines = block.content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        const trimmed = line.trim()
        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('/*') ||
          trimmed.startsWith('*')
        )
          continue

        if (isVarOnlyLine(line)) continue

        checkLine(line, 'color', block.startLine + i, context, reported)
      }
    }

    return {}
  },
}

function checkLine(line, type, lineNumber, context, reported) {
  let m

  HEX_RE.lastIndex = 0
  while ((m = HEX_RE.exec(line)) !== null) {
    if (isInsideVarRef(line, m.index)) continue
    reportColor(m[0], type, lineNumber, context, reported)
  }

  RGB_RE.lastIndex = 0
  while ((m = RGB_RE.exec(line)) !== null) {
    if (m[0].includes('$')) continue
    if (isInsideVarRef(line, m.index)) continue
    reportColor(m[0], type, lineNumber, context, reported)
  }

  HSL_RE.lastIndex = 0
  while ((m = HSL_RE.exec(line)) !== null) {
    if (m[0].includes('$')) continue
    if (isInsideVarRef(line, m.index)) continue
    reportColor(m[0], type, lineNumber, context, reported)
  }

  NAMED_COLOR_RE.lastIndex = 0
  while ((m = NAMED_COLOR_RE.exec(line)) !== null) {
    if (ALLOWED_KEYWORDS.has(m[1].toLowerCase())) continue
    if (isInsideVarRef(line, m.index)) continue
    reportColor(m[1], type, lineNumber, context, reported)
  }
}

function isInsideVarRef(line, index) {
  const before = line.slice(0, index)
  const lastVar = before.lastIndexOf('var(')
  if (lastVar === -1) return false

  const afterVar = before.slice(lastVar)
  const commas = afterVar.match(/,/g)
  const openParens = afterVar.match(/\(/g) || []
  const closeParens = afterVar.match(/\)/g) || []

  const parenDepth = openParens.length - closeParens.length
  return (commas || []).length >= parenDepth
}

function reportColor(value, type, lineNumber, context, reported) {
  const lower = value.toLowerCase()

  if (ALLOWED_KEYWORDS.has(lower)) return

  const key = `${lineNumber}:${value}`
  if (reported.has(key)) return
  reported.add(key)

  context.report({
    loc: { line: lineNumber, column: 0 },
    messageId: 'hardcodedColor',
    data: { value },
  })
}
