/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\types\project-action.ts
 * @Description: 项目表格动作标识定义，flow 菜单声明与动作分发表共用
 */

// 项目表格右键菜单动作集合，与 ProjectView 动作注册表的键一一对应
export const PROJECT_ACTIONS = [
  'start',
  'stop',
  'open',
  'build',
  'install',
  'clean',
  'cleanModules',
  'vcsUpdate',
  'vcsLog',
  'vcsCommit',
  'vcsRepoBrowser',
  'vcsCheck',
  'rename',
  'remove',
  'viewPorts',
  'delete',
  'migrate',
  'proxy',
  'proxyPort',
  'java',
  'maven',
  'gradle',
  'tomcat',
  'warName',
] as const

// 项目表格动作标识，写错动作名时编译期即报错
export type ProjectAction = (typeof PROJECT_ACTIONS)[number]
