/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/rules/no-image-in-views.js
 * @Description: 禁止图片文件存放在 src/views/ 下，模板中图片路径必须在 /static/image/ 下
 */

import path from 'path'

const ROOT = process.cwd()
const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  '.ico',
])
const STATIC_IMAGE_PREFIX = '/static/image/'

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        '禁止图片文件存放在 src/views/ 下，模板中图片路径必须在 /static/image/ 下',
    },
    messages: {
      fileInViews:
        '图片文件不应放在 views 目录下，请移至 public/static/image/ 引入',
      invalidImagePath:
        '图片路径 "{{ path }}" 不在 /static/image/ 下，请移至 public/static/image/ 后更新路径',
    },
  },

  create(context) {
    const f = context.filename || ''
    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')
    if (!rel.startsWith('/src/')) return {}

    const ext = path.extname(f).toLowerCase()

    if (IMAGE_EXTS.has(ext) && rel.includes('/views/')) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'fileInViews',
      })
    }

    if (ext !== '.vue') return {}

    const ps = context.parserServices
    if (!ps || !ps.defineTemplateBodyVisitor) return {}

    return Object.assign(
      {},
      ps.defineTemplateBodyVisitor({
        'VAttribute[directive=false][key.name="src"]'(node) {
          checkImageValue(node && node.value)
        },
        'VAttribute[directive=true][key.name.name="bind"][key.argument.name="src"]'(node) {
          checkBoundImageValue(node && node.value)
        },
        'VAttribute[directive=false][key.name="style"]'(node) {
          checkStyleUrlValue(node && node.value)
        },
      }),
    )

    function checkImageValue(literal) {
      if (!literal || !literal.value) return
      const val = literal.value.trim()
      if (isImagePath(val) && !isAllowedPath(val)) {
        context.report({
          node: literal,
          messageId: 'invalidImagePath',
          data: { path: val },
        })
      }
    }

    function checkBoundImageValue(exprContainer) {
      if (!exprContainer || !exprContainer.expression) return
      const expr = exprContainer.expression
      if (expr.type === 'Literal' && typeof expr.value === 'string') {
        const val = expr.value.trim()
        if (isImagePath(val) && !isAllowedPath(val)) {
          context.report({
            node: expr,
            messageId: 'invalidImagePath',
            data: { path: val },
          })
        }
      }
      if (expr.type === 'TemplateLiteral' && expr.quasis.length === 1) {
        const val = expr.quasis[0].value.raw.trim()
        if (isImagePath(val) && !isAllowedPath(val)) {
          context.report({
            node: expr,
            messageId: 'invalidImagePath',
            data: { path: val },
          })
        }
      }
    }

    function checkStyleUrlValue(literal) {
      if (!literal || !literal.value) return
      const val = literal.value.trim()
      const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g
      let match
      while ((match = urlRegex.exec(val)) !== null) {
        const imgPath = match[1]
        if (isImagePath(imgPath) && !isAllowedPath(imgPath)) {
          context.report({
            node: literal,
            messageId: 'invalidImagePath',
            data: { path: imgPath },
          })
        }
      }
    }

    function isImagePath(str) {
      return IMAGE_EXTS.has(path.extname(str).toLowerCase())
    }

    function isAllowedPath(p) {
      return (
        p.startsWith(STATIC_IMAGE_PREFIX) ||
        p.startsWith('/public' + STATIC_IMAGE_PREFIX)
      )
    }
  },
}
