# IPC 通信、配置与持久化

## 1 IPC 通信

### 1.1 通信模型

```
渲染进程（Vue）                          主进程（electron/）
  │                                        │
  │  ipcRenderer.invoke('xxx')             │
  ├───────────────────────────────────────►│  handler 中调用服务方法
  │                                        │
  │  ◄─────────────────────────────────────│  返回结果
  │                                        │
  │  ipcRenderer.on('event:xxx')           │
  │  ◄─────────────────────────────────────│  服务 emit 事件 → main.ts 转发
  │                                        │
```

### 1.2 IPC 命名约定

`领域:动作`：

| 前缀                     | 用途                                        |
| ------------------------ | ------------------------------------------- |
| `project:*` / `source:*` | 项目和项目源增删改查                        |
| `projectMgr:*`           | 项目管理业务（启停/构建/任务）              |
| `process:*`              | 子进程管理                                  |
| `vcs:*`                  | 版本控制                                    |
| `proxy:*`                | 代理配置                                    |
| `settings:*`             | 设置                                        |
| `update:*`               | 更新                                        |
| `task:*`                 | 后台任务                                    |
| `notification:*`         | 通知                                        |
| `system:*`               | 系统工具（JDK/Maven/Tomcat 检测、目录选择） |
| `output:*`               | 日志输出                                    |
| `event:*`                | 主进程→渲染进程事件推送                     |
| `menu:event`             | 菜单事件                                    |

### 1.3 Preload 分组

每个 API 分组独立定义，最后合并暴露：

```typescript
const projectApi = {
  loadProjects: (configPath) => ipcRenderer.invoke('project:load', configPath),
  // ...
}

const electronAPI: IpcApi = { ...projectApi, ...processApi, ...vcsApi, ...eventsApi }
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
```

### 1.4 事件监听清理

```typescript
function onEvent<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_e: any, data: T) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
```

在 `onUnmounted` 中必须调用清理函数，防止 HMR/重挂时 listener 叠加。清理函数统一存入 `(window as any).__homeCleanups` 数组。

### 1.5 限制

- Vue 响应式对象不直接过 IPC，须 `JSON.parse(JSON.stringify(v))` 脱敏
- HTTP POST 响应空 body 时返回 null，不抛解析异常
- 退出时 `projectService?.stopAll()` 确保子进程清理
- 输出日志 50ms 缓冲批量发送，避免高频刷新

## 2 配置文件

### 2.1 settings_schema.json

三层：分类(key) → 分组(groups) → 设置项(settings)

```json
{
  "key": "connection",
  "label": "平台连接",
  "groups": [
    {
      "label": "代理设置",
      "settings": [{ "key": "proxy.enabled", "label": "启用代理", "type": "checkbox", "default": false }]
    }
  ]
}
```

控件类型：`text` / `checkbox` / `combo` / `spinbox` / `number` / `directories`

条件显隐：`dependsOn` 字段控制。

### 2.2 配置项设计原则

新功能先问：这个值在不同用户/场景会不会不一样？

- 会 → 做配置项，schema 加定义
- 不会但将来可能 → 做配置项
- 架构决策、安全开关 → 不做配置项

添加步骤：

1. `assets/settings_schema.json` 加字段定义
2. 代码中 `settings.get(key, default)` 读取
3. Vue 中 `window.electronAPI.getSetting(key)` / `setSetting(key, value)` 读写

### 2.3 AppSettings key 存取规则

key 用 `.` 分隔层级，映射到 `settings.json` 的嵌套对象：

```
scheduled_checks.remote_enabled = true
  → { "scheduled_checks": { "remote_enabled": true } }

proxy.ssl_port = 443
  → { "proxy": { "ssl_port": 443 } }
```

等效于 `lodash.get` / `lodash.set` 的按路径存取。

**主进程（AppSettings 类）：**

```ts
// 读取，不存在返回默认值
const port = settings.get('proxy.port', '8080')
const flag = settings.get('scheduled_checks.remote_enabled', false)

// 写入，中间对象自动创建
settings.set('scheduled_checks.remote_interval_minutes', 30)

// 删除
settings.delete('proxy.old_field')

// 检查是否存在
const exist = settings.has('theme')

// 获取完整配置对象（用于持久化）
const all = settings.getAll()
```

**渲染进程（IPC 封装）：**

```ts
// 读取
const enabled = await window.electronAPI.getSetting('scheduled_checks.remote_enabled')

// 写入
await window.electronAPI.setSetting('theme', 'dark')
```

**新增配置项只需三步：**

