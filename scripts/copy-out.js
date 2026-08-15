import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const src = resolve('out/ProjectManager-win32-x64')
const dst = 'E:/项目管理/'

if (!existsSync(src)) {
  console.error(`[copy-out] 错误: ${src} 目录不存在，请先执行 pnpm run pack`)
  process.exit(1)
}

console.log(`[copy-out] 删除旧目录: ${dst}`)
rmSync(dst, { recursive: true, force: true })

console.log(`[copy-out] 复制 ${src} -> ${dst}`)
// cpSync 复制 500MB+ 目录时 node 进程可能崩溃（0xC0000139），改用 Windows 原生 robocopy
// MSYS 下反斜杠会被 bash 转义吞掉，统一用正斜杠（Windows API 兼容）
// robocopy 退出码：0=无变化，1=有文件复制，2=有额外文件，3=两者兼有（均视为成功）；>=8 才是错误
const srcWin = src.replace(/\\/g, '/')
const dstWin = dst.replace(/\\/g, '/')
const result = spawnSync('robocopy', [srcWin, dstWin, '/E', '/NFL', '/NDL', '/NJH', '/NP', '/R:1', '/W:1'], {
  stdio: 'inherit',
})
if (result.status === null || result.status >= 8) {
  console.error(`[copy-out] 错误: robocopy 失败，退出码 ${result.status}`)
  process.exit(1)
}

console.log('[copy-out] 完成')
