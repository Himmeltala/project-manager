/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\ipc\keys.ts
 * @Description: 设置与存储键名常量，主进程与渲染进程共用
 */

// 应用设置键
export const SETTINGS_KEYS = {
  theme: 'theme',
  openers: 'openers',
  bottomPanelHeight: 'bottom_panel.height',
  systemLogMaxLines: 'system_log.max_lines',
  buildtoolConfigPriority: 'buildtool.config_priority',
  tasks: {
    maxConcurrency: 'tasks.max_concurrency',
    maxCount: 'tasks.max_count',
  },
  notifications: {
    enabled: 'notifications.enabled',
    maxCount: 'notifications.max_count',
  },
  svn: {
    path: 'svn.path',
    tortoisePath: 'svn.tortoise_path',
  },
  scheduledChecks: {
    localEnabled: 'scheduled_checks.local_enabled',
    localIntervalMinutes: 'scheduled_checks.local_interval_minutes',
    remoteEnabled: 'scheduled_checks.remote_enabled',
    remoteIntervalMinutes: 'scheduled_checks.remote_interval_minutes',
  },
  terminal: {
    path: 'terminal.path',
    args: 'terminal.args',
    entries: 'terminal.entries',
    initCommand: 'terminal.init_command',
  },
  update: {
    url: 'update.url',
    type: 'update.type',
    lastCheck: 'update.last_check',
    frequency: 'update.frequency',
    customMinutes: 'update.custom_minutes',
  },
} as const

// 通用存储键
export const STORE_KEYS = {
  buildNames: 'build_names',
  buildZipNames: 'build_zip_names',
} as const
