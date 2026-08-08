/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/rules/no-image-in-src.js
 * @Description: 禁止 src/ 目录下存放图片文件，必须放在项目根目录 /public/static/image/
 */

import path from 'path'
import fs from 'fs'

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

let scanned = false

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        '禁止 src/ 目录下存放图片文件，必须放在项目根目录 /public/static/image/',
    },
    messages: {
      imageInSrc:
        'src/ 目录下不允许存放图片文件 "{{ name }}"（{{ ext }}），请移至 /public/static/image/',
    },
  },

  create(context) {
    const f = context.filename || ''
    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')
    const ext = path.extname(f).toLowerCase()

    if (IMAGE_EXTS.has(ext)) return {}
    if (!rel.startsWith('/src/')) return {}

    scanSrcImages(context)

    return {}
  },
}

function scanSrcImages(context) {
  if (scanned) return
  scanned = true

  const srcDir = path.join(ROOT, 'src')
  if (!fs.existsSync(srcDir)) return

  walkDir(srcDir, (filePath) => {
    const ext = path.extname(filePath).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) return

    context.report({
      loc: { line: 1, column: 0 },
      messageId: 'imageInSrc',
      data: {
        name: path.basename(filePath),
        ext: ext.toUpperCase(),
      },
    })
  })
}

function walkDir(dir, cb) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkDir(fullPath, cb)
      } else if (entry.isFile()) {
        cb(fullPath)
      }
    }
  } catch {
    // ignore
  }
}
