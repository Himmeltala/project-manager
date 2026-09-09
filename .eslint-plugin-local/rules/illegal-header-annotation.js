/*
 * @Author: runnet
 * @Date: 2026-09-06 16:20:00
 * @LastEditors: runnet
 * @LastEditTime: 2026-09-06 16:20:00
 * @FilePath: illegal-header-annotation.js
 * @Description: 文件头注释字段完整性、顺序与日期格式检查修复
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const FIELDS = [
  'Author',
  'Date',
  'LastEditors',
  'LastEditTime',
  'FilePath',
  'Description',
]
const DEFAULT_AUTHOR = 'zhengrenfu'
const FULL_DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

function pad(n) {
  return String(n).padStart(2, '0')
}

/**
 * 格式化日期为年月日时分秒
 * @param {Date} d 日期对象
 * @returns {string} 形如 "2026-09-06 16:20:00"
 */
function fmt(d) {
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  )
}

function fieldLine(name, value) {
  return ' * @' + name + (value ? ': ' + value : ':')
}

function buildValues(rel, author) {
  return {
    Author: author,
    Date: fmt(new Date()),
    LastEditors: author,
    LastEditTime: fmt(new Date()),
    FilePath: '/' + rel.replace(/\\/g, '/'),
    Description: '',
  }
}

/**
 * 拼接完整头部注释文本
 * @param {boolean} isVue 是否为 .vue 文件
 * @param {string[]} lines 字段行列表
 * @param {string} eol 行尾符，CRLF 文件保持原风格
 * @param {boolean} doubleStar js 注释是否使用 /** 开头
 * @returns {string} 完整注释文本（不含尾换行）
 */
function buildHeader(isVue, lines, eol, doubleStar) {
  const opener = isVue ? '<!--' + eol : (doubleStar ? '/**' : '/*') + eol
  const closer = isVue ? '-->' : ' */'
  return opener + lines.join(eol) + eol + closer
}

export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        '文件头注释规范：字段齐全且按固定顺序，Date 与 LastEditTime 须为完整年月日时分秒格式',
    },
    schema: [
      {
        type: 'object',
        properties: { author: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      noHeader:
        '文件缺少头部注释（.vue 使用 <!-- --> 格式，.js/.ts 使用 /* */ 格式）',
      missing: '文件头缺少 @{{ fields }} 字段',
      reorder:
        '文件头字段须为 Author、Date、LastEditors、LastEditTime、FilePath、Description 顺序',
      unknownField: '文件头存在规范外字段 @{{ fields }}，已移除',
      dateFmt: '@{{ field }} 须为 YYYY-MM-DD HH:mm:ss 格式，已按文件时间补齐',
    },
  },

  create(context) {
    const f = context.getFilename() || ''
    if (!f.endsWith('.vue') && !f.endsWith('.js') && !f.endsWith('.ts'))
      return {}
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    if (!rel.startsWith('src/') || rel === 'src/components/index.js') return {}

    const options = context.options[0] || {}
    const author = options.author || DEFAULT_AUTHOR
    const isVue = f.endsWith('.vue')
    const raw = context.getSourceCode().text || ''
    const values = buildValues(rel, author)

    // 容忍 BOM、前导空行与 CRLF，避免把已有头部误判为缺失而重复插入
    const commentRe = isVue
      ? /^\s*<!--([\s\S]*?)-->/
      : /^\s*\/\*{1,2}([\s\S]*?)\*\//
    const h = raw.match(commentRe)
    const eol = raw.includes('\r\n') ? '\r\n' : '\n'
    const closer = isVue ? '-->' : ' */'
    const headText = FIELDS.map(name => fieldLine(name, values[name])).join(eol)

    if (!h) {
      const insertText = buildHeader(isVue, headText.split(eol), eol, false) + eol
      return {
        'Program:exit'() {
          context.report({
            node: context.getSourceCode().ast,
            messageId: 'noHeader',
            fix: fixer => fixer.insertTextBeforeRange([0, 0], insertText),
          })
        },
      }
    }

    // Date 取文件创建时间，LastEditTime 取文件修改时间
    let stat = null
    try {
      stat = fs.statSync(f)
    } catch (e) {
      stat = null
    }
    const repaired = {}
    const map = {}
    const seq = []
    const dateRanges = []
    const unknownFields = []
    const innerStart = h.index + h[0].indexOf(h[1])
    let lineStart = innerStart
    for (const line of h[1].split('\n')) {
      // 捕获组用 [\s\S]：JS 的 . 不匹配 \r，CRLF 行尾会断匹配
      const m = /^(\s*\*?\s*@(\w+)\s*:?\s*)([\s\S]*)$/.exec(line)
      if (m && FIELDS.includes(m[2])) {
        const key = m[2]
        const val = m[3].trim()
        map[key] = val
        seq.push(key)
        if ((key === 'Date' || key === 'LastEditTime') && !FULL_DATE_RE.test(val)) {
          const t = stat
            ? key === 'Date'
              ? stat.birthtime
              : stat.mtime
            : new Date()
          const newVal = DATE_ONLY_RE.test(val)
            ? val +
              ' ' +
              pad(t.getHours()) +
              ':' +
              pad(t.getMinutes()) +
              ':' +
              pad(t.getSeconds())
            : fmt(t)
          repaired[key] = newVal
          dateRanges.push({
            key,
            start: lineStart + m[1].length,
            end: lineStart + m[1].length + m[3].length,
            value: newVal,
          })
        }
      } else if (m) {
        // 规范外 @ 字段整体移除，头部仅保留模板字段
        unknownFields.push(m[2])
      }
      // 行内已含 \r，换行符恒为 1 个字符
      lineStart += line.length + 1
    }

    const present = FIELDS.filter(key => key in map)
    const missing = FIELDS.filter(key => !(key in map))
    const orderBad =
      seq.length !== present.length || seq.join() !== present.join()

    // 整头重建：缺失、乱序或含规范外字段时，输出纯模板六字段头
    if (missing.length > 0 || orderBad || unknownFields.length > 0) {
      const rebuiltLines = FIELDS.map(key => {
        const value = repaired[key] || map[key] || values[key]
        return fieldLine(key, value)
      })
      const blockEnd = h.index + h[0].length
      const opener = isVue ? '<!--' + eol : (h[0].startsWith('/**') ? '/**' : '/*') + eol
      const fullText = opener + rebuiltLines.join(eol) + eol + closer
      const hasUnknown = unknownFields.length > 0
      return {
        'Program:exit'() {
          context.report({
            node: context.getSourceCode().ast,
            messageId: hasUnknown ? 'unknownField' : orderBad ? 'reorder' : 'missing',
            data: hasUnknown
              ? { fields: unknownFields.join('、') }
              : orderBad
                ? {}
                : { fields: missing.join('、') },
            fix(fixer) {
              return fixer.replaceTextRange([h.index, blockEnd], fullText)
            },
          })
        },
      }
    }

    // 字段齐全且顺序规范时，仅修正日期格式
    if (dateRanges.length === 0) return {}
    return {
      'Program:exit'() {
        for (const r of dateRanges) {
          context.report({
            node: context.getSourceCode().ast,
            messageId: 'dateFmt',
            data: { field: r.key },
            fix: fixer => fixer.replaceTextRange([r.start, r.end], r.value),
          })
        }
      },
    }
  },
}
