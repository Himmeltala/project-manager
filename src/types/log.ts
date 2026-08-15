/*
 * @Author: zhengrenfu
 * @Date: 2026-08-03
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \src\types\log.ts
 * @Description: 系统日志相关类型定义
 */

/* 系统日志条目 */
export interface LogItem {
  /* 时间戳 */
  timestamp: number
  /* 日志消息 */
  message: string
  /* 附加信息（堆栈、来源等） */
  info: string
}
