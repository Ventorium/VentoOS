# VentoOS

## 项目名称

VentoOS

## 项目目标

VentoOS 是一个运行在本机、通过浏览器承载交互的 WebOS，面向运维与基础设施管理场景，统一提供 Kubernetes、数据库、Redis、资源管理器和 AI Agent 能力。

当前阶段目标：

* 建立 `web/` 前端桌面壳与应用框架。
* 建立 `native/` Rust Core 基础工程。
* 以本地优先、性能优先、安全默认为前提，逐步实现需求文档中的核心能力。

## 需求文档

核心需求入口：

* `docs/requirements/01-core/README.md`

关键专题文档：

* `docs/requirements/01-core/ventoos-prd.md`
* `docs/requirements/01-core/ventoos-architecture.md`
* `docs/requirements/01-core/ventoos-system-design.md`
* `docs/requirements/01-core/ventoos-ui.md`
* `docs/requirements/01-core/ventoos-ai.md`
* `docs/requirements/01-core/ventoos-k8s.md`
* `docs/requirements/01-core/ventoos-database.md`
* `docs/requirements/01-core/ventoos-redis.md`
* `docs/requirements/01-core/ventoos-vfs.md`
* `docs/requirements/01-core/ventoos-service-connectivity.md`

## 开发原则

* 本地优先：凭据、缓存、任务历史、索引默认保存在本机。
* 性能优先：高频 I/O、连接池、隧道、日志流、文件传输必须优先在 Rust Core 侧完成。
* 统一抽象：连接、资源、任务、通知、窗口、挂载点、Agent Tool 使用统一模型。
* 安全默认：高风险写操作必须确认，敏感凭据不得以明文直接暴露到前端。
* 可恢复：窗口、应用上下文、任务与草稿状态应支持恢复。

## 技术架构

### 五层架构

1. **WebOS Shell**（React）：桌面、窗口管理、Dock、顶部栏、通知中心、任务中心、AI 入口。
2. **Application Layer**（React）：K8s App、Database App、Redis App、Explorer App、AI Assistant App。
3. **System Capability Layer**：连接管理、会话管理、资源图谱、VFS、端口转发/隧道、任务引擎、通知中心、Tool 注册。
4. **Runtime Core**（Rust/Axum）：高性能 I/O、协议适配、任务执行、安全隔离、状态持久化。
5. **External Providers**：Kubernetes、Teleport、PostgreSQL/MySQL/SQLite、Redis、SSH/SFTP/FTP/SMB/S3、Agent 引擎。

### 前后端通信

* **HTTP REST**：CRUD 操作、配置、连接管理、一次性查询。
* **WebSocket**：实时流（日志、watch、任务进度、通知、Agent 流式输出）。
* **JSON**：统一序列化格式。
* 开发时前端 `vite dev` 通过 proxy 转发到 Rust 服务端口 `8080`。
* 发布时前端 `vite build` 产物通过 `rust-embed` 嵌入 Rust 二进制。

## 编码规范

### 前端技术栈

* **框架**：React 19 + TypeScript 5.9 + Vite 8
* **状态管理**：Zustand 5
* **UI 组件库**：Ant Design 6（应用内复杂组件）
* **动画**：Framer Motion 12
* **样式**：UnoCSS + CSS Variables (design tokens)
* **图标**：Lucide React
* **代码编辑器**：Monaco Editor（YAML/SQL/JSON 编辑）
* **终端**：xterm.js（Shell/Exec）
* **工具库**：ahooks、es-toolkit、dayjs、clsx、tailwind-merge
* **代码规范**：Biome
* **测试**：Vitest + React Testing Library

### 前端编码规则

* 使用函数组件和 hooks。
* 优先使用清晰的模块边界，避免超大组件。
* 样式优先使用设计 token、CSS Variables 和统一主题，不随意硬编码。
* UI 实现必须贴近需求文档中的 WebOS 风格，不退化为普通后台页面。
* 窗口管理、应用注册、桌面状态使用 Zustand store。
* 不使用传统路由导航应用；WebOS 中只有 `/auth/login` 和 `/`（桌面）两个路由。
* 应用通过窗口管理器打开，不通过 URL 路由。

