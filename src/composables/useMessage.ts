/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14 11:57:04
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-25 16:26:18
 * @FilePath: \src\composables\useMessage.ts
 * @Description: 消息确认弹窗封装；提示信息写入统一走日志面板门面 store
 */
import { ElMessageBox } from 'element-plus'
import { useSystemLogStore } from '@/stores/system-log.store'

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
  useSystemLogStore().notify('success', text)
}

export function useError(text: string) {
  useSystemLogStore().notify('error', text)
}

export function useWarning(text: string) {
  useSystemLogStore().notify('warning', text)
}

export function useInfo(text: string) {
  useSystemLogStore().notify('info', text)
}
