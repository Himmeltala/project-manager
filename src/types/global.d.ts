/** 全局 Window 扩展，暴露 electronAPI 给渲染进程 */
interface Window {
  electronAPI: import('./ipc').IpcApi
}
