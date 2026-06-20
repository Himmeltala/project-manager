import { ElMessageBox, ElMessage } from 'element-plus'

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
  ElMessage.success(text)
}

export function useError(text: string) {
  ElMessage.error(text)
}

export function useWarning(text: string) {
  ElMessage.warning(text)
}

export function useInfo(text: string) {
  ElMessage.info(text)
}

export function useNotify(options: {
  title: string
  message: string
  type?: 'success' | 'warning' | 'error' | 'info'
}) {
  ElMessage(options)
}
