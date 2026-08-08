/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14 10:02:02
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14 21:01:22
 * @FilePath: \src\composables\useModal.ts
 * @Description: 函数式弹窗
 */
import { h, render, onUnmounted, getCurrentInstance } from 'vue'
import type { Component, AppContext } from 'vue'

interface UseModalOptions {
  // 组件定义或异步加载函数
  component: Component | (() => Promise<{ default: Component }>)
  // 静态 props，会与 open() 传入的 props 合并
  props?: Record<string, any>
  // 静态事件监听，会与 open() 传入的 emit 合并
  emit?: Record<string, (...args: any[]) => void>
  // 触发后自动关闭弹窗的事件名列表
  autoCloseEvents?: string[]
  // 弹窗关闭回调（外部调 close / 点遮罩 / autoCloseEvents 均触发）
  onClose?: () => void
}

interface UseModalReturn {
  open: (props?: Record<string, any>, emit?: Record<string, (...args: any[]) => void>) => Promise<void>
  close: () => void
}

/**
 * 函数式弹窗
 *
 * 以编程方式打开弹窗组件，支持异步加载、自动销毁、事件驱动关闭。
 * 弹窗实例独立管理，重复调用 open() 会先销毁旧实例再创建新实例。
 * 调用 useModal 所在的组件卸载时自动销毁弹窗，防止 DOM 泄漏。
 *
 * @param options.component - 组件定义或异步加载函数
 * @param options.props - 静态 props
 * @param options.emit - 静态事件监听
 * @param options.autoCloseEvents - 触发后自动关闭的事件名列表，默认 ['cancel', 'close']
 * @param options.onClose - 统一关闭回调
 */
export function useModal(options: UseModalOptions): UseModalReturn {
  const {
    component,
    props: staticProps = {},
    emit: staticEmit = {},
    autoCloseEvents = ['cancel', 'close'],
    onClose,
  } = options

  let container: HTMLElement | null = null
  let isOpen = false
  let loading = false
  let pendingOpen = false
  let loadedComp: Component | null = null
  let currentProps: Record<string, any> = {}
  let currentEmit: Record<string, (...args: any[]) => void> = {}
  let destroyTimer: ReturnType<typeof setTimeout> | null = null
  let animateTimer: ReturnType<typeof setTimeout> | null = null
  let generation = 0

  // 从调用方组件获取 appContext，确保弹窗内可使用 ElementPlus 等插件
  const appContext: AppContext | null = getCurrentInstance()?.appContext ?? null

  // 合并静态事件与动态事件，生成组件 props 中的 onXxx 处理器
  function getEventHandlers(
    dynamicEmit: Record<string, (...args: any[]) => void> = {},
  ): Record<string, (...args: any[]) => void> {
    const merged = { ...staticEmit, ...dynamicEmit }
    const handlers: Record<string, (...args: any[]) => void> = {}

    for (const [eventName, handler] of Object.entries(merged)) {
      const key = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`
      handlers[key] = (...args: any[]) => {
        handler(...args)
        if (autoCloseEvents.includes(eventName)) {
          close()
        }
      }
    }

    // 为 autoCloseEvents 中未显式注册的事件添加默认关闭处理器
    for (const eventName of autoCloseEvents) {
      const key = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`
      if (!handlers[key]) {
        handlers[key] = () => close()
      }
    }

    // 监听 visible 变化（点击遮罩或组件内部关闭）
    handlers['onUpdate:visible'] = (newVisible: boolean) => {
      if (!newVisible && isOpen) {
        close()
      }
    }

    // 监听组件退场动画结束，隔离旧弹窗的 closed 回调
    const closedGen = generation
    handlers['onClosed'] = () => {
      if (closedGen !== generation) return
      destroy()
    }

    return handlers
  }

  // 彻底销毁 DOM 并重置状态
  function destroy() {
    clearTimeout(destroyTimer!)
    destroyTimer = null
    clearTimeout(animateTimer!)
    animateTimer = null

    if (!container) return
    render(null, container)
    container.parentNode?.removeChild(container)
    container = null
    isOpen = false
    loading = false
    pendingOpen = false
    loadedComp = null
  }

  // 渲染弹窗到容器
  function renderModal(visible: boolean, dynamicEmit: Record<string, (...args: any[]) => void> = {}) {
    if (!container || !loadedComp) return

    const vnode = h(loadedComp, {
      ...staticProps,
      ...currentProps,
      visible,
      ...getEventHandlers(dynamicEmit),
    })

    // 注入 appContext，使弹窗可获得 ElementPlus、Pinia 等插件能力
    if (appContext) {
      vnode.appContext = appContext
    }

    render(vnode, container)
  }

  // 关闭弹窗
  function close() {
    if (!isOpen) return
    isOpen = false
    onClose?.()
    renderModal(false, currentEmit)

    // onClosed 兜底：超过 5s 未触发则强制销毁
    clearTimeout(destroyTimer!)
    destroyTimer = setTimeout(() => {
      if (container) {
        console.warn('[useModal] onClosed 未触发，强制销毁弹窗容器')
        destroy()
      }
    }, 5000)
  }

  // 打开弹窗
  async function open(
    propsOrOptions?: Record<string, any>,
    emitOptions?: Record<string, (...args: any[]) => void>,
  ): Promise<void> {
    let newProps: Record<string, any> = {}
    let newEmit: Record<string, (...args: any[]) => void> = {}

    if (emitOptions !== undefined) {
      // open(props, emit)
      newProps = propsOrOptions ?? {}
      newEmit = emitOptions
    } else if (propsOrOptions) {
      // open(props)
      newProps = propsOrOptions
    }

    currentProps = newProps
    currentEmit = newEmit

    // 正在加载组件中，标记 pending，加载完用最新参数重试
    if (loading) {
      pendingOpen = true
      return
    }

    // 已有打开的弹窗，先销毁
    if (isOpen) {
      destroy()
    }

    // 退出动画中但尚未完全销毁，强制清理
    if (!isOpen && container) {
      clearTimeout(destroyTimer!)
      destroyTimer = null
      destroy()
    }

    // 新代数，隔离旧弹窗的 onClosed 回调
    generation++
    loading = true

    try {
      const resolved =
        typeof component === 'function' ? await (component as () => Promise<{ default: Component }>)() : component
      loadedComp = (resolved as any).default ?? resolved
    } catch (e) {
      loading = false
      pendingOpen = false
      console.error('[useModal] 组件加载失败:', e)
      throw e
    }

    // 加载期间有新 open 调用，用最新参数重试
    if (pendingOpen) {
      pendingOpen = false
      loading = false
      return open(currentProps, currentEmit)
    }

    loading = false

    // 创建挂载点
    container = document.createElement('div')
    container.id = `modal-${Date.now().toString(36)}`
    document.body.appendChild(container)

    isOpen = true

    // 先以 visible 为 false 渲染，挂载 DOM 再设 true 触发展开动画
    renderModal(false, currentEmit)

    animateTimer = setTimeout(() => {
      animateTimer = null
      if (isOpen) {
        renderModal(true, currentEmit)
      }
    }, 20)
  }

  // 父组件卸载时自动销毁
  onUnmounted(() => destroy())

  return { open, close }
}
