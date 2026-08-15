/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\utils\frameworkMeta.ts
 * @Description: 运行框架显示元数据注册表
 */

import type { RunnableModule } from '@/types/project'

// 运行框架徽标注册表，新增框架在此声明显示文本
const FRAMEWORK_META: Record<NonNullable<RunnableModule['framework']>, { badge: string }> = {
  'spring-boot': { badge: 'SB' },
  tomcat: { badge: 'TC' },
}

/**
 * 获取框架徽标文本
 * @param framework 框架标识
 * @returns 徽标文本，未知框架返回空串
 */
export function getFrameworkBadge(framework: RunnableModule['framework']): string {
  return framework ? (FRAMEWORK_META[framework]?.badge ?? '') : ''
}
