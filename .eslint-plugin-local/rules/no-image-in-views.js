/*
 * @Author: runnet
 * @Date: 2026-09-06 16:20:00
 * @LastEditors: runnet
 * @LastEditTime: 2026-09-06 16:20:00
 * @FilePath: no-image-in-views.js
 * @Description: 禁止 views 下存放图片并规范模板图片路径
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
        '禁止图片文件存放在 src/views/ 下，模板中引用的图片路径必须位于 /static/image/ 下',
    },
    messages: {
      fileInViews:
        '图片文件不应放在 views 目录下，请移至 public/static/image/ 目录后通过路径引用',
      invalidImagePath:
        '图片路径 "{{ path }}" 不在 /static/image/ 下，请将图片移至 public/static/image/ 后更新路径',
    },
  },

  create(context) {
    const f = context.getFilename() || ''
    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')
    if (!rel.startsWith('/src/')) return {}

    const ext = path.extname(f).toLowerCase()

    // 当前文件本身是图片且在 views 下
    if (IMAGE_EXTS.has(ext) && rel.includes('/views/')) {
      context.report({
        node: context.getSourceCode().ast,
        messageId: 'fileInViews',
      })
    }

    // 非 Vue 文件不需要后续模板检查
    if (ext !== '.vue') return {}

    const ps = context.sourceCode.parserServices
    if (!ps || !ps.defineTemplateBodyVisitor) return {}

    return Object.assign(
      {},

      // <img src="..."> — 静态属性
      ps.defineTemplateBodyVisitor({
        'VAttribute[directive=false][key.name="src"]'(node) {
          checkImageValue(node && node.value)
        },

        // <img :src="'...'"> — 动态绑定但值为字符串字面量
        'VAttribute[directive=true][key.name.name="bind"][key.argument.name="src"]'(
          node
        ) {
          checkBoundImageValue(node && node.value)
        },

        // 静态 style="background: url(...)" 或 background-image: url(...)
        'VAttribute[directive=false][key.name="style"]'(node) {
          checkStyleUrlValue(node && node.value)
        },
      })
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

      // :src="'xxx.png'"
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

      // :src="`xxx.png`"
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