### Rust 技术栈

* **Web 框架**：Axum 0.8
* **异步运行时**：Tokio
* **序列化**：serde + serde_json
* **持久化**：SQLite (rusqlite)
* **Kubernetes**：kube-rs
* **数据库客户端**：sqlx（PostgreSQL/MySQL/SQLite）
* **Redis**：redis-rs
* **SSH/SFTP**：russh
* **前端嵌入**：rust-embed
* **日志**：tracing + tracing-subscriber
* **错误处理**：thiserror + anyhow
* **ID 生成**：uuid
* **时间**：chrono
* **密码/凭据**：keyring
* **中间件**：tower、tower-http（CORS、日志、静态文件）

### Rust 编码规则

* 使用稳定 Rust（edition 2024）。
* 默认开启严格 lint，保持 `cargo fmt` 和 `cargo clippy` 通过。
* 模块职责单一，避免把协议层、领域层、应用层混杂在一个文件。
* 所有 I/O、连接、隧道、任务执行逻辑优先放在 Rust Core。
* 错误处理使用明确的错误类型和可读错误信息，避免 `unwrap()` 滥用。
* 所有公开 API 使用 `#[derive(Serialize, Deserialize)]` 保证 JSON 互通。

## 测试规范

* 测试优先。新增模块、功能和行为变更默认先补测试再实现。
* 前端使用 Vitest + React Testing Library。
* Rust 模块必须优先编写单元测试，必要时增加集成测试。
* 没有测试或测试未通过，不应宣称模块完成。
* 每个模块开发完成后，必须先确保相关测试通过，再执行 `git commit`，然后 `git push`。
* 前端测试命令：`cd web && pnpm test`
* Rust 测试命令：`cd native && cargo test`

## Git 规范

* 提交信息使用 Conventional Commits，例如 `feat: ...`、`fix: ...`、`docs: ...`、`chore: ...`。
* 一个提交只做一类相对完整的变更，避免把无关修改混在一起。
* 在提交前执行该模块对应的最小验证命令。
* 每个模块开发测试通过后要提交 Git 并推送远端。

## 目录结构

```text
.
├── CLAUDE.md
├── AGENTS.md -> CLAUDE.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   └── requirements/
├── web/
│   ├── src/
│   │   ├── main.tsx                  # 入口
│   │   ├── App.tsx                   # 根组件（路由: /auth/login | / 桌面）
│   │   ├── theme.ts                  # 设计 tokens 与主题
│   │   ├── types.ts                  # 全局类型
│   │   ├── api/                      # Rust 后端 API 客户端
│   │   ├── assets/styles/            # 全局样式
│   │   ├── components/               # 通用组件
│   │   │   ├── Desktop/              # 桌面区域（壁纸、桌面图标）
│   │   │   ├── TopBar/               # 顶部系统栏
│   │   │   ├── Dock/                 # 底部 Dock 栏
│   │   │   ├── WindowManager/        # 窗口管理器
│   │   │   ├── Window/               # 窗口组件（拖拽、缩放、交通灯）
│   │   │   ├── NotificationCenter/   # 通知中心
│   │   │   ├── TaskCenter/           # 任务中心
│   │   │   ├── CommandPalette/       # 全局命令面板
│   │   │   └── ...
│   │   ├── apps/                     # 应用模块
│   │   │   ├── kubernetes/           # K8s App
│   │   │   ├── database/             # 数据库 App
│   │   │   ├── redis/                # Redis App
│   │   │   ├── explorer/             # 资源管理器 App
│   │   │   └── ai-assistant/         # AI 助手 App
│   │   ├── store/                    # Zustand 状态管理
│   │   │   ├── desktop.ts            # 桌面状态（壁纸、主题）
│   │   │   ├── window.ts             # 窗口状态（位置、层级、焦点）
│   │   │   ├── app.ts                # 应用注册与实例
│   │   │   ├── task.ts               # 任务中心状态
│   │   │   ├── notification.ts       # 通知中心状态
│   │   │   ├── connection.ts         # 连接管理状态
│   │   │   └── ...
│   │   ├── hooks/                    # 自定义 hooks
│   │   └── lib/                      # 工具函数
│   ├── public/
│   │   └── wallpapers/               # 默认壁纸
│   └── package.json
└── native/
    ├── Cargo.toml                    # Workspace 根
    └── crates/
        ├── ventoos-server/           # 主程序：Axum HTTP/WS 服务、静态文件嵌入
        ├── ventoos-core/             # 核心类型：Connection、Session、Resource、Task、Notification
        ├── ventoos-connection/       # 连接管理：池、健康检查、生命周期
        ├── ventoos-k8s/              # Kubernetes 适配器
        ├── ventoos-db/               # 数据库适配器（PostgreSQL/MySQL/SQLite）
        ├── ventoos-redis/            # Redis 适配器
        ├── ventoos-vfs/              # 虚拟文件系统
        ├── ventoos-task/             # 任务引擎
        ├── ventoos-agent/            # AI Agent Bridge
        └── ventoos-persist/          # 持久化层（SQLite 本地存储）
```

