/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-14
 * @FilePath: \src\env.d.ts
 * @Description: Vite 与 Vue 文件类型声明
 */
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
