/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\types\global.d.ts
 * @Description: 全局 Window 扩展，暴露 electronAPI 给渲染进程
 */

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electronAPI: import('./ipc').IpcApi
    // 空闲标记：5 分钟无操作后暂停后台轮询
    __appIdle?: boolean
    // 组件卸载清理函数数组，onUnmounted 时统一执行
    __homeCleanups?: Array<() => void>
  }
}

export {}
