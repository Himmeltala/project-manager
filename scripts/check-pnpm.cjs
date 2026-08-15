/*
 * @Author: zhengrenfu
 * @Date: 2026-08-06
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-06
 * @FilePath: \scripts\check-pnpm.cjs
 * @Description: 强制使用 pnpm 包管理器：npm/yarn 执行 install 时拦截并报错
 */

// npm 与 pnpm 都会在 install 前运行 preinstall，通过 npm_config_user_agent 区分
const userAgent = process.env.npm_config_user_agent || ''
const isPnpm = userAgent.includes('pnpm')

if (!isPnpm) {
  const manager = userAgent.split(' ')[0] || '未知包管理器'
  console.error('')
  console.error('==================================================')
  console.error(`  检测到包管理器: ${manager}`)
  console.error('  本项目强制使用 pnpm 包管理器！')
  console.error('')
  console.error('  请使用以下命令安装依赖:')
  console.error('    pnpm install')
  console.error('')
  console.error('  如未安装 pnpm:')
  console.error('    npm install -g pnpm')
  console.error('==================================================')
  console.error('')
  process.exit(1)
}

console.log('[check-pnpm] pnpm 检测通过，继续安装...')
