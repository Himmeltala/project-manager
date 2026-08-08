/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/rules/illegal-component-using.js
 * @Description: 组件目录结构与命名规范检查
 */

import path from 'path'
import fs from 'fs'

const ROOT = process.cwd()
const SKIP = ['index']

export default {
  meta: {
    type: 'problem',
    docs: { description: '组件目录结构与命名规范检查' },
    messages: {
      pascalCase: '组件名 "{{ name }}" 必须使用 PascalCase 多词命名',
      index:
        '目录 "{{ dir }}" 包含多个 .vue 文件时不可使用 index.vue 作为入口，应使用具名文件',
    },
  },
  create(context) {
    const f = context.filename || ''
    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')
    if (!f.endsWith('.vue') || !rel.startsWith('/src/components/')) return {}

    const parts = rel.split('/')
    const fileName = parts.pop()
    const dirPath = parts.join('/')
    const dir = parts[parts.length - 1]
    const isIdx = fileName === 'index.vue'
    const name = isIdx ? dir : fileName.replace(/\.vue$/, '')

    // PascalCase 命名检查
    if (!SKIP.includes(name) && !/^[A-Z][a-zA-Z0-9]+$/.test(name)) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'pascalCase',
        data: { name },
      })
    }

    // 多文件目录入口检查
    if (isIdx) {
      const fullDir = path.join(ROOT, dirPath)
      let siblings
      try {
        siblings = fs.readdirSync(fullDir).filter((n) => n.endsWith('.vue'))
      } catch {
        return {}
      }
      if (siblings.length > 1) {
        context.report({
          node: context.sourceCode.ast,
          messageId: 'index',
          data: { dir },
        })
      }
    }

    return {}
  },
}
