/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-22 08:54:26
 * @FilePath: \src\router\index.ts
 * @Description: 路由配置
 */
import { createRouter, createMemoryHistory } from 'vue-router'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/ProjectView/index.vue'),
      meta: { title: '项目管理' },
    },
    {
      path: '/tools',
      redirect: '/tools/port',
      children: [
        {
          path: 'port',
          name: 'portTool',
          component: () => import('../views/ToolsView/PortTool.vue'),
          meta: { title: '端口工具' },
        },
      ],
    },
  ],
})

export default router
