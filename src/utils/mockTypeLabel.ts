/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\utils\mockTypeLabel.ts
 * @Description: 项目类型标签映射
 */
const TYPE_LABELS: Record<string, string> = {
  npm: 'npm',
  maven: 'Maven',
}

/**
 * 根据项目类型获取对应的显示标签
 * @param {string} type 项目类型标识
 * @returns {string} 显示标签，未匹配时返回原值
 */
export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type
}
