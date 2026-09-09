/*
 * @Author: runnet
 * @Date: 2026-09-06 16:20:00
 * @LastEditors: runnet
 * @LastEditTime: 2026-09-08 22:30:00
 * @FilePath: no-image-in-src.js
 * @Description: 禁止 src 目录存放图片文件，同步 .eslintignore 排除遗留目录
 */
import path from 'path'
import fs from 'fs'
import ignore from 'ignore'
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

// 每个进程只全量扫描一次，结果挂在首个被 lint 的 src 文件上
let scanState = null

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        '禁止 src/ 目录下存放图片文件，图片资源必须放在项目根目录的 public/static/image/ 下',
    },
    messages: {
      imageInSrc:
        'src/ 目录下不允许存放图片文件 "{{ name }}"（{{ ext }}），请移至 public/static/image/ 目录',
    },
  },

  create(context) {
    const f = context.getFilename() || ''
    const root = process.cwd()
    const rel = '/' + path.relative(root, f).replace(/\\/g, '/')
    const ext = path.extname(f).toLowerCase()

    if (IMAGE_EXTS.has(ext)) return {}
    if (!rel.startsWith('/src/')) return {}
    if (!scanState || scanState.root !== root) scanState = scanSrc(root)
    // 已扫描过则不再重复上报
    if (scanState.scanned) return {}

    scanState.scanned = true
    for (const image of scanState.images) {
      context.report({
        loc: { line: 1, column: 0 },
        messageId: 'imageInSrc',
        data: image,
      })
    }
    return {}
  },
}

/**
 * 读取 .eslintignore 构造匹配器
 * @param {string} root 项目根目录
 * @returns {object} ignore 实例
 */
function loadIgnoreMatcher(root) {
  const file = path.join(root, '.eslintignore')
  if (!fs.existsSync(file)) return ignore()
  return ignore().add(fs.readFileSync(file, 'utf8'))
}

/**
 * 全量扫描 src 下未被 eslintignore 的图片
 * @param {string} root 项目根目录
 * @returns {object} 扫描结果
 */
function scanSrc(root) {
  const ig = loadIgnoreMatcher(root)
  const images = []

  ;(function walkDir(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const relPath = path.relative(root, abs).replace(/\\/g, '/')
      if (ig.ignores(relPath)) continue
      if (entry.isDirectory()) {
        walkDir(abs)
      } else if (entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        images.push({ name: entry.name, ext: path.extname(entry.name).toUpperCase() })
      }
    }
  })(path.join(root, 'src'))

  return { root, images, scanned: false }
}
