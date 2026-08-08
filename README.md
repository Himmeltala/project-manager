# 项目管理器

基于 Electron + Vue 3 + Vite + TypeScript 的 Windows 桌面工具，用于管理多个项目的启动、停止、构建、版本控制操作。支持 npm（Node.js）和 Maven（Java）项目。

## 功能

### 项目管理

- 添加、删除、刷新项目源（支持多源切换，每个源独立配置文件）
- 启动 / 停止项目（自动检测项目类型选择启动命令）
- 双击项目行切换启停状态
- 交互式多选启动
- 打开项目文件夹、重命名项目
- 移除项目（仅从列表移除，不删除文件）
- 物理删除（从磁盘删除项目文件）

### 构建与依赖

- 构建项目并自动压缩 `dist` / `target` 目录为 ZIP
- 安装依赖（`npm install` / `mvn dependency:resolve`）
- 清理构建产物（dist / target 目录 + ZIP 文件）
- 清理依赖目录（node_modules / target）
- 扫描项目的 npm scripts / Maven 任务并通过菜单直接运行

### 版本控制

- 支持 SVN 和 Git（通过抽象接口扩展）
- 单项目获取更新
- 批量范围更新（冲突不阻塞，末尾汇总）
- 查看提交历史 / 提交 GUI / 日志 GUI
- 远程状态检查（远程是否有新提交）
- 本地状态检查（本地是否有未提交变更）
- 项目迁移（SVN clone / Git clone / 普通复制）

### 定时检查

- 定时远程检查（检测远程仓库新提交）
- 定时本地检查（检测本地未提交变更）
- 通知去重（同类型未读通知不重复提醒）

### 搜索与筛选

- 文本搜索（项目名称 + 路径）
- 支持正则表达式、区分大小写、全词匹配
- 状态筛选（已启动 / 未启动）
- 跨源搜索（"所有源"模式）

### 主题与界面

- 暗色 / 亮色主题切换（基于 Element Plus）
- 项目名称彩色标识
- 可折叠的日志输出面板（含进程实时输出）
- 后台任务进度指示器
- 通知面板（版本变更提醒）

### 代理配置管理

- 自动检测 Nginx 反向代理配置文件
- 可视化查看和切换代理目标地址
- 支持 `.env` 环境变量中的连接信息

### 后台任务

- 构建、版本控制更新、迁移等耗时操作在后台执行
- 状态栏显示任务进度，可点击查看详情

## 技术栈

| 技术 | 用途 |
| --- | --- |
| Electron | 桌面应用框架 |
| Vue 3 | 前端 UI 框架 |
| Vite | 构建工具 |
| TypeScript | 语言 |
| Element Plus | UI 组件库 |
| Pinia | 状态管理 |
| Vue Router | 路由 |

## 项目结构

```
项目管理器/
├── src/                       # 前端代码
│   ├── components/            # Vue 组件
│   ├── dialogs/               # 对话框组件
│   ├── views/                 # 页面视图
│   ├── stores/                # Pinia 状态管理
│   ├── types/                 # TypeScript 类型定义
│   ├── composables/           # 组合式函数
│   ├── router/                # 路由配置
│   ├── App.vue                # 根组件
│   └── main.ts                # 前端入口
├── electron/                  # 后端代码
│   ├── main.ts                # Electron 主进程入口
│   ├── preload.ts             # 预加载脚本
│   └── services/              # 业务逻辑
│       ├── project.service.ts         # 项目操作门面（启停/构建/VCS）
│       ├── project-repository.service.ts # 项目配置 CRUD
│       ├── process-manager.service.ts # 子进程管理
│       ├── project-type/      # 项目类型抽象（npm / maven）
│       ├── vcs/               # VCS 抽象（svn / git）
│       ├── build-tool/        # 构建工具适配器（webpack/vite/rspack）
│       ├── proxy-config/      # 代理配置适配器
│       ├── port-config/       # 端口配置适配器
│       ├── notification.service.ts
│       ├── settings.service.ts
│       ├── tool-discovery.service.ts # 工具发现（JDK/Maven/Tomcat）
│       └── source-manager.service.ts
├── assets/                    # 数据文件（模板 + 运行时生成）
│   ├── about.md
│   ├── settings.json          # 应用设置
│   ├── settings_schema.json   # 设置界面配置
│   └── sources.json           # 项目源注册表
└── .dev/                      # 开发用示例数据
```

## 开发

### 安装

```bash
npm install
```

### 运行（热重载）

```bash
npm run dev
```

### 构建

```bash
# 构建前端 + 打包 Electron
npm run build

# 仅构建前端
npm run build:renderer
```

## 架构

```
前端 (Vue 3)                   后端 (Electron Main)
─────────────                  ──────────────────
  Vue 组件                        IPC Handlers
    │                                │
  Pinia Store  ◄── preload.ts ──── Services
    │                     │          ├── ProjectManagerService
  Element Plus UI          │          ├── ProcessManager
                           │          ├── VcsRegistry (SVN / Git)
                           │          ├── ProjectTypeRegistry (npm / Maven)
                           │          ├── NotificationService
                           │          ├── TaskManager
                           │          └── SourceManager
                           │
                    contextBridge (安全 IPC)
```

### 设计特点

- **VCS 抽象**：`VcsProvider` 接口抽象版本控制操作，已内置 SVN 和 Git 实现，通过 `vcsRegistry` 注册和检测
- **项目类型抽象**：`ProjectTypeProvider` 接口抽象项目类型行为，已内置 npm 和 Maven 实现
- **设置系统**：点号嵌套的 Key-Value 存储，自动持久化
- **通知去重**：同类型 + 同项目的未读通知自动去重

## 打包

构建产物输出到 `dist/` 目录：

```bash
# 一键打包
npm run build
```

## 分发

- 使用 Electron Builder 打包为 Windows 安装程序
- 内置自动更新功能（局域网更新服务器）
