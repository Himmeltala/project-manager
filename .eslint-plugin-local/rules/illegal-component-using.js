/*
 * @Author: runnet
 * @Date: 2026-09-06 16:20:00
 * @LastEditors: runnet
 * @LastEditTime: 2026-09-06 16:20:00
 * @FilePath: illegal-component-using.js
 * @Description: 多文件组件目录禁止使用 index.vue 入口
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

export default {
  meta: {
    type: 'problem',
    docs: { description: '组件目录结构规范：多文件目录禁止使用 index.vue 入口' },
    messages: {
      index:
        '目录 "{{ dir }}" 包含多个 .vue 文件时不可使用 index.vue 作为入口，应使用具名文件',
    },
  },
  create(context) {
    const f = context.getFilename() || ''
    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')
    if (!f.endsWith('.vue') || !rel.startsWith('/src/components/')) return {}

    const parts = rel.split('/')
    const fileName = parts.pop()
    const dirPath = parts.join('/')
    const dir = parts[parts.length - 1]

    // 仅检查 index.vue
    if (fileName !== 'index.vue') return {}

    // 检查同一目录下是否有其他 .vue 文件
    const fullDir = path.join(ROOT, dirPath)
    let siblings
    try {
      siblings = fs.readdirSync(fullDir).filter(n => n.endsWith('.vue'))
    } catch {
      return {}
    }

    if (siblings.length > 1) {
      context.report({
        node: context.getSourceCode().ast,
        messageId: 'index',
        data: { dir },
      })
    }

    return {}
  },
}
