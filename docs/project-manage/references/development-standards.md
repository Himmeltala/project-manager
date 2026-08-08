# 界面与开发规范

## 1 样式约定

- scoped 样式，缩进 2 空格，kebab-case 类名，不使用 `!important`
- 优先用 `--el-*` 变量：`--el-bg-color`、`--el-border-color`、`--el-text-color-primary`、`--el-color-primary/success/danger/warning`
- 辅助文本色 `--el-text-color-placeholder`，工具类 `.text-muted`
- 暗黑模式通过 `html.dark` class 切换，`document.documentElement.classList.add('dark')`

## 2 布局

### 2.1 应用结构

```
.home (flex column, h:100%)
  .toolbar (flex, gap:6px, padding:4px 8px, bg:--el-bg-color-overlay, border-bottom, flex-shrink:0)
  .search-bar (flex, padding:4px 8px, border-bottom, flex-shrink:0)
  .filter-bar (可选, flex, padding:8px, bg:--el-bg-color-overlay, flex-shrink:0)
  .main-content (flex:1, overflow:auto)
    .table-wrapper (h:100%)
      el-table (stripe, size:small, w:100%, height:100%)
      .pagination-wrapper
        el-pagination (layout: "total, prev, pager, next", size:small, background)
  .bottom-panel (可选, h:200px, border-top, flex column, flex-shrink:0)
    输出/通知/任务 三面板 v-show 互斥
  .status-bar (flex, padding:2px 8px, bg:--el-bg-color-overlay, border-top, flex-shrink:0)
```

## 3 组件规范

### 3.1 表格

```html
<el-table :data="data" stripe size="small" style="width:100%" row-key="origIdx" highlight-current-row>
  <template #empty><el-empty description="暂无数据" /></template>
  <!-- 列定义 -->
</el-table>
```

列宽标准：

| 列   | width   | align  | 说明                            |
| ---- | ------- | ------ | ------------------------------- |
| 序号 | 80      | center | sortable                        |
| 名称 | min:120 | 左     | sortable                        |
| 类型 | 70      | center | sortable                        |
| 仓库 | 70      | center | sortable                        |
| 路径 | min:200 | 左     | show-overflow-tooltip, sortable |
| 状态 | 140     | center | 带颜色标签                      |
| 端口 | 105     | center | sortable                        |
| 操作 | 230     | right  | fixed:right, el-button-group    |

### 3.2 分页

```html
<el-pagination
  v-model:current-page="page"
  :page-size="100"
  :total="data.length"
  layout="total, prev, pager, next"
  size="small"
  background
/>
```

默认每页 100 条。

### 3.3 搜索栏

```html
<el-input v-model="searchText" placeholder="搜索项目名称或路径..." prefix-icon="Search" clearable size="small" />
<el-button-group>
  <el-button plain :type="caseSensitive ? 'primary' : 'default'" size="small">Aa</el-button>
  <el-button plain :type="wholeWord ? 'primary' : 'default'" size="small">Ab</el-button>
  <el-button plain :type="useRegex ? 'primary' : 'default'" size="small">.*</el-button>
</el-button-group>
<el-select v-model="scope" size="small" style="width: 130px">
  <el-option v-for="s in sources" :key="s.name" :label="s.name" :value="s.name" />
  <el-option label="所有源" value="__all__" />
</el-select>
```

搜索 200ms 防抖，搜索状态存 Pinia store。

### 3.4 按钮

- 表格内操作：`size="small" type="primary|danger" link icon`
- 工具栏：主按钮 `type="primary"`，次要 `plain`，分组 `<el-divider direction="vertical" />`
- 删除/停止操作需 `useConfirm(title, message, danger = true)` 二次确认
- 图标从 `@element-plus/icons-vue` 引入，放按钮文本前

### 3.5 对话框

所有对话框通过 `AppDialogs` 组件统一管理，可见性通过 `v-model:xxx-visible` 双向绑定。对话框逻辑集中到 `useDialogs` composable。

### 3.6 底部面板

输出/通知/任务三面板互斥切换，通过状态栏按钮控制。

### 3.7 右键菜单

```html
<el-menu class="context-menu" @select="onContextSelect">
  <el-menu-item index="start">启动</el-menu-item>
  <el-menu-item index="stop">停止</el-menu-item>
</el-menu>
```

通过 `@row-contextmenu` 触发，菜单项根据项目状态动态显隐。

### 3.8 消息弹窗

消息提示分三个层级，按优先级选择：

