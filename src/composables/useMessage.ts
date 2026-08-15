/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-25
 * @FilePath: \src\composables\useMessage.ts
 * @Description: 消息确认弹窗封装；提示信息改为输出到日志面板
 */
import { ElMessageBox } from 'element-plus'
import { IPC } from '@/ipc/channels'

export async function useConfirm(title: string, message: string, danger = false): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: danger ? 'warning' : 'info',
    })
    return true
  } catch {
    return false
  }
}

export async function usePrompt(title: string, label: string, defaultValue = ''): Promise<string | null> {
  try {
    const result = await ElMessageBox.prompt(label, title, {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: defaultValue,
    })
    return result.value
  } catch {
    return null
  }
}

export function useSuccess(text: string) {
  window.electronAPI.invoke(IPC.system.log, 'info', text)
}

export function useError(text: string) {
  window.electronAPI.invoke(IPC.system.log, 'error', text)
}

export function useWarning(text: string) {
  window.electronAPI.invoke(IPC.system.log, 'warning', text)
}

export function useInfo(text: string) {
  window.electronAPI.invoke(IPC.system.log, 'info', text)
}
