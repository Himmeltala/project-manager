---
name: project-manager
description: 项目管理器应用（Electron + Vue 3 + Element Plus）的开发规范与领域知识。当编写页面、组件、IPC、配置、进程管理、VCS、构建部署、代理配置相关代码时加载此技能。
tools: Read, Glob, Grep, Edit, Write, Bash
---

# 项目管理器应用开发技能

为项目管理器 Electron 应用提供架构设计、开发规范和业务功能的完整参考。

## 项目概要

- **技术栈**：Electron + Vue 3 + Element Plus + Pinia + TypeScript
- **核心功能**：项目源管理 → 进程启停 → VCS 版本控制 → 构建部署 → 代理配置 → 任务队列 → 通知系统
- **持久化**：Electron `%APPDATA%/项目管理器/` 目录，分为 assets（核心配置）和 store（通用存储）两个区域
- **架构模式**：提供者模式（注册表）+ 适配器模式，主进程采用 handler → service 分层

## 使用方式

编写代码前，根据任务类型查阅对应的参考文件：

| 任务类型 | 参考文件 |
|----------|----------|
| 了解架构分层、提供者/适配器模式、启动流程 | [references/architecture.md](references/architecture.md) |
| 编写页面、组件、样式、布局、状态管理 | [references/development-standards.md](references/development-standards.md) |
| 实现 IPC 通信、配置项、持久化存储 | [references/ipc-data.md](references/ipc-data.md) |
| 处理项目源、进程、VCS、构建、代理、通知等业务 | [references/business-features.md](references/business-features.md) |

## 核心原则速查

### 编码规范
- 注释使用中文，单行 `//`，函数/类用 `/** */` JSDoc
- 优先 `const`/`let`，不用 `var`；缩进 2 空格；kebab-case 类名，camelCase 变量/函数，PascalCase 组件名
- 代码须符合 ES2020 标准；禁止 emoji 和 AI 风格标识符

### 架构
- 主进程分层：main.ts（入口组装）→ handlers（纯路由）→ services（业务逻辑）
- 跨类型差异用提供者模式（ProjectTypeRegistry / VcsRegistry），不用 if/switch 分支
- 同类型内工具差异用适配器模式（BuildToolAdapter），新增适配器不改业务代码
- IPC 命名 `领域:动作`，预加载按领域分组，事件监听必须返回清理函数

### 样式
- 优先用 `--el-*` 变量，scoped 样式，不 `!important`
- 辅助文本用 `.text-muted`，暗黑模式通过 `html.dark` class 切换

### 布局
- 应用外壳：`.home` → `.toolbar` → `.search-bar` → `.filter-bar`(可选) → `.main-content` → `.table-wrapper` → `el-table` + `.pagination-wrapper`
- 底部面板：`.bottom-panel`（输出/通知/任务三面板 v-show 互斥）
- 状态栏：`.status-bar`

### 组件
- 表格：`stripe size="small"`，`highlight-current-row`，空状态 `<el-empty description="暂无数据" />`
- 分页：默认 100 条，`layout="total, prev, pager, next"`
- 按钮：表格内 `link`，工具栏主按钮 `primary` + 次要 `plain`，删除/停止需 `useConfirm` 二次确认
- 对话框：通过 `AppDialogs` 统一管理，`useDialogs` composable 集中逻辑
- 消息分三级：TaskManager（耗时操作）> NotificationService（持久化事件）> ElMessage（即时反馈）

### 文件组织
- `src/views/` 页面级 → 跨页面复用到 `src/dialogs/` 或 `src/components/`
- 不确定时放页面级；弹窗用 `AppDialogs` 统一管理
- `electron/services/` 服务自治模式：构造时 load()，变更时 save()

### 配置
- 新功能先判断"不同用户/场景会不会不一样" → 做配置项
- 添加步骤：settings_schema.json → 代码中 `settings.get(key, default)` → Vue 中 `electronAPI.getSetting(key)`
- key 用 `.` 分隔层级，映射到 `settings.json` 的嵌套对象

### 持久化
- 用户可配置 → `settings.json`；项目/源/通知 → 对应服务管理的 JSON；其他 → `store/*.json`
- 禁止用 localStorage 和 session storage
- 每个服务采用"构造时加载 + 变更时保存"的自治模式

### 进程管理
- spawn 子进程自动检测编码（UTF-8 / GBK），输出 50ms 缓冲批量推送
- 端口检测 `netstat -ano`，终止进程树需清理子进程
- 退出时 `stopAll()` 确保子进程清理

### VCS
- SVN 完整实现，Git 骨架；通过 VcsRegistry 按路径检测匹配
- 定时巡检：远程检查 + 本地检查，检测到变更自动创建通知
- 操作优先打开 GUI（TortoiseSVN / Git GUI）

### 消息通知
- 三级体系：TaskManager（耗时操作进度）→ NotificationService（持久化事件）→ ElMessage（即时反馈）
- 已有 TaskManager 管理的操作不额外弹 Toast
- 已有 NotificationService 创建通知的事件不额外弹 Toast
