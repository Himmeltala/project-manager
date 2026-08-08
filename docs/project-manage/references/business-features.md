# 业务功能规范

## 1 项目源管理

项目源（Source）是多项目配置的容器。一个源指向一个 `projects.json` 文件。

**核心逻辑（SourceManager）：**

- 默认源 `default` 指向 `assets/projects.json`
- 支持添加/删除/重命名源
- 从目录创建源：扫描目录自动发现项目并写入配置
- 切换源时同时刷新项目列表和运行状态

**IPC 通道：** `source:list` / `source:switch` / `source:add` / `source:remove` / `source:rename` / `source:createFromDir` / `source:startScanTask` / `source:refreshCurrent`

**"所有源"模式：** 渲染进程通过 `project:loadAll` 加载所有源的项目合并显示。此模式下 VCS 操作不可用。

## 2 项目 CRUD

**数据结构（Project）：**

```
name: string        项目名称
path: string        磁盘路径
projectType: string 类型（npm / maven）
javaHome: string    JDK 路径
mavenHome: string   Maven 路径
tomcatHome: string  Tomcat 路径
tomcatWarName: string WAR 包名
```

**操作流程：**

- 发现：扫描目录，根据特征文件（package.json / pom.xml）识别项目类型
- 添加：写入 projects.json 配置
- 移除：仅从配置删除，不删文件
- 物理删除：配置删除 + 磁盘文件删除
- 重命名：修改配置中名称

**IPC 通道：** `project:load` / `project:save` / `project:discover` / `projectMgr:remove` / `projectMgr:delete` / `projectMgr:rename`

## 3 进程管理

**核心逻辑（ProcessManager）：**

- `spawnProc(cmd, cwd)` — 启动子进程，自动检测编码（UTF-8 / GBK）
- `killProc(idx)` / `killProcByPath(path)` — 终止进程树
- `killPort(port)` — 查找并终止占用端口的进程（`netstat -ano`）
- `getRunningInfo()` — 返回所有运行中项目列表
- 输出日志经 50ms 缓冲后批量推送到渲染进程（`event:outputBatch`）
- 项目启动/停止时自动创建通知

**输出与错误汇聚：**

- **ProcessOutputPanel（输出面板）**：子进程 stdout/stderr 经 `execAsyncStream` → `outputLine` → 50ms 缓冲批量推送（`event:outputBatch`），直接 DOM 渲染绕开 Vue 响应式。
- **AppMessagePanel（日志面板）**：前端错误和系统消息通过 `event:output` 推送，按 type 着色（error 红色 `[报错]`、warning `[警告]`、info `[信息]`）。

| 来源 | 目标面板 | 汇聚路径 |
|------|----------|----------|
| 子进程 stdout/stderr | ProcessOutputPanel | `execAsyncStream` → `outputLine` → 50ms 批量发送 |
| 任务失败（构建/VCS/清理等） | AppMessagePanel | `taskFailed` 全局监听 → `event:output` type=error |
| 脚本/任务执行失败 | AppMessagePanel | `process.handler` → `event:output` type=error |
| 前端 `useError()` | AppMessagePanel | `systemLog('error')` → `event:output` type=error |
| 主进程未捕获异常 | AppMessagePanel | `uncaughtException` / `unhandledRejection` → `event:output` type=error |

新增耗时操作时，只需通过 `TaskService.addTask()` 执行并在失败时抛出带描述信息的 Error，错误会自动出现在 AppMessagePanel。

**IPC 通道：** `process:start` / `process:stop` / `process:killPort` / `process:stopAll` / `process:getRunningInfo`

## 4 VCS（版本控制）

**支持类型：** SVN（完整实现）、Git（骨架）

**操作：**

- 更新（单个/范围）：`vcs:update` / `vcs:updateRange`，后台任务异步执行
- 日志查看：`vcs:log`，优先打开 GUI（TortoiseSVN / Git GUI）
- 检查远程变更：`vcs:checkRemote`，对比远程版本
- 检查本地变更：`vcs:checkLocal`，检测未提交文件
- 版本信息：`vcs:revisionInfo`，返回本地和远程版本号
- 迁移：`vcs:migrate`，支持 SVN 换仓库 / Git 换仓库 / 目录复制
- 检测：`vcs:detect` / `vcs:detectBatch`，按 `.svn` / `.git` 目录识别

**定时巡检：**

- 远程检查间隔（默认 30 分钟，可通过设置调整）
- 本地检查间隔（默认 15 分钟，可通过设置调整）
- 检测到变更时自动创建通知
- 应用启动时从设置恢复定时检查

## 5 构建/清理/安装

**构建（BuildDialog）：**

- 根据项目类型（npm/maven）决定构建命令
- Maven：`mvn clean package [-Dmaven.test.skip=true]`，可选 ZIP 打包
- npm：`npm run build`，可选 ZIP 打包
- 流式输出实时显示在构建对话框
- 后台任务执行

**清理（CleanDialog）：**

- 扫描构建产物（target/dist 目录、jar/war 文件）
- 支持清理依赖目录（node_modules / .m2 等）
- 多项可选清理

**安装（InstallDialog）：**

- Maven：`mvn install`，跳过测试
- npm：`npm install`
- 流式输出

## 6 代理配置

**支持工具：** Vite（`vite.config.ts`）和 Vue CLI（`vue.config.js`）

**功能：**

- 自动检测项目根目录的代理配置文件
- 解析 proxy 配置块，展示代理路径和目标地址
- 支持修改目标地址（单条或批量）
- 支持环境变量（`.env`）中的代理配置

## 7 任务管理

**TaskManager：** 串行执行的后台任务队列。任务逐个执行，支持进度上报、错误报告、取消。

```
addTask(name, executor) -> taskId
executor: async (report: (message, progress?) => void) => void
```

- 任务进度通过 `event:taskProgress` 实时推送
- 任务完成/失败后自动清理
- 渲染进程通过 `TaskPanel` 显示任务列表和进度

## 8 通知系统

**NotificationService：** 持久化到 `notifications.json` 文件。

**通知类型：**

| 类型          | 触发时机             |
| ------------- | -------------------- |
| vcs_remote    | 远程有更新           |
| vcs_conflict  | 更新合并冲突         |
| local_changes | 本地有未提交变更     |
| info          | 项目启动、构建完成等 |
| warning       | 项目停止、进程异常   |
| error         | 任务失败、更新失败   |

- 支持已读/未读状态
- 支持清空和全部标记已读
- 新通知通过 `event:notificationCreated` 实时推送

## 9 设置系统

**数据流：**

```
settings_schema.json 定义默认值
  → AppSettings 读取并构造配置对象
    → settings.json 持久化
      → Vue 通过 getSetting(key) 读取
        → 设置对话框通过 getSettingsSchema() 渲染 UI
```

**设置分类：** 平台连接、代理、Maven、SVN/Git、VCS 定时检查、更新等

**条件显隐：** 设置项通过 `dependsOn` 字段控制显隐，当父设置项为 true 时显示子项。

## 10 数据目录

```
%APPDATA%/项目管理器/
├── assets/
│   ├── settings.json          AppSettings 持久化
│   ├── settings_schema.json   设置定义（控制 UI 表单）
│   ├── sources.json           项目源注册表
│   ├── projects.json          当前源的项目配置
│   ├── notifications.json     通知记录
├── .version                   版本标记（检测升级时同步模板）
```

打包后路径：

```
packaged app/
└── resources/
    └── assets/           默认模板/设置
```
