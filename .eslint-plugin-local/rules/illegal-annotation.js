/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/rules/illegal-annotation.js
 * @Description: 文件头注释 + 全部注释规范 / AI 表述检查
 */

import path from 'path'

const ROOT = process.cwd()

const HEADER_FIELDS = [
  'Author',
  'Date',
  'LastEditors',
  'LastEditTime',
  'FilePath',
  'Description',
]

const LINE_AI =
  /^\s*\/\/\s*(新增|修改|优化|调整|重构|删除了|添加了|修复了|实现了|更新了|进行了|用于|用来|这是一个|这个函数|该方法|此处|这里).{2,}/i
const BLOCK_AI =
  /^\s*\*\s*(新增|修改|优化|调整|重构|删除了|添加了|修复了|实现了|更新了|进行了|用于|用来).{2,}/i

const SYMBOL_RE =
  /[+=×←-⇿─-╿■-◿☀-➿]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDEFF]|\uD83E[\uDD00-\uDDFF]/

function hasSymbol(s) {
  return SYMBOL_RE.test(s)
}

export default {
  meta: {
    type: 'problem',
    docs: { description: '文件头注释 + 全部注释规范 / AI 表述检查' },
    messages: {
      noHeader: '文件缺少头部注释（.vue 用 <!-- -->，.js/.ts 用 /* */ 或 /** */）',
      headerMissing: '文件头缺少 @{{ field }}',
      lineSpace: '单行注释 // 后必须跟一个空格',
      lineAi: '单行注释含 AI 风格表述："{{ content }}"',
      notJsdoc: '块注释必须使用 /** */ 格式（JSDoc）',
      sectionHeader: 'JSDoc 不可用作章节分隔线（如 /** ---- xxx ---- */），请改用 //',
      pseudoJsdoc: 'JSDoc 仅含描述无标签（@param/@returns 等），请改用 // 单行注释',
      blockAi: 'JSDoc 描述含 AI 风格表述："{{ content }}"',
      symbol: '注释含特殊符号（箭头/线条/emoji）："{{ content }}"',
    },
  },

  create(context) {
    const f = context.filename || ''
    if (!f.endsWith('.vue') && !f.endsWith('.js') && !f.endsWith('.ts'))
      return {}

    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')
    if (!rel.startsWith('/src/')) return {}

    const reports = []

    function addReport(messageId, loc, data) {
      reports.push({ messageId, loc, data })
    }

    // 1. 文件头注释检查
    const raw = context.sourceCode.text || ''
    const h = raw.match(
      f.endsWith('.vue')
        ? /^<!--([\s\S]*?)-->/
        : /^\/\*{1,2}([\s\S]*?)\*\//,
    )
    if (!h) {
      addReport('noHeader', { line: 1, column: 0 })
    } else {
      const map = {}
      let m
      const re = /@(\w+)\s*:?\s*(.+)/g
      while ((m = re.exec(h[1])) !== null) map[m[1]] = m[2].trim()
      for (const field of HEADER_FIELDS) {
        if (!map[field]) addReport('headerMissing', { line: 1, column: 0 }, { field })
      }
    }

    // 2. 注释内容规范检查
    const comments = context.sourceCode.ast.comments || []
    for (const c of comments) {
      if (c.type === 'Line') {
        const raw_ = c.value
        if (!raw_.trim()) continue
        const txt = raw_.replace(/\s+$/, '')
        if (txt.startsWith('/') || txt.startsWith('#')) continue
        if (/^http/.test(txt)) continue

        const full = '//' + txt
        if (!full.startsWith('// ')) {
          addReport('lineSpace', c.loc)
          continue
        }

        if (LINE_AI.test(full)) {
          addReport('lineAi', c.loc, { content: full.substring(0, 40) })
          continue
        }

        if (hasSymbol(full)) {
          addReport('symbol', c.loc, { content: full.substring(0, 40) })
        }
      }

      if (c.type === 'Block') {
        const text = c.value
        if (!text.trim()) continue

        const isJsdoc = text.trim().startsWith('*')

        if (!isJsdoc) {
          addReport('notJsdoc', c.loc)
          continue
        }

        if (/^[-=*]{3,}.*[-=*]{3,}$/.test(text.trim().replace(/^\*\s*/, ''))) {
          addReport('sectionHeader', c.loc)
          continue
        }

        if (!text.includes('\n') && !/@/.test(text)) {
          const after = context.sourceCode.text
            .slice(c.range[1])
            .replace(/\s+/g, ' ')
            .trim()
          const rest = after.replace(/^export\s+/, '')
          if (/^(function|const|let|var|async)\b/.test(rest)) {
            addReport('pseudoJsdoc', c.loc)
            continue
          }
        }

        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (BLOCK_AI.test(lines[i])) {
            addReport('blockAi', c.loc, {
              content: lines[i].replace(/^\s*\*\s?/, '').substring(0, 40),
            })
            break
          }
          if (hasSymbol(lines[i])) {
            addReport('symbol', c.loc, {
              content: lines[i].replace(/^\s*\*\s?/, '').substring(0, 40),
            })
            break
          }
        }
      }
    }

    return {
      'Program:exit'(node) {
        for (const r of reports) {
          context.report({ node, ...r })
        }
      },
    }
  },
}