1. `settings_schema.json` 加字段定义（类型、默认值、描述）
2. 主进程用 `settings.get(key, default)` 读取
3. 渲染进程用 `electronAPI.getSetting(key)` / `setSetting(key, value)` 读写

### 2.4 数据流

```
schema 定义 default → AppSettings 构造默认值 → settings.json 持久化 → Vue getSetting(key) → 设置对话框
```

## 3 持久化方案

所有持久化数据存储在 `%APPDATA%/项目管理器/` 目录下，由 `DataDirService` 统一管理。

### 3.1 目录结构

```
%APPDATA%/项目管理器/
├── assets/
│   ├── settings.json          应用设置（AppSettings 管理）
│   ├── settings_schema.json   设置字段定义（模板同步）
│   ├── sources.json           项目源注册表（SourceManager 管理）
│   ├── projects.json          项目配置列表（ProjectRepository 管理）
│   └── notifications.json     通知记录（NotificationService 管理）
├── store/
│   └── {key}.json             通用数据存储（每个 key 一个文件）
└── .version                   版本标记（用于模板同步升级）
```

### 3.2 持久化文件清单

| 文件                        | 管理方式                                                 | IPC 通道                    | 适用场景                                  |
| --------------------------- | -------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| `assets/settings.json`      | `AppSettings` 类，构造时自动加载，变更时自动保存         | `settings:get/set`          | 用户可配置参数，schema 定义               |
| `assets/sources.json`       | `SourceManager` 类，构造时自动加载，变更时自动保存       | `source:*`                  | 项目源注册表（增删改查/切换）             |
| `assets/projects.json`      | `ProjectRepository` 静态类，显式调用 `load/save`         | `project:*`                 | 项目配置列表（CRUD）                      |
| `assets/notifications.json` | `NotificationService` 类，构造时自动加载，变更时自动保存 | `notification:*`            | 通知记录（持久化 + 已读状态）             |
| `store/*.json`              | 通用 Store 服务，每个 key 对应一个独立 JSON 文件         | `store:get/set/delete/keys` | 运行时产生的非配置型数据                  |

### 3.3 管理方式

每个服务采用"服务自治"模式：构造时从磁盘 `load()` 加载数据到内存，数据变更时调用 `save()` 写回磁盘。典型模式：

```ts
class SomeService {
  private data: any

  constructor(filePath: string) {
    this.filePath = filePath
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    this.data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  doSomething(): void {
    // 修改 this.data
    this.save()
  }
}
```

### 3.4 新增持久化判断准则

新增持久化需求时，按以下顺序判断：

1. **是否为用户可配置的参数？** → 写入 `settings.json`，在 `settings_schema.json` 中注册字段定义
2. **是否为项目管理领域数据（项目/源/通知）？** → 写入对应服务管理的 JSON 文件（projects.json / sources.json / notifications.json）
3. **以上都不是，但需要重启后保留？** → 写入 `store`，通过 `storeGet/storeSet/storeDelete/storeKeys` IPC 操作

### 3.5 Store 用法

通用存储 (`store/*.json`) 适用于运行时产生的非配置型数据，如页面上次操作日期、缓存的时间戳等。通过渲染进程的 `electronAPI` 调用：

```ts
// 写入
await window.electronAPI.storeSet('lastOpDate_pageName', '2026-07-25')

// 读取，不存在返回 null
const lastDate = await window.electronAPI.storeGet('lastOpDate_pageName')

// 删除
await window.electronAPI.storeDelete('lastOpDate_pageName')

// 列出所有已存储的 key
const keys = await window.electronAPI.storeKeys()
```

### 3.6 不推荐的方案

- **localStorage**：仅渲染进程可访问、容量有限（5-10MB）、无法原子写入、易被清除，不适用于本项目。
- **Electron session storage**：与渲染进程绑定，重启即丢失。

## 4 数据流示例

### 项目启动流程

```
用户点击启动
  → renderer: electronAPI.startProject(idx, cmd)
  → ipcMain.handle('process:start')
    → ProjectManagerService.start(idx, cmd)
      → resolveStartCommand(projectType, path)
      → ProcessManager.spawnProc(cmd, path)
      → ProcessManager.startOutputThread()
        → 输出行 → emit('outputLine')
          → main.ts: outputBuffer → batch send (50ms)
          → renderer: event:outputBatch
```

### VCS 定时检查

```
main.ts → autoStartVcsChecks() → vcs.handler.ts
  → startRemoteCheckTimer(interval)
    → setInterval → vcsRegistry.detect(path)
      → SvnProvider.checkRemote
      → GitProvider.checkRemote
    → 有更新？ → notificationService.createNotification('vcs_remote', ...)
      → renderer: event:notificationCreated
```
