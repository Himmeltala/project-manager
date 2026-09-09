/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/index.js
 * @Description: 本地 ESLint 规则入口，自动扫描 rules 目录注册全部规则
 */

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RULES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'rules',
)

// 扫描 rules 目录，文件名即规则名，新增删除无需手工维护
const rules = {}
for (const file of readdirSync(RULES_DIR).sort()) {
  if (!file.endsWith('.js')) continue
  const { default: rule } = await import(
    pathToFileURL(path.join(RULES_DIR, file)).href
  )
  rules[file.slice(0, -3)] = rule
}

export default { rules }
