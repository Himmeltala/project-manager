/*
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \src\router\index.ts
 * @Description: 路由配置
 */
import { createRouter, createMemoryHistory } from 'vue-router'

import { useWarning } from '@/composables/useMessage'
import { usePullStore } from '@/stores/pull.store'

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

// 拉取项目期间禁止切换到其他页面，防止页面卸载后拉取任务失去结束信号
router.beforeEach((to) => {
  if (to.path === '/') return true
  const pullStore = usePullStore()
  if (pullStore.pulling) {
    useWarning('正在拉取项目，暂不能切换页面，请先中断拉取任务')
    return false
  }
  return true
})

export default router
