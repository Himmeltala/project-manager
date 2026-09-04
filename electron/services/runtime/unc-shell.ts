/*
 * @Author: zhengrenfu
 * @Date: 2026-09-03
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \electron\services\runtime\unc-shell.ts
 * @Description: UNC 网络路径下的 cmd 工作目录兼容工具
 */

/**
 * 判断路径是否为 UNC 网络共享路径（以双反斜杠开头的 \\服务器\共享\...）
 * cmd.exe 无法将 UNC 路径作为当前目录使用，需要此类路径走专门包装
 * @param {string} p 待判断路径
 * @returns {boolean} 是否为 UNC 路径
 */
export function isUncPath(p: string): boolean {
  return typeof p === 'string' && p.startsWith('\\\\')
}

/**
 * 将需要在 UNC 目录下执行的 cmd 命令包装为 pushd 临时映射方式
 * 先 pushd 到目标 UNC 路径再执行原命令，结束后无条件 popd，
 * pushd 会为会话临时映射一个盘符，从而绕开 cmd 不支持 UNC 当前目录的限制
 * @param {string} command 原始 cmd 命令文本
 * @param {string} uncDir 目标 UNC 工作目录
 * @returns {string} 包装后的命令文本，执行时不再传 cwd 参数
 */
export function wrapCmdForUnc(command: string, uncDir: string): string {
  // 末尾补 if errorlevel 判断：popd 会覆盖进程退出码，导致内部命令失败也被当作成功
  // if errorlevel 在运行时求值，不受行首展开时机影响，失败时统一以退出码 1 收尾
  return `pushd "${uncDir}" >nul 2>&1 && (${command}) & popd >nul 2>&1 & if errorlevel 1 exit /b 1`
}
