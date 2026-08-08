# 架构设计

## 1 项目概述

项目管理器（Project Manager）是一个基于 Electron + Vue 3 的桌面工具，用于集中管理本地开发项目。核心业务：

- 项目源管理：多源切换、目录扫描发现、配置 CRUD
- 进程管理：启动/停止项目进程、端口占用检测与释放、子进程输出日志
- 版本控制：SVN/Git 更新、提交、日志查看、远程/本地变更检查、定时巡检
- 构建部署：Maven/npm 构建、打包、安装、产物清理
- 代理配置：解析和修改 Vite/Vue CLI 的 proxy 配置
- 任务管理：后台任务队列、进度上报、失败通知
- 通知系统：VCS 变更提醒、构建完成、任务失败等持久化通知

## 2 架构分层

### 2.1 整体架构

```
src/                    Vue 渲染进程（界面 + 交互逻辑）
  views/                页面组件
  stores/               Pinia 状态管理
  dialogs/              全局弹窗
  types/                TypeScript 类型定义
  api/bridge.ts         electronAPI 访问入口

electron/               主进程（Node.js 业务逻辑）
  handlers/             IPC handler 注册（纯路由，转发到 services）
  services/             业务逻辑层（含 EventEmitter 事件通知）
  main.ts               应用入口：窗口管理 + 服务组装 + 事件转发
  preload.ts            contextBridge 安全桥接
```

### 2.2 分层职责

**入口层（main.ts）：**

- 创建 BrowserWindow，加载 `dist/index.html`（生产）或 Vite 开发服务器
- 组装所有服务（initServices）并转发服务事件到渲染进程
- 注册所有 IPC handler
- 菜单栏构建与管理
- 单实例锁防止重复启动

**桥接层（preload.ts）：**

- 按领域分组定义 API（projectApi / processApi / vcsApi / proxyApi / settingsApi / taskApi / systemApi / eventsApi）
- 所有 IPC 通信走 `ipcRenderer.invoke`（请求-响应）或 `ipcRenderer.on`（事件推送）
- 事件监听器返回清理函数，防止组件重挂时重复注册

**服务层（services/）：**

| 服务                  | 职责                                                    | 依赖                              |
| --------------------- | ------------------------------------------------------- | --------------------------------- |
| AppSettings           | JSON 配置读写，嵌套 key 存取，自动设置默认值            | 无                                |
| ProcessManager        | spawn/terminate 子进程，端口检测，编码检测              | 无                                |
| ProjectRepository     | 项目配置 CRUD，目录扫描发现                             | 无                                |
| SourceManager         | 多项目源管理（切换/增删/目录扫描），持久化 sources.json | ProjectRepository                 |
| ProjectManagerService | 项目启停、构建打包、Maven 构建+Tomcat 部署、VCS 操作    | ProcessManager, ProjectRepository |
| TaskManager           | 串行后台任务队列，进度/取消/日志                        | 无                                |
| NotificationService   | 通知持久化，按类型过滤，重复抑制                        | 无                                |
| UpdateService         | HTTP(S) 更新检查，文件列表/HEAD 探测，带进度下载        | 无                                |
| ProxyConfigService    | 解析/修改 Vite/Vue CLI 的 proxy 配置块                  | 无                                |
| DataDirService        | 数据目录初始化，模板/设置文件首次同步                   | 无                                |

**Handler 层（handlers/）：**

- 纯路由，每个 handler 文件对应一组 IPC 通道
- 从 `HandlerContext` 获取服务实例并调用
- 不包含业务逻辑

### 2.3 提供者模式（策略模式）

通过接口+注册表实现策略模式，业务代码按名称或路径自动匹配提供者，不出现 `if/switch` 类型判断分支。

**核心约定：**

- 每个提供者实现统一接口，定义在领域目录的 `index.ts` 中
- 所有提供者注册到全局单例的 Registry 类，通过 `register()` 注入
- 业务代码通过 Registry 查找，不直接 new 具体提供者
- 新增提供者只需新建文件 + 在 `index.ts` 中 `register()` 调用，不修改已有代码

#### ProjectTypeRegistry（`electron/services/project-type/`）

检测项目类型（npm/Maven），提供对应命令模板与任务列表：

```
interface ProjectTypeProvider {
  type: string                    // 'npm' | 'maven'
  label: string                   // 显示名称
  detect(path): boolean           // 检查特征文件（package.json / pom.xml）
  getProfile(): CommandProfile    // 命令模板、构建输出目录、清理目录
  resolveStartCommand(path?): string
  readArtifactName?(path): string | null
  getTaskList?(path): TaskInfo | null
}
```

#### VcsRegistry（`electron/services/vcs/`）

提供 VCS（SVN/Git）操作抽象：

```
interface VcsProvider {
  name: string
  label: string
  isProject(path): boolean
  update(path): VcsUpdateResult
  log(path, limit?): boolean
  getInfo(path): VcsInfo | null
  checkRemote(projects): VcsCheckResult[]
  checkLocal(projects): VcsCheckResult[]
  openCommitGui?(path): boolean
  openLogGui?(path): boolean
  openRepoBrowser?(path): boolean
  getRevisionInfo?(path): VcsRevisionInfo | null
}
```

