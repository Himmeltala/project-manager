/*
 * @Author: zhengrenfu
 * @Date: 2026-07-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-15
 * @FilePath: \scripts\clean-out.js
 * 描述: 删除 out 目录，处理文件锁定问题（重试、重命名策略）
 */

import { existsSync, rmSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const OUT_DIR = resolve('out')
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

/**
 * 带重试和重命名回退策略的目录删除
 * @param {string} dirPath 目标目录
 * @returns {boolean} 是否成功删除
 */
function forceRemove(dirPath) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 })
      return true
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        // 重命名策略：锁有时只阻止删除，不阻止重命名
        try {
          const tmp = resolve(tmpdir(), `out_${randomUUID()}`)
          renameSync(dirPath, tmp)
          rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 })
          return true
        } catch {
          console.warn(`[clean-out] 第 ${attempt} 次尝试失败，${RETRY_DELAY_MS / 1000}s 后重试...`)
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS)
        }
      }
    }
  }
  return false
}

if (!existsSync(OUT_DIR)) {
  console.log('[clean-out] out 目录不存在，跳过清理')
  process.exit(0)
}

console.log('[clean-out] 删除 out 目录...')
const success = forceRemove(OUT_DIR)

if (success) {
  console.log('[clean-out] 删除成功')
} else {
  // 最后手段：列出锁定的文件
  console.error('[clean-out] 无法删除 out 目录，可能被以下程序占用：')
  console.error('  - 文件资源管理器打开了 out 目录')
  console.error('  - 上一次打包的程序仍在运行')
  console.error('  - 杀毒软件正在扫描')
  console.error('')
  console.error('请关掉上述程序后重试，或用 handle64.exe 查找锁定进程：')
  console.error('  handle64.exe out /accepteula')
  process.exit(1)
}
