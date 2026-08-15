/*
 * @Author: zhengrenfu
 * @Date: 2026-08-04
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-04
 * @FilePath: \scripts\clean-dist-electron.js
 * @Description: 清理 dist-electron 构建产物目录，防止增量构建残留陈旧 chunk 随包发布
 */

import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const DIR = resolve('dist-electron')

if (!existsSync(DIR)) {
  process.exit(0)
}

try {
  rmSync(DIR, { recursive: true, force: true })
  console.log('[clean-dist-electron] 已清理 dist-electron 目录')
} catch (err) {
  // 目录被占用时仅告警，不阻断构建流程
  console.warn('[clean-dist-electron] 清理失败（目录可能被占用），将进行增量构建:', err.message)
}