#### 注册表实现模式

```ts
class RegistryImpl {
  private providers: Map<string, Provider> = new Map()

  register(provider: Provider): void {
    this.providers.set(provider.name, provider)
  }

  get(name: string): Provider | undefined {
    return this.providers.get(name)
  }

  detect(path: string): Provider | null {
    for (const provider of this.providers.values()) {
      if (provider.detect(path)) return provider
    }
    return null
  }
}

export const registry = new RegistryImpl()
// 注册内置提供者
registry.register(new SomeProvider())
```

所有注册表都是全局单例，在各自 `index.ts` 中创建并注册内置提供者。

### 2.4 适配器模式

在提供者模式之上，同一项目类型内部仍可能存在多种工具实现差异（如 npm 项目可能用 webpack/vite/rspack），此时通过适配器模式隔离，避免在命令执行模块中出现 `if/switch` 判断。

#### BuildToolAdapter（构建工具适配器）

npm 项目内细分构建工具的接口：

```
interface BuildToolAdapter {
  readonly name: string                // 'webpack' | 'vite' | 'rspack' | 'rollup'
  readonly label: string

  detect(path: string): boolean          // 检查特征文件/依赖
  getConfigFiles(): string[]             // webpack.config.js / vite.config.ts
  getDevCommand(): string                // 开发启动命令
  getBuildCommand(): string              // 生产构建命令
  getBuildOutputDir(): string            // dist / build / output
  getProxyConfig?(): ProxyConfig | null  // 代理配置解析
}
```

检测优先级规则：

1. 优先查 `package.json` 的 `devDependencies` 中命中唯一工具名
2. 辅助检查根目录特征配置文件
3. 无可疑包时标记为"未知"
4. 多工具共存时按优先级取最高者（webpack > vite > rollup > 其他）

#### 适配器目录结构

```
services/build-tool/
  index.ts               接口定义 + 工厂函数
  adapters/
    webpack.ts           webpack 适配器
    vite.ts              vite 适配器
    rspack.ts            rspack 适配器
```

#### 新增适配器步骤

1. 在 `adapters/` 下新建文件，实现 `BuildToolAdapter` 接口
2. 在 `index.ts` 的工厂函数中注册新适配器
3. 业务代码不修改 — 通过工厂获取适配器实例

#### Project 类型扩展规则

`Project` 接口不应为具体项目类型硬编码专有字段。新项目类型（Python、Go、Rust）的工具路径和环境配置应存储在 Provider 内部或通过统一扩展字段存取。

### 2.5 两种模式对比

|            | 注册表模式（提供者模式）                                     | 适配器模式                                           |
| ---------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| 适用场景   | 自家系统内部接口统一，多实现选一个                           | 对接外部异构系统，接口不统一需包装                   |
| 关注点     | 查找逻辑、匹配条件（按路径/名称选谁）                        | 接口设计、差异隔离（不同工具 API 统一）              |
| 接口来源   | 内部统一设计，所有实现签名一致                               | 外部工具自带接口，用 adapter 包成统一签名            |
| 项目示例   | `ProjectTypeRegistry` 选 npm/maven、`VcsRegistry` 选 svn/git | `BuildToolAdapter` 统一 webpack/vite/rspack          |
| 第三方示例 | 日志库选 console/file 输出                                   | Stripe `charge` / 微信 `unifiedOrder` → 统一 `pay()` |

## 3 启动流程

```
app.whenReady()
  → initServices()
    → 创建数据目录（ensureDataDir）
    → 读取版本号（app.getVersion()）
    → AppSettings 初始化（settings.json + schema）
    → 项目源初始化（sources.json，首次自动创建默认源）
    → 加载项目列表（projects.json）
    → 创建进程管理器（ProcessManager）
    → 创建项目管理器（ProjectManagerService）
    → 创建任务管理器（TaskManager）
    → 创建更新服务（UpdateService）
    → 创建通知服务（NotificationService）
  → createWindow()
    → setupMenu()
    → setupEventForwarding()   // 服务事件 → 渲染进程
    → setupHandlers()          // 注册所有 IPC handler
    → autoStartVcsChecks()     // 从设置恢复定时检查
    → updateService.startupCheck()
```

## 4 脚本与工具

| 命令                        | 用途                                         |
| --------------------------- | -------------------------------------------- |
| `npm run dev`               | Vite 开发模式                                |
| `npm run build`             | TypeScript 检查 + Vite 构建                  |
| `npm run pack`              | 构建 + Electron 打包 + 复制到 `E:/项目管理/` |
| `npm run make`              | 构建 + 制作安装包                            |
| `npm run clean`             | 清理 out 目录（带文件锁定重试）              |
| `npm run lint` / `lint:fix` | ESLint 代码检查                              |
| `npm run format`            | Prettier 格式化                              |