目录约定：

* `docs/`：需求、架构、设计与开发文档。
* `web/`：WebOS 前端桌面壳、应用 UI、状态管理、样式系统。
* `web/src/components/`：WebOS Shell 级组件（桌面、窗口、Dock、TopBar 等）。
* `web/src/apps/`：各业务应用模块（K8s、DB、Redis、Explorer、AI）。
* `web/src/store/`：Zustand 全局状态。
* `native/`：Rust Core、系统能力、协议适配、任务系统、Agent Bridge。
* `native/crates/ventoos-server/`：主入口，HTTP/WS 服务器。
* `native/crates/ventoos-core/`：跨 crate 共享的核心类型与 trait。

## 里程碑

### M1：系统骨架（当前）

* WebOS Shell：桌面、Dock、窗口系统、TopBar、通知中心、任务中心、AI 入口。
* Rust Core：Axum 服务、核心类型、连接管理、任务系统基础、SQLite 持久化。
* 前后端通信层：HTTP REST + WebSocket。
* 应用骨架：K8s、DB、Redis、Explorer、AI 5 个应用的基础框架。
* CI/CD：GitHub Actions。

### M2：核心工具可用

* Kubernetes App MVP：多集群、资源总览、Workloads、Config、Network、Storage、日志、终端。
* Database App MVP：连接管理、对象浏览、SQL 工作区、数据维护。
* Redis App MVP：连接管理、Key 浏览、Value 编辑、命令执行。
* Explorer App MVP：VFS 挂载、Finder 风格文件浏览。

### M3：跨模块联动

* K8s → DB/Redis 一键直连。
* 任务中心与通知中心联动。
* AI 跨应用操作闭环。

## 开发顺序

1. 更新 CLAUDE.md（技术规范与约定）。
2. 搭建 Rust Core workspace 与 Axum 服务骨架。
3. 重构前端为 WebOS Shell（桌面、窗口管理器、Dock、TopBar）。
4. 建立前后端通信协议（HTTP REST + WebSocket）。
5. 实现连接中心、任务中心基础。
6. 实现 K8s、数据库、Redis、Explorer、AI 5 个应用骨架。
7. 补充 CI/CD 配置。
8. 逐步完善各模块 MVP 能力。

## 常用命令

```bash
# 前端
cd web && pnpm install        # 安装依赖
cd web && pnpm dev            # 启动开发服务
cd web && pnpm build          # 构建生产版本
cd web && pnpm test           # 运行测试
cd web && pnpm lint:all       # 代码检查

# Rust
cd native && cargo build      # 编译
cd native && cargo test       # 运行测试
cd native && cargo clippy     # Lint
cd native && cargo fmt        # 格式化
cd native && cargo run -p ventoos-server  # 启动服务

# 全量构建（Release）
cd web && pnpm build          # 先构建前端
cd native && cargo build --release  # 再构建 Rust（会嵌入前端产物）
```

## 沟通规则

* 任何实现都应优先对齐本目录下需求文档。
* 如果需求文档之间冲突，以更细的专题文档为准；若仍冲突，先补文档再开发。
* 若某项实现超出当前里程碑，应先提出拆分方案，不直接扩散范围。
