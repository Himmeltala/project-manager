/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\main.ts
 * @Description: 应用入口，挂载 Vue 实例
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
// dark mode CSS variables, toggled by html.dark class
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from '@/App.vue'
import router from '@/router'
import { useSystemLogStore } from '@/stores/system-log.store'
import { loadTypeCapabilities } from '@/composables/useProjectType'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 日志面板：捕获全部控制台信息、Vue 运行时错误、未捕获异常
const logStore = useSystemLogStore(pinia)

// Vue 运行时错误
app.config.errorHandler = (err, _instance, info) => {
  const msg = err instanceof Error ? err.message : String(err)
  logStore.addEntry(msg, info || '')
}

// 未捕获 JS 异常
window.onerror = (_event, _source, _lineno, _colno, err) => {
  const msg = err instanceof Error ? err.message : String(err)
  logStore.addEntry(msg, 'onerror')
}

// 未捕获 Promise 拒绝
window.onunhandledrejection = (event) => {
  const reason = event.reason
  const msg = reason instanceof Error ? reason.message : String(reason)
  logStore.addEntry(msg, 'unhandledRejection')
}

// 注入所有 console 级别，捕获日志到面板
const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const
for (const level of CONSOLE_LEVELS) {
  const original = (console as any)[level]
  ;(console as any)[level] = (...args: any[]) => {
    const text = args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : String(a))).join(' ')
    if (text) logStore.addEntry(text, `console.${level}`)
    original.apply(console, args)
  }
}

// 启动前拉取项目类型能力，供表格、弹窗与动作策略同步查询
loadTypeCapabilities().then(() => app.mount('#app'))
