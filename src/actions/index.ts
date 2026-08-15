/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\actions\index.ts
 * @Description: 动作策略集中注册入口
 */

import { actionRegistry } from '@/actions/registry'
import { startAction, stopAction } from '@/actions/actions/start-stop'
import { buildAction, installAction, cleanAction, cleanModulesAction } from '@/actions/actions/build'
import {
  openAction,
  renameAction,
  removeAction,
  deleteAction,
  migrateAction,
  viewPortsAction,
} from '@/actions/actions/project'
import {
  vcsUpdateAction,
  vcsLogAction,
  vcsCommitAction,
  vcsRepoBrowserAction,
  vcsCheckAction,
} from '@/actions/actions/vcs'
import {
  proxyAction,
  proxyPortAction,
  setJavaAction,
  setMavenAction,
  setGradleAction,
  setTomcatAction,
  setWarNameAction,
} from '@/actions/actions/settings'

actionRegistry.register(startAction)
actionRegistry.register(stopAction)
actionRegistry.register(buildAction)
actionRegistry.register(installAction)
actionRegistry.register(cleanAction)
actionRegistry.register(cleanModulesAction)
actionRegistry.register(openAction)
actionRegistry.register(renameAction)
actionRegistry.register(removeAction)
actionRegistry.register(deleteAction)
actionRegistry.register(migrateAction)
actionRegistry.register(viewPortsAction)
actionRegistry.register(vcsUpdateAction)
actionRegistry.register(vcsLogAction)
actionRegistry.register(vcsCommitAction)
actionRegistry.register(vcsRepoBrowserAction)
actionRegistry.register(vcsCheckAction)
actionRegistry.register(proxyAction)
actionRegistry.register(proxyPortAction)
actionRegistry.register(setJavaAction)
actionRegistry.register(setMavenAction)
actionRegistry.register(setGradleAction)
actionRegistry.register(setTomcatAction)
actionRegistry.register(setWarNameAction)
