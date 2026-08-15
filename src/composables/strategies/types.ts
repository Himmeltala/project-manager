/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-15
 * @FilePath: \src\composables\strategies\types.ts
 * @Description: 项目流程策略接口定义，前端 UI 表现适配器
 */

/* 菜单叶子项，action 与 ProjectView 动作分发表中的键一一对应 */
export interface FlowMenuItem {
  /* 动作标识，如 'build' / 'java' / 'warName' */
  action: string
  /* 菜单显示文本 */
  label: string
  /* 是否为危险操作，渲染为红色文本 */
  danger?: boolean
}

/* 右键菜单子菜单分组 */
export interface FlowMenuGroup {
  /* 分组唯一标识，如 'build' */
  key: string
  /* 子菜单标题 */
  label: string
  /* 子菜单内叶子项 */
  items: FlowMenuItem[]
}

/* 类型专属右键菜单声明，区块未声明则不渲染 */
export interface FlowMenu {
  /* 构建子菜单，未声明则整个构建区块不显示 */
  buildGroup?: FlowMenuGroup
  /* 配置文件子菜单内的操作项，未声明则只保留"打开配置文件" */
  configItems?: FlowMenuItem[]
  /* 类型专属设置项，渲染在"项目管理"之后，如 Java/Maven/Tomcat 版本 */
  typeActions?: FlowMenuItem[]
}

/* 项目流程适配器 -- 每种项目类型实现一个 */
export interface ProjectFlowAdapter {
  /* 唯一标识，如 'npm' / 'maven' */
  readonly type: string

  /* 类型显示名称 */
  readonly label: string

  /* 启动模式：直接启动 或 选择子模块后启动 */
  getStartMode(): 'direct' | 'module-select'

  /* 构建子模块启动命令 */
  buildStartCommand(modulePath: string): string

  /* 构建命令候选列表 */
  readonly buildCommands: string[]

  /* 安装依赖命令候选列表 */
  readonly installCommands: string[]

  /* 是否支持脚手架检测（build-tool） */
  readonly supportsBuildToolDetection: boolean

  /* 任务执行的命令模板，如 'npm run {script}' */
  getTaskCommandTemplate(taskName?: string): string

  /* 构建命令回退值（无 buildCommands 或 scripts 时使用） */
  readonly defaultBuildCommand: string

  /* 类型专属右键菜单声明 */
  readonly menu: FlowMenu
}
