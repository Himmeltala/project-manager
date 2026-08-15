/*
 * @Author: zhengrenfu
 * @Date: 2026-08-15
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\composables\useProjectType.ts
 * @Description: 项目类型能力适配层，后端 provider 为单一事实来源，前端启动时拉取缓存
 */

import type { ProjectTypeCapability } from '@/types/project'
import { IPC } from '@/ipc/channels'

// 类型能力缓存，应用启动时从后端拉取一次
let capabilityMap = new Map<string, ProjectTypeCapability>()

// 后端能力拉取失败时的兜底（形状与 npm 一致），避免消费点判空
const FALLBACK_CAPABILITY: ProjectTypeCapability = {
  type: 'npm',
  label: 'npm',
  startMode: 'direct',
  buildStartCommandTemplate: '',
  modulePathSeparator: '',
  buildCommands: [],
  installCommands: ['npm install', 'pnpm install', 'yarn install'],
  installFlags: [
    { value: '--legacy-peer-deps', label: '--legacy-peer-deps', default: true },
    { value: '--force', label: '--force' },
  ],
  installExtraPlaceholder: '如: --prefer-offline --no-audit',
  taskCommandTemplate: 'npm run {script}',
  defaultBuildCommand: 'npm run build',
  supportsBuildToolDetection: true,
  nestedBuildOutputDirs: [],
  menu: {
    buildGroup: {
      key: 'build',
      label: '构建',
      items: [
        { id: 'build', label: '构建项目' },
        { id: 'install', label: '安装依赖' },
        { id: 'clean', label: '清理构建产物' },
        { id: 'cleanModules', label: '清理依赖目录' },
      ],
    },
    configItems: [
      { id: 'proxy', label: '修改代理' },
      { id: 'proxyPort', label: '修改端口' },
    ],
  },
}

/**
 * 拉取全部项目类型能力并缓存
 * @returns 拉取是否成功
 */
export async function loadTypeCapabilities(): Promise<boolean> {
  try {
    const list = (await window.electronAPI.invoke(IPC.projectType.getCapabilities)) as ProjectTypeCapability[]
    capabilityMap = new Map(list.map((c) => [c.type, c]))
    return capabilityMap.size > 0
  } catch {
    // 静默失败，保持兜底能力
    return false
  }
}

/**
 * 获取项目类型能力
 * @param type 项目类型标识
 * @returns 能力对象，未知类型回退 npm 形状
 */
export function getCapabilities(type: string): ProjectTypeCapability {
  return capabilityMap.get(type) ?? capabilityMap.get('npm') ?? FALLBACK_CAPABILITY
}

/**
 * 生成子模块启动命令，模块路径转换规则由类型能力声明
 * @param type 项目类型标识
 * @param modulePath 模块路径
 * @returns 启动命令，模板为空时返回空串
 */
export function buildStartCommand(type: string, modulePath: string): string {
  const capability = getCapabilities(type)
  const template = capability.buildStartCommandTemplate
  if (!template) return ''
  const module = capability.modulePathSeparator ? modulePath.replace(/\\/g, capability.modulePathSeparator) : modulePath
  return template.replace('{module}', module)
}