1. **TaskManager（任务面板）** — 耗时操作（构建、安装、清理、迁移、扫描等）通过 `TaskService.addTask()` 执行，任务面板自动显示生命周期（启动→进度→完成/失败），无需额外弹窗。

2. **NotificationService（通知面板）** — 需要持久化记录的事件（VCS 变更、构建结果、进程状态）通过 `notificationService.createNotification()` 创建，通知面板集中展示。

3. **ElMessage（短暂 Toast）** — 仅限以下场景使用（通过 `useMessage` 封装）：
   - 输入校验失败（格式错误、空值、越界等）
   - 即时反馈且无对应任务/通知机制的操作（切换源、设置保存、项目 CRUD 确认）
   - 操作前提检查（"没有可清理的产物"、"未发现 JDK"、"所有源模式下不支持此操作"）
   - 对话框内同步操作的结果提示（VCS 检查结果、更新摘要等）

**禁止场景：**

- 已经由 TaskManager 管理的操作，不额外弹"已启动"、"完成"、"失败"
- 已经由 NotificationService 创建通知的事件，不额外弹 Toast
- 全局监听 taskCompleted/taskFailed 后不弹 success/error

### 3.9 菜单

通过 `Menu.buildFromTemplate` 构建，菜单项通过 `webContents.send('menu:event', { action })` 通知渲染进程。渲染进程通过 `window.electronAPI.onMenuEvent(cb)` 接收。

```
项目 → 退出 (Alt+F4)
版本 → 范围更新 / 范围检查
项目源 → 管理项目源 / 添加项目源
视图 → 设置 / 数据目录管理
帮助 → 关于
```

### 3.10 生命周期

- `App.vue` 监听用户活动，5 分钟无操作设置 `window.__appIdle = true` 暂停后台轮询
- 用户重新活动时触发 `app-resume` 事件恢复
- `onUnmounted` 清理所有 IPC listener 和 DOM 事件

## 4 文件组织

```
src/
  views/HomeView/
    index.vue                       主页入口
    components/                     页面级组件
    composables/                    页面级 composable（useDialogs.ts）
  dialogs/                          全局弹窗（跨页面复用或菜单触发）
  stores/                           Pinia 状态
  composables/                      全局 composable（useMessage.ts）
  api/                              electronAPI 入口
  types/                            类型定义
  utils/                            工具函数

electron/
  main.ts                           应用入口
  preload.ts                        桥接层
  handlers/                         IPC handler 注册
  services/                         业务逻辑层
  services/project-type/            项目类型策略（npm / maven）
  services/vcs/                     VCS 策略（svn / git）
```

- 页面级组件放 `views/PageName/components/`，跨页面复用提至 `src/dialogs/` 或 `src/components/`
- PascalCase 组件名，kebab-case 类名，camelCase 变量/函数

## 5 状态管理

Composition API 风格，领域分 Store：

**project.store.ts：**

- `projects` / `sources` / `activeSource` — 项目列表与源
- `runningInfo` / `runningPaths` — 运行状态
- `searchText` / `searchCaseSensitive` / `searchWholeWord` / `searchRegex` — 搜索状态（跨 SearchBar ↔ ProjectTable ↔ FilterBar 共享）
- `loadSources()` / `loadProjects()` / `refreshRunningInfo()`

**notification.store.ts：**

- `notifications` / `unreadCount`
- `load()` / `reload()` / `markRead()` / `markAllRead()` / `clearAll()`

- Store 只管理数据，不操作 UI/路由
- Store 方法以动词开头命名

## 6 类型定义

按领域分文件：

| 文件              | 用途                                 |
| ----------------- | ------------------------------------ |
| `project.ts`      | 项目配置、项目源、命令配置、构建产物 |
| `process.ts`      | 子进程句柄、运行状态、任务、迁移参数 |
| `notification.ts` | 通知类型枚举、通知项结构、类型元数据 |
| `task.ts`         | 后台任务状态、进度、报告回调         |
| `ipc.ts`          | IPC 接口完整声明（`IpcApi`）         |
| `global.d.ts`     | 全局扩展（`__appIdle` 等）           |

- 接口 `interface` PascalCase，导入用 `import type`
- `ipc.ts` 声明 `Window.electronAPI: IpcApi`

## 7 工具函数

- `useMessage` — ElMessage/ElMessageBox 封装，消息弹窗统一入口
- `bridge.ts` — `window.electronAPI` 访问入口
- 纯函数放 `utils/`，不引用 Vue API，不调用 Electron IPC
