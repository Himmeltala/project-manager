/*
 * @Author: zhengrenfu
 * @Date: 2026-08-10
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: .eslint-plugin-local/rules/no-relative-imports.js
 * @Description: 禁止相对路径导入，强制使用 @/ 或 @electron/ 路径别名
 */

import path from 'path'

const ROOT = process.cwd()

// 路径别名映射：别名前缀 → 对应的绝对目录
const ALIAS_MAP = [
  { prefix: '@', dir: path.join(ROOT, 'src') },
  { prefix: '@electron', dir: path.join(ROOT, 'electron') },
]

/**
 * 将相对导入路径解析为相对于项目根目录的规范路径
 * @param {string} currentFile 当前文件的绝对路径
 * @param {string} importPath import 中的相对路径
 * @returns {string|null} 导入目标相对于 ROOT 的路径，解析失败返回 null
 */
function resolveRelative(currentFile, importPath) {
  const dir = path.dirname(currentFile)
  const resolved = path.resolve(dir, importPath)
  const rel = path.relative(ROOT, resolved)
  if (rel.startsWith('..')) return null
  return rel.replace(/\\/g, '/')
}

/**
 * 尝试将目标路径映射为别名形式
 * @param {string} relPath 相对于 ROOT 的路径
 * @returns {{ prefix: string, suggestion: string }|null}
 */
function tryAlias(relPath) {
  for (const { prefix, dir } of ALIAS_MAP) {
    const aliasDir = path.relative(ROOT, dir).replace(/\\/g, '/') + '/'
    if (relPath.startsWith(aliasDir)) {
      const rest = relPath.slice(aliasDir.length)
      return { prefix, suggestion: prefix + '/' + rest }
    }
  }
  return null
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        '禁止相对路径导入（./ 和 ../），强制使用 @/ 或 @electron/ 路径别名',
    },
    messages: {
      useAlias:
        '相对导入 "{{ importPath }}" 应使用路径别名 "{{ suggestion }}"',
    },
  },

  create(context) {
    const f = context.filename || ''
    if (!f.endsWith('.vue') && !f.endsWith('.ts') && !f.endsWith('.js'))
      return {}

    return {
      ImportDeclaration(node) {
        const importPath = node.source.value
        if (!importPath || typeof importPath !== 'string') return

        // 仅处理相对路径
        if (!importPath.startsWith('./') && !importPath.startsWith('../'))
          return

        const resolved = resolveRelative(f, importPath)
        if (!resolved) return

        const aliased = tryAlias(resolved)
        if (!aliased) return

        context.report({
          node: node.source,
          messageId: 'useAlias',
          data: {
            importPath,
            suggestion: aliased.suggestion,
          },
        })
      },
    }
  },
}
