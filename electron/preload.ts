/**
 * Preload 脚本 — 通用 invoke/on 桥接
 * 通过 contextBridge 暴露 electronAPI 给渲染进程
 * 该文件被编译为独立的 CommonJS 文件
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ...data: unknown[]) => callback(...data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
})
