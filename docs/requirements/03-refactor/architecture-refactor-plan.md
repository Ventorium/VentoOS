# VentoOS 全栈架构重构方案 v2

## 1. v1 方案自审与问题

v1 方案存在以下根本问题，本次 v2 全面修正：

| # | v1 问题 | v2 修正 |
|---|---------|---------|
| 1 | **EventBus 跨全部层级** — 一条总线贯穿 Layer 0-4，后期会成为 spaghetti events | 分三条独立通道：内核直调、系统通知、应用 IPC |
| 2 | **只设计了前端** — 后端架构几乎没涉及，而后端问题更严重 | 前后端对等设计，后端分层同等详细 |
| 3 | **未考虑应用独立性** — 无法支撑未来应用的安装/卸载/更新/数据保留 | 设计完整的应用包格式、数据隔离、生命周期 |
| 4 | **进程管理放在前端** — 前端的 process.ts 模拟进程，但真实资源（连接、watch、任务）在后端 | 后端拥有进程真相，前端只是窗口渲染状态 |
| 5 | **AppManifest 字段不足** — 缺少 version/author/homepage/thumbnails/permissions | 完善为可支撑应用商店的完整 manifest |

---

## 2. 全栈架构总览

VentoOS 是前后端一体的本地应用。架构必须前后端对等设计，以 Rust 后端为核心（持有真实资源），React 前端为展示层。

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Apps    │  │  Shell   │  │  Services    │  │  Kernel          │ │
│  │  (UI)   │  │  (桌面壳) │  │  (前端代理)   │  │  (窗口/应用管理)  │ │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  └──────┬───────────┘ │
│       │             │               │                  │             │
│       └─────────────┴───────────────┴──────────────────┘             │
│                              │                                       │
│                     ┌────────┴────────┐                              │
│                     │   Infra Layer   │                              │
│                     │  HTTP + WS 客户端│                              │
│                     └────────┬────────┘                              │
├──────────────────────────────┼───────────────────────────────────────┤
│              HTTP REST  /  WebSocket  /  SSE                         │
├──────────────────────────────┼───────────────────────────────────────┤
│                         BACKEND (Rust)                               │
│                     ┌────────┴────────┐                              │
│                     │  Server Layer   │                              │
│                     │  Axum 路由/中间件 │                              │
│                     └────────┬────────┘                              │
│       ┌─────────────┬───────┴───────┬──────────────┐                │
│  ┌────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐ ┌─────┴──────┐        │
│  │ Process  │ │ System    │ │ App         │ │ Persist    │        │
│  │ Manager  │ │ Services  │ │ Plugins     │ │ Layer      │        │
│  │ 进程管理  │ │ 连接/任务  │ │ K8s/DB/Redis│ │ SQLite     │        │
│  └──────────┘ └───────────┘ └─────────────┘ └────────────┘        │
│                     ┌────────┴────────┐                              │
│                     │   Core Layer    │                              │
│                     │  类型/Trait/错误  │                              │
│                     └─────────────────┘                              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. 后端架构设计

### 3.1 后端分层

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: App Plugins                                    │
│  ventoos-k8s, ventoos-db, ventoos-redis,                │
│  ventoos-vfs, ventoos-agent                              │
│  ── 各应用的后端逻辑，可独立编译 ──                        │
├─────────────────────────────────────────────────────────┤
│  Layer 2: System Services                                │
│  ventoos-process, ventoos-connection,                    │
│  ventoos-task, ventoos-auth, ventoos-notification        │
│  ── 系统级服务，管理进程/连接/任务/认证/通知 ──            │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Core                                           │
│  ventoos-core (types, traits, error)                     │
│  ventoos-persist (SQLite DAL, migrations)                │
│  ── 零业务逻辑的基础类型和持久化 ──                        │
├─────────────────────────────────────────────────────────┤
│  Layer 0: Server                                         │
│  ventoos-server (Axum, routing, middleware, WS, embed)   │
│  ── 组装所有层，暴露 HTTP/WS 接口 ──                      │
└─────────────────────────────────────────────────────────┘
```

#### 后端依赖规则

```
App Plugins    → Core + System Services（通过 trait）
System Services → Core + Persist
Core / Persist → 无业务依赖
Server         → 组装所有层（是组装层，不是最底层）

禁止：
  App Plugins  ✗→ Server        （插件不依赖 HTTP 框架）
  App Plugins  ✗→ 其他 Plugin   （插件之间不直接依赖）
  Core         ✗→ 上层任何 crate
```

### 3.2 进程管理（后端拥有真相）

**为什么进程管理必须在后端？**

| 维度 | 前端进程（v1） | 后端进程（v2） |
|------|---------------|---------------|
| 资源跟踪 | 只是估算内存数字 | 真实跟踪：连接池数量、watch 数、任务数 |
| 生命周期 | 浏览器刷新就丢 | 服务端持续运行，可恢复 |
| 隔离 | 共享浏览器内存 | 每进程独立资源上下文 |
| 清理 | 无法真正释放后端资源 | 进程终止时自动关闭连接、取消任务 |

#### 后端进程模型

```rust
// ventoos-core/src/process.rs

/// 虚拟进程 — 每个打开的应用窗口实例对应一个进程
pub struct VProcess {
    pub pid: u32,
    pub app_id: String,
    pub window_id: String,          // 关联前端窗口
    pub status: ProcessStatus,
    pub created_at: DateTime<Utc>,
    pub context: serde_json::Value, // 应用级上下文（集群名、连接ID等）
}

pub enum ProcessStatus {
    Running,
    Suspended,                      // 前端窗口最小化，暂停非必要后端工作
    Terminated,
}
```

#### 后端进程管理器（新 crate: `ventoos-process`）

```rust
// ventoos-process/src/lib.rs

pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<u32, VProcess>>>,
    next_pid: AtomicU32,
    db: Arc<Database>,
}

impl ProcessManager {
    /// 创建进程 — 前端打开窗口时调用
    pub async fn spawn(&self, app_id: &str, window_id: &str) -> Result<VProcess>

    /// 终止进程 — 关闭窗口时调用，自动清理关联资源
    pub async fn terminate(&self, pid: u32) -> Result<()>

    /// 挂起进程 — 前端最小化窗口
    pub async fn suspend(&self, pid: u32) -> Result<()>

    /// 恢复进程
    pub async fn resume(&self, pid: u32) -> Result<()>

    /// 列出所有进程
    pub fn list(&self) -> Vec<VProcess>

    /// 获取单个进程
    pub fn get(&self, pid: u32) -> Option<VProcess>
}
```

#### 前端如何与后端进程交互

```
前端打开窗口:
  1. kernel.openWindow('kubernetes')
  2. 创建 WindowInstance（纯 UI 状态）
  3. POST /api/processes { appId: 'kubernetes', windowId: 'win-xxx' }
  4. 后端创建 VProcess，分配 PID，返回进程信息
  5. 前端将 processId 存入 WindowInstance

前端关闭窗口:
  1. kernel.closeWindow('win-xxx')
  2. DELETE /api/processes/{pid}
  3. 后端终止进程，清理连接/任务/watch
  4. 前端移除 WindowInstance

前端最小化窗口:
  1. kernel.minimizeWindow('win-xxx')
  2. PUT /api/processes/{pid}/suspend
  3. 后端暂停非必要后端工作（如停止 watch 轮询）
  4. 前端停止渲染（React 层面优化）
```

### 3.3 每应用数据隔离

```
平台数据目录（macOS: ~/Library/Application Support/ventoos/）
├── system/
│   ├── ventoos.db              # 系统 SQLite（设置、认证、进程记录）
│   └── logs/                   # 系统日志
├── apps/
│   ├── kubernetes/
│   │   ├── data/               # 应用私有数据
│   │   └── cache/              # 可清理的缓存
│   ├── database/
│   │   ├── data/
│   │   │   └── saved-queries/  # 保存的 SQL
│   │   └── cache/
│   ├── redis/
│   │   └── ...
│   ├── explorer/
│   │   └── ...
│   ├── ai-assistant/
│   │   └── ...
│   └── ssh/
│       └── ...
└── temp/                       # 临时文件，重启时清理
```

**卸载行为：**

```
卸载应用 "database":
  1. 终止该应用所有进程（关闭连接、取消任务）
  2. 从应用注册表中移除
  3. 提示用户："是否保留应用数据？"
     ├─ 保留 → 只删除应用代码，apps/database/data/ 保留
     └─ 不保留 → 删除 apps/database/ 整个目录
  4. 重新安装时，如果 data/ 存在，自动恢复
```

### 3.4 应用插件路由（后端）

当前后端问题：所有路由都写死在 `ventoos-server/src/routes.rs` 中。应由每个 App Plugin 自行声明路由：

```rust
// ventoos-core/src/plugin.rs — 应用插件 trait

pub trait AppPlugin: Send + Sync {
    /// 应用 ID
    fn app_id(&self) -> &str;

    /// 注册该应用的 API 路由
    fn routes(&self) -> axum::Router<AppState>;

    /// 注册该应用的 WebSocket 消息处理
    fn ws_handlers(&self) -> Vec<WsHandler> { vec![] }

    /// 初始化（服务启动时调用）
    fn init(&self, ctx: &PluginContext) -> Result<()> { Ok(()) }

    /// 清理（服务关闭时调用）
    fn shutdown(&self) -> Result<()> { Ok(()) }
}
```

```rust
// ventoos-k8s/src/lib.rs

pub struct KubernetesPlugin;

impl AppPlugin for KubernetesPlugin {
    fn app_id(&self) -> &str { "kubernetes" }

    fn routes(&self) -> Router<AppState> {
        Router::new()
            .route("/api/apps/kubernetes/clusters", get(list_clusters))
            .route("/api/apps/kubernetes/resources", get(list_resources))
            .route("/api/apps/kubernetes/logs", get(stream_logs))
    }
}
```

```rust
// ventoos-server/src/main.rs — 组装

fn build_router(state: AppState, plugins: Vec<Box<dyn AppPlugin>>) -> Router {
    let mut router = Router::new()
        // 系统路由
        .merge(system_routes());

    // 动态挂载应用路由
    for plugin in &plugins {
        router = router.merge(plugin.routes());
    }

    router.with_state(state)
}
```

### 3.5 后端 crate 重组

```
native/crates/
├── ventoos-core/               # Layer 1: 共享类型
│   └── src/
│       ├── lib.rs
│       ├── types.rs            # Id, ApiResponse, Pagination
│       ├── process.rs          # VProcess, ProcessStatus
│       ├── connection.rs       # Connection, ConnectionType
│       ├── task.rs             # Task, TaskStatus
│       ├── notification.rs     # Notification, NotificationLevel
│       ├── app.rs              # AppManifest (后端侧)
│       ├── plugin.rs           # AppPlugin trait
│       ├── error.rs            # 统一错误类型
│       └── auth.rs             # Auth 类型
│
├── ventoos-persist/            # Layer 1: 持久化
│   └── src/
│       ├── lib.rs              # Database
│       └── migrations/
│
├── ventoos-process/            # Layer 2: 进程管理 [新增]
│   └── src/
│       ├── lib.rs              # ProcessManager
│       └── types.rs
│
├── ventoos-connection/         # Layer 2: 连接管理
│   └── src/lib.rs              # ConnectionManager（对接 persist）
│
├── ventoos-task/               # Layer 2: 任务引擎
│   └── src/lib.rs              # TaskEngine（对接 persist）
│
├── ventoos-auth/               # Layer 2: 认证 [从 server 中抽出]
│   └── src/lib.rs              # AuthManager
│
├── ventoos-k8s/                # Layer 3: K8s 应用插件
│   └── src/lib.rs              # impl AppPlugin
│
├── ventoos-db/                 # Layer 3: 数据库应用插件
│   └── src/lib.rs              # impl AppPlugin
│
├── ventoos-redis/              # Layer 3: Redis 应用插件
│   └── src/lib.rs              # impl AppPlugin
│
├── ventoos-vfs/                # Layer 3: VFS 应用插件
│   └── src/lib.rs              # impl AppPlugin
│
├── ventoos-agent/              # Layer 3: AI Agent 插件
│   └── src/lib.rs              # impl AppPlugin
│
└── ventoos-server/             # Layer 0: 组装层（Axum 服务器）
    └── src/
        ├── main.rs             # 启动：初始化所有层 → 绑定端口
        ├── router.rs           # 系统路由 + 插件路由组装
        ├── middleware/
        │   ├── auth.rs         # Bearer token 校验
        │   └── logging.rs      # 请求日志
        ├── ws/
        │   ├── dispatch.rs     # WS 消息分发
        │   └── shell.rs        # PTY 终端
        └── state.rs            # AppState 定义
```

### 3.6 WebSocket 消息类型化

```rust
// ventoos-core/src/ws.rs

/// 前端 → 后端
#[derive(Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ClientMessage {
    Ping,
    Subscribe { channel: String },
    Unsubscribe { channel: String },
    AppMessage { app_id: String, payload: serde_json::Value },
}

/// 后端 → 前端
#[derive(Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ServerMessage {
    Pong,
    ProcessUpdate(ProcessUpdatePayload),
    TaskUpdate(TaskUpdatePayload),
    Notification(NotificationPayload),
    ConnectionStatus(ConnectionStatusPayload),
    AppMessage { app_id: String, payload: serde_json::Value },
}
```

---

## 4. 前端架构设计

### 4.1 前端分层

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Applications  (src/apps/)                      │
│  独立的业务应用 UI，只能通过 System API 与系统交互         │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Shell  (src/shell/)  +  Services (src/services/)│
│  桌面壳 UI 组件                    前端服务代理            │
│  ── Shell 和 Services 同层，可互相使用但不强依赖 ──        │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Kernel  (src/kernel/)                          │
│  窗口管理、应用加载、系统通知通道                          │
│  ── 前端的 OS 内核抽象 ──                                 │
├─────────────────────────────────────────────────────────┤
│  Layer 0: Infrastructure  (src/infra/)                   │
│  HTTP 客户端、WebSocket、本地存储、日志                    │
│  ── 零业务逻辑的基础设施 ──                                │
└─────────────────────────────────────────────────────────┘
```

#### 前端依赖规则

```
Apps     → Kernel (System API) + Services + Infra
Shell    → Kernel + Services + Infra
Services → Kernel + Infra
Kernel   → Infra
Infra    → 无依赖

禁止：
  Apps    ✗→ Shell         （应用不能依赖桌面壳 UI）
  Apps    ✗→ 其他 App      （应用间不能直接 import）
  Shell   ✗→ Apps          （壳不能依赖具体应用实现）
  Kernel  ✗→ Services      （内核不能依赖业务服务）
```

### 4.2 通信设计 — 三条通道取代全局 EventBus

v1 的全局 EventBus 问题：
- 一条总线承载所有事件类型（内核事件、服务事件、应用 IPC），后期会交叉混乱
- 谁都能 emit、谁都能 subscribe，无权限控制
- Debug 困难：一个事件触发了什么，需要全局搜索

**v2 方案：三条独立通道，各司其职：**

```
┌─────────────────────────────────────────────────────────────────┐
│  通道 1: 内核直调                                                │
│  ── 内核模块之间直接调用函数，同步可靠 ──                         │
│                                                                  │
│  WindowManager.openWindow()                                      │
│    → 调用 processService.createProcess()  （API 调用后端）        │
│    → 直接更新 windowStore                                        │
│                                                                  │
│  适用于：窗口↔进程的核心流程                                      │
│  优点：调用链清晰，可断点调试，类型安全                            │
├─────────────────────────────────────────────────────────────────┤
│  通道 2: 系统通知（SystemChannel）                                │
│  ── 单向广播：内核/服务 → 外部订阅者 ──                           │
│                                                                  │
│  内核发送通知:                                                    │
│    systemChannel.notify('window:opened', { windowId, appId })    │
│                                                                  │
│  Shell 组件可订阅（可选）:                                        │
│    Dock 订阅 → 更新运行状态指示器                                 │
│    TopBar 订阅 → 更新焦点应用名                                   │
│                                                                  │
│  适用于：UI 联动更新、日志记录、分析                               │
│  特点：发送者不知道也不关心有多少订阅者                             │
├─────────────────────────────────────────────────────────────────┤
│  通道 3: 应用 IPC（未来）                                        │
│  ── 应用之间的结构化消息传递，通过 AppManager 中转 ──              │
│                                                                  │
│  K8s App → AppManager.sendIPC('database', { action, payload })   │
│  AppManager 验证权限 → 转发给 Database App                        │
│                                                                  │
│  适用于：跨应用协作（K8s→DB 一键直连）                             │
│  特点：受控、可审计、有权限校验                                    │
└─────────────────────────────────────────────────────────────────┘
```

#### 通道实现

```typescript
// kernel/channel.ts — 系统通知通道

type SystemNotifications = {
  'window:opened':    { windowId: string; appId: string }
  'window:closed':    { windowId: string; appId: string }
  'window:focused':   { windowId: string }
  'process:created':  { pid: number; windowId: string; appId: string }
  'process:terminated': { pid: number; windowId: string }
  'theme:changed':    { mode: 'light' | 'dark' }
  'connection:status-changed': { connectionId: string; status: string }
}

class SystemChannel {
  private listeners = new Map<string, Set<Function>>()

  /** 订阅通知（返回取消函数） */
  subscribe<K extends keyof SystemNotifications>(
    event: K,
    handler: (data: SystemNotifications[K]) => void
  ): () => void

  /** 发送通知（仅内核和服务层应调用） */
  notify<K extends keyof SystemNotifications>(
    event: K,
    data: SystemNotifications[K]
  ): void
}

export const systemChannel = new SystemChannel()
```

```typescript
// 内核直调示例 — 不通过 EventBus
// kernel/window/manager.ts

import { processService } from '@/services/process'
import { systemChannel } from '../channel'

export async function openWindow(appId: string, options?: WindowOpenOptions): Promise<string> {
  const manifest = useAppStore.getState().getApp(appId)
  if (!manifest) throw new Error(`Unknown app: ${appId}`)

  // 多窗口限制检查
  if (!manifest.multiWindow) {
    const existing = useWindowStore.getState().getWindowsByApp(appId)
    if (existing.length > 0) {
      focusWindow(existing[0].id)
      return existing[0].id
    }
  }

  const windowId = generateId()

  // 1. 调用后端创建进程（直接函数调用，不是事件）
  const process = await processService.createProcess(appId, windowId)

  // 2. 创建前端窗口实例
  useWindowStore.getState().addWindow({
    id: windowId,
    appId,
    processId: process.pid,
    ...calculatePosition(options),
  })

  // 3. 发送通知（可选的 UI 联动，Dock 可以据此更新）
  systemChannel.notify('window:opened', { windowId, appId })

  return windowId
}

export async function closeWindow(windowId: string): Promise<void> {
  const win = useWindowStore.getState().getWindow(windowId)
  if (!win) return

  // 1. 生命周期钩子
  const manifest = useAppStore.getState().getApp(win.appId)
  if (manifest?.lifecycle?.onBeforeWindowClose) {
    const canClose = await manifest.lifecycle.onBeforeWindowClose(windowId)
    if (!canClose) return
  }

  // 2. 后端终止进程
  if (win.processId) {
    await processService.terminateProcess(win.processId)
  }

  // 3. 移除窗口
  useWindowStore.getState().removeWindow(windowId)

  // 4. 通知
  systemChannel.notify('window:closed', { windowId, appId: win.appId })

  // 5. 检查是否是该应用最后一个窗口
  const remaining = useWindowStore.getState().getWindowsByApp(win.appId)
  if (remaining.length === 0 && manifest?.lifecycle?.onDeactivate) {
    await manifest.lifecycle.onDeactivate()
  }
}
```

**对比 v1 的全局 EventBus：**

| 维度 | v1 EventBus | v2 三通道 |
|------|-------------|-----------|
| 核心流程 | 事件驱动（异步、松散） | 直接函数调用（同步、可靠） |
| UI 联动 | 同一个 EventBus | 系统通知通道（只读订阅） |
| 应用间通信 | 同一个 EventBus | 独立 IPC 通道（有权限） |
| 调试难度 | 全局搜索谁 subscribe 了 | 核心流程直接看调用链 |
| 事件混乱风险 | 高（所有类型混在一起） | 低（三条通道各有边界） |

### 4.3 Layer 0: Infrastructure (`src/infra/`)

```
src/infra/
├── api/
│   ├── client.ts          # HTTP 请求封装（拦截器、错误处理、泛型）
│   ├── types.ts           # 请求/响应类型 + 后端 API 类型镜像
│   └── index.ts
├── ws/
│   ├── client.ts          # WebSocket 客户端（自动重连、心跳）
│   ├── types.ts           # WS 消息类型（与后端 ServerMessage/ClientMessage 对齐）
│   └── index.ts
├── storage/
│   ├── local.ts           # localStorage 适配
│   └── index.ts
├── logger/
│   └── index.ts           # 统一日志
└── index.ts
```

### 4.4 Layer 1: Kernel (`src/kernel/`)

前端内核：负责窗口管理、应用加载、系统通知通道。

**关键变化：不再包含 process store。** 进程状态在后端，前端通过 API 查询。

```
src/kernel/
├── channel.ts             # 系统通知通道（替代全局 EventBus）
├── window/
│   ├── store.ts           # 窗口 UI 状态（位置、大小、z-index、焦点）
│   ├── manager.ts         # 窗口操作（open/close/focus/minimize/maximize）
│   ├── hooks.ts           # useWindow, useWindowList, useFocusedWindow
│   ├── types.ts           # WindowInstance
│   └── index.ts
├── apps/
│   ├── store.ts           # 已安装应用注册表
│   ├── manager.ts         # 应用注册、查找、组件加载
│   ├── hooks.ts           # useApp, useAppList, useAppComponent
│   ├── manifest.ts        # AppManifest 完整类型定义
│   └── index.ts
├── bootstrap.ts           # 内核启动入口
└── index.ts               # 统一导出的 System API
```

### 4.5 AppManifest（完整版）

```typescript
// kernel/apps/manifest.ts

import type { ComponentType, ReactNode } from 'react'

/** 应用 Manifest — 每个应用的完整声明 */
export interface AppManifest {
  // ─── 身份标识 ───
  /** 唯一应用 ID（如 'kubernetes', 'database'） */
  id: string
  /** 显示名称 */
  name: string
  /** 语义化版本号（如 '1.0.0'） */
  version: string

  // ─── 作者与来源 ───
  /** 作者信息 */
  author: {
    name: string
    email?: string
    url?: string
  }
  /** 应用主页 URL */
  homepage?: string
  /** 源码仓库 URL */
  repository?: string
  /** 许可证（如 'MIT', 'Apache-2.0'） */
  license?: string

  // ─── 展示信息 ───
  /** Dock/启动器图标（内置应用用 ReactNode，外部应用用 URL） */
  icon: ReactNode | string
  /** 应用描述 */
  description?: string
  /** 预览截图 URL 列表（应用商店展示用） */
  thumbnails?: string[]
  /** 应用分类标签 */
  categories?: string[]

  // ─── 窗口行为 ───
  /** 是否允许多窗口实例 */
  multiWindow: boolean
  /** 默认窗口尺寸 */
  defaultSize?: { width: number; height: number }
  /** 最小窗口尺寸 */
  minSize?: { width: number; height: number }

  // ─── 权限声明 ───
  /** 应用需要的系统权限列表 */
  permissions?: AppPermission[]

  // ─── 系统要求 ───
  /** 最低系统版本要求 */
  minSystemVersion?: string
  /** 是否需要持久化数据目录 */
  requiresDataDir?: boolean

  // ─── 加载 ───
  /** 懒加载的应用 UI 组件 */
  component: () => Promise<{ default: ComponentType<AppComponentProps> }>
  /** 是否有后端插件 */
  hasBackendPlugin?: boolean

  // ─── 生命周期 ───
  /** 应用生命周期钩子 */
  lifecycle?: AppLifecycle
}

/** 应用组件接收的 props */
export interface AppComponentProps {
  /** 当前窗口 ID */
  windowId: string
  /** 当前进程 ID（后端分配） */
  processId: number
}

/** 应用权限枚举 */
export type AppPermission =
  | 'network'           // 可发起外部网络连接
  | 'storage'           // 可读写应用数据目录
  | 'connections'       // 可访问连接管理器
  | 'shell'             // 可执行 Shell 命令
  | 'notifications'     // 可发送系统通知
  | 'clipboard'         // 可访问剪贴板
  | 'ipc'               // 可与其他应用通信

/** 应用生命周期钩子 */
export interface AppLifecycle {
  /** 应用首次打开时调用（初始化资源） */
  onActivate?: () => Promise<void> | void
  /** 应用所有窗口关闭后调用（释放资源） */
  onDeactivate?: () => Promise<void> | void
  /** 窗口关闭前调用（保存状态、确认关闭） */
  onBeforeWindowClose?: (windowId: string) => Promise<boolean> | boolean
  /** 应用安装后调用 */
  onInstall?: () => Promise<void> | void
  /** 应用卸载前调用 */
  onUninstall?: (keepData: boolean) => Promise<void> | void
  /** 应用更新后调用（可做数据迁移） */
  onUpdate?: (fromVersion: string, toVersion: string) => Promise<void> | void
}
```

**内置应用示例：**

```typescript
// apps/kubernetes/manifest.ts
import { Box } from 'lucide-react'

export const manifest: AppManifest = {
  id: 'kubernetes',
  name: 'Kubernetes',
  version: '1.0.0',
  author: { name: 'VentoOS Team' },
  icon: <Box />,
  description: '多集群 Kubernetes 资源管理与运维',
  thumbnails: ['/thumbnails/k8s-overview.png', '/thumbnails/k8s-pods.png'],
  categories: ['infrastructure', 'container'],
  multiWindow: true,
  defaultSize: { width: 1100, height: 720 },
  minSize: { width: 800, height: 500 },
  permissions: ['network', 'connections', 'notifications', 'shell'],
  requiresDataDir: true,
  hasBackendPlugin: true,
  component: () => import('./KubernetesApp'),
  lifecycle: {
    onActivate: async () => { /* 预加载集群列表 */ },
    onDeactivate: async () => { /* 关闭所有 watch 连接 */ },
    onBeforeWindowClose: async (windowId) => {
      // 检查是否有未保存的编辑
      return true
    },
  },
}
```

### 4.6 Layer 2: Services (`src/services/`)

前端服务代理：封装后端 API 调用 + 本地状态缓存。

```
src/services/
├── process/
│   ├── service.ts         # 后端进程 API 代理
│   ├── hooks.ts           # useProcess, useProcessList
│   └── index.ts
├── auth/
│   ├── store.ts           # token、locked、initialized
│   ├── service.ts         # 登录/登出/锁屏
│   └── index.ts
├── connection/
│   ├── store.ts           # 连接列表缓存
│   ├── service.ts         # CRUD + 测试（调 API）
│   └── index.ts
├── task/
│   ├── store.ts           # 任务列表 + 进度
│   ├── service.ts         # 创建/取消（API + WS 推送）
│   └── index.ts
├── notification/
│   ├── store.ts           # 通知队列
│   ├── service.ts         # 发送/清除
│   └── index.ts
├── settings/
│   ├── store.ts           # 桌面设置（壁纸、主题）
│   ├── service.ts
│   └── index.ts
├── keyboard/
│   ├── store.ts           # 快捷键注册表
│   ├── service.ts
│   └── index.ts
└── index.ts
```

### 4.7 Layer 2: Shell (`src/shell/`)

与 Services 同层。

```
src/shell/
├── Desktop/
├── TopBar/
├── Dock/
├── Window/
├── WindowManager/
├── Launchpad/
│   └── store.ts           # Launchpad 的 visible 状态（Shell 内部）
├── CommandPalette/
├── ContextMenu/
│   └── store.ts           # 右键菜单状态（Shell 内部）
├── NotificationCenter/
├── NotificationToast/
├── TaskCenter/
├── LoginScreen/
├── WebShell/
└── index.tsx              # Shell 根组件
```

### 4.8 Layer 3: Applications (`src/apps/`)

```
src/apps/
├── kubernetes/
│   ├── manifest.ts        # AppManifest
│   ├── KubernetesApp.tsx  # 主组件
│   ├── components/        # 应用内部组件
│   ├── hooks/             # 应用内部 hooks
│   ├── store/             # 应用内部状态（隔离）
│   └── types.ts
├── database/
│   ├── manifest.ts
│   ├── DatabaseApp.tsx
│   └── ...
├── redis/
├── explorer/
├── ssh/
├── ai-assistant/
├── settings/
└── index.ts               # 汇总导出所有内置 manifest
```

**应用与系统的交互方式：**

```typescript
// apps/kubernetes/KubernetesApp.tsx
import { useWindow } from '@/kernel'                    // 窗口操作
import { useConnectionService } from '@/services/connection' // 连接管理
import { useNotification } from '@/services/notification'    // 通知
import type { AppComponentProps } from '@/kernel/apps/manifest'

export default function KubernetesApp({ windowId, processId }: AppComponentProps) {
  const { setTitle } = useWindow(windowId)
  const { connections } = useConnectionService()
  const { notify } = useNotification()

  useEffect(() => {
    setTitle('Kubernetes - prod-cluster')
  }, [])

  return <div>...</div>
}
```

### 4.9 前端完整目录结构

```
web/src/
├── main.tsx                    # 入口：bootKernel() → render App
├── App.tsx                     # 根组件：认证门控 → Shell
├── theme.ts                    # 设计 token
│
├── infra/                      # Layer 0: 基础设施
│   ├── api/
│   │   ├── client.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── ws/
│   │   ├── client.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── storage/
│   │   └── index.ts
│   └── logger/
│       └── index.ts
│
├── kernel/                     # Layer 1: 前端内核
│   ├── channel.ts              #   系统通知通道
│   ├── window/
│   │   ├── store.ts
│   │   ├── manager.ts
│   │   ├── hooks.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── apps/
│   │   ├── store.ts
│   │   ├── manager.ts
│   │   ├── hooks.ts
│   │   ├── manifest.ts
│   │   └── index.ts
│   ├── bootstrap.ts
│   └── index.ts                #   统一导出 System API
│
├── services/                   # Layer 2: 服务代理
│   ├── process/
│   ├── auth/
│   ├── connection/
│   ├── task/
│   ├── notification/
│   ├── settings/
│   ├── keyboard/
│   └── index.ts
│
├── shell/                      # Layer 2: 桌面壳 UI
│   ├── Desktop/
│   ├── TopBar/
│   ├── Dock/
│   ├── Window/
│   ├── WindowManager/
│   ├── Launchpad/
│   ├── CommandPalette/
│   ├── ContextMenu/
│   ├── NotificationCenter/
│   ├── NotificationToast/
│   ├── TaskCenter/
│   ├── LoginScreen/
│   ├── WebShell/
│   └── index.tsx
│
├── apps/                       # Layer 3: 业务应用
│   ├── kubernetes/
│   │   ├── manifest.ts
│   │   ├── KubernetesApp.tsx
│   │   └── ...
│   ├── database/
│   ├── redis/
│   ├── explorer/
│   ├── ssh/
│   ├── ai-assistant/
│   ├── settings/
│   └── index.ts
│
├── shared/                     # 跨层共享
│   ├── types.ts
│   └── utils.ts
│
└── assets/
    └── styles/
```

---

## 5. 应用独立性设计（面向未来应用商店）

### 5.1 应用包格式

```
kubernetes.vapp.zip
├── manifest.json               # AppManifest (JSON 序列化)
├── frontend/
│   ├── index.js                # 编译后的前端 bundle
│   ├── index.css
│   └── assets/
│       ├── icon.svg
│       └── thumbnails/
│           ├── overview.png
│           └── pods.png
├── backend/                    # 可选：后端插件
│   └── plugin.wasm             # 或编译好的动态库
└── README.md
```

### 5.2 应用安装/卸载流程

```
安装:
  1. 下载 .vapp.zip
  2. 解压到 /ventoos/apps/{appId}/
  3. 验证 manifest.json（版本兼容、权限检查）
  4. 注册到应用注册表（后端 SQLite）
  5. 加载前端 bundle
  6. 初始化后端插件
  7. 调用 lifecycle.onInstall()
  8. 在 Dock/Launchpad 中显示

卸载:
  1. 终止该应用全部进程
  2. 调用 lifecycle.onUninstall(keepData)
  3. 从注册表移除
  4. 删除 /ventoos/apps/{appId}/frontend/
  5. 如果 keepData = false:
     删除 /ventoos/apps/{appId}/data/
  6. 如果 keepData = true:
     保留 /ventoos/apps/{appId}/data/（下次安装可恢复）

更新:
  1. 下载新版 .vapp.zip
  2. 终止该应用全部进程
  3. 备份旧 manifest
  4. 替换 frontend/ 和 backend/
  5. 更新注册表
  6. 调用 lifecycle.onUpdate(oldVersion, newVersion)
  7. 重新加载
```

### 5.3 M1 阶段的务实做法

M1 不需要实现完整的应用商店，但架构上预留能力：

| 能力 | M1 实现 | 未来扩展 |
|------|---------|----------|
| 应用注册 | 编译时内置 manifest | 运行时动态注册 |
| 前端加载 | React.lazy 编译时 code split | 远程 bundle 动态加载 |
| 后端插件 | 编译时 impl AppPlugin | 动态库或 WASM 插件 |
| 数据目录 | 按 appId 隔离目录 | 同上 |
| 安装/卸载 | 不支持 | 完整流程 |
| 应用商店 | 不支持 | 独立服务 |

**关键：M1 的每个应用都已经是自包含的模块（manifest + component + backend plugin），未来只是把"编译时绑定"换成"运行时加载"。**

---

## 6. 关键交互流程

### 6.1 打开应用窗口（全链路）

```
[Dock]                    [Kernel]                [Backend]              [Frontend]
  │                          │                        │                      │
  │ click 'kubernetes'       │                        │                      │
  │─────────────────────────→│                        │                      │
  │                          │                        │                      │
  │              1. 查找 manifest                     │                      │
  │              2. 多窗口检查                         │                      │
  │              3. 生成 windowId                      │                      │
  │                          │                        │                      │
  │                          │  POST /api/processes   │                      │
  │                          │  {appId, windowId}     │                      │
  │                          │───────────────────────→│                      │
  │                          │                        │                      │
  │                          │                4. 分配 PID                    │
  │                          │                5. 创建 VProcess               │
  │                          │                6. 初始化应用数据目录           │
  │                          │                7. 加载应用插件上下文           │
  │                          │                        │                      │
  │                          │  { pid, status }       │                      │
  │                          │←───────────────────────│                      │
  │                          │                        │                      │
  │              8. 创建 WindowInstance                │                      │
  │                 (with processId)                   │                      │
  │              9. systemChannel.notify               │                      │
  │                 ('window:opened')                  │                      │
  │                          │                        │                      │
  │                          │                        │              10. WindowManager
  │                          │                        │                  渲染新窗口
  │                          │                        │              11. lazy load
  │                          │                        │                  App component
  │                          │                        │              12. lifecycle
  │                          │                        │                  .onActivate()
```

### 6.2 关闭应用窗口

```
[Window 交通灯]          [Kernel]                [Backend]
  │                          │                        │
  │ click close              │                        │
  │─────────────────────────→│                        │
  │                          │                        │
  │              1. lifecycle.onBeforeWindowClose()     │
  │                 (应用可取消关闭)                    │
  │                          │                        │
  │                          │  DELETE /api/processes/{pid}
  │                          │───────────────────────→│
  │                          │                        │
  │                          │          2. 终止进程    │
  │                          │          3. 关闭连接    │
  │                          │          4. 取消任务    │
  │                          │          5. 保存状态    │
  │                          │                        │
  │              6. 移除 WindowInstance                │
  │              7. systemChannel.notify               │
  │                 ('window:closed')                  │
  │                          │                        │
  │              8. 若该 app 无剩余窗口:               │
  │                 lifecycle.onDeactivate()           │
```

### 6.3 应用间协作（K8s → Database 一键直连）

```
[K8s App]                [Kernel AppManager]        [Database App]
  │                              │                        │
  │ "连接此 Pod 的 PostgreSQL"   │                        │
  │                              │                        │
  │ AppManager.sendIPC(          │                        │
  │   'database',                │                        │
  │   { action: 'connect',      │                        │
  │     connectionConfig: {...}} │                        │
  │ )                            │                        │
  │─────────────────────────────→│                        │
  │                              │                        │
  │              1. 检查 K8s 是否有 'ipc' 权限           │
  │              2. 检查 database 是否已注册              │
  │              3. openWindow('database',               │
  │                 { initContext: connectionConfig })    │
  │                              │───────────────────────→│
  │                              │                        │
  │                              │   4. Database App 打开 │
  │                              │      窗口并自动填入     │
  │                              │      连接配置          │
```

---

## 7. 系统 API（Kernel 对外导出）

```typescript
// kernel/index.ts

// ─── 窗口操作 ───
export { openWindow, closeWindow, focusWindow, minimizeWindow,
         restoreWindow, toggleMaximize, moveWindow, resizeWindow } from './window/manager'
export { useWindow, useWindowList, useFocusedWindow } from './window/hooks'
export type { WindowInstance, WindowOpenOptions } from './window/types'

// ─── 应用查询 ───
export { useApp, useAppList, useAppComponent } from './apps/hooks'
export type { AppManifest, AppComponentProps, AppLifecycle, AppPermission } from './apps/manifest'

// ─── 系统通知通道 ───
export { systemChannel } from './channel'
export type { SystemNotifications } from './channel'

// ─── 启动 ───
export { bootKernel } from './bootstrap'
```

---

## 8. 后端完整 crate 结构

```
native/crates/
│
├── ventoos-core/               # Layer 1: 共享类型与 trait
│   └── src/
│       ├── lib.rs
│       ├── types.rs            # Id, ApiResponse, Pagination
│       ├── process.rs          # VProcess, ProcessStatus
│       ├── connection.rs       # Connection, ConnectionType, ConnectionStatus
│       ├── task.rs             # Task, TaskStatus, TaskPriority
│       ├── notification.rs     # Notification, NotificationLevel
│       ├── app.rs              # AppInfo (后端的应用元数据)
│       ├── plugin.rs           # AppPlugin trait
│       ├── ws.rs               # ClientMessage, ServerMessage
│       ├── error.rs            # VentoError, ErrorCode
│       └── auth.rs             # AuthStatus, LoginRequest
│
├── ventoos-persist/            # Layer 1: SQLite 持久化
│   └── src/
│       ├── lib.rs
│       └── migrations/
│           ├── 001_initial.sql
│           └── 002_processes.sql
│
├── ventoos-process/            # Layer 2: 进程管理 [新增]
│   └── src/lib.rs
│
├── ventoos-connection/         # Layer 2: 连接管理
│   └── src/lib.rs
│
├── ventoos-task/               # Layer 2: 任务引擎
│   └── src/lib.rs
│
├── ventoos-auth/               # Layer 2: 认证 [从 server 抽出]
│   └── src/lib.rs
│
├── ventoos-notification/       # Layer 2: 通知管理 [新增]
│   └── src/lib.rs
│
├── ventoos-k8s/                # Layer 3: K8s 插件
│   └── src/lib.rs              # impl AppPlugin for KubernetesPlugin
│
├── ventoos-db/                 # Layer 3: 数据库插件
│   └── src/lib.rs              # impl AppPlugin for DatabasePlugin
│
├── ventoos-redis/              # Layer 3: Redis 插件
│   └── src/lib.rs              # impl AppPlugin for RedisPlugin
│
├── ventoos-vfs/                # Layer 3: VFS 插件
│   └── src/lib.rs
│
├── ventoos-agent/              # Layer 3: AI Agent 插件
│   └── src/lib.rs
│
└── ventoos-server/             # Layer 0: 组装层
    └── src/
        ├── main.rs             # 启动入口
        ├── router.rs           # 系统路由 + 插件路由组装
        ├── state.rs            # AppState
        ├── middleware/
        │   ├── auth.rs
        │   └── logging.rs
        └── ws/
            ├── dispatch.rs     # WS 消息分发
            └── shell.rs        # PTY 终端
```

---

## 9. 迁移策略

采用**渐进式迁移**，每一步保证可编译、可运行、测试通过。

### Phase 1: 后端基础重构

1. 新建 `ventoos-process` crate，实现 ProcessManager
2. 将 auth 逻辑从 `ventoos-server/src/auth.rs` 抽到 `ventoos-auth` crate
3. 在 `ventoos-core` 中定义 `AppPlugin` trait
4. 为 `ventoos-connection` 和 `ventoos-task` 对接 SQLite 持久化
5. 添加进程相关 API 端点：`POST/DELETE/GET /api/processes`
6. 定义 WebSocket 消息类型枚举

### Phase 2: 前端基础设施

7. 创建 `src/infra/`，迁移 `api/client.ts` 和 `api/ws.ts`
8. 创建 `src/kernel/channel.ts`（系统通知通道）
9. 创建 `src/kernel/window/`（从 `store/window.ts` 迁移，去掉 process 直调）
10. 创建 `src/kernel/apps/`（从 `store/app.ts` + `apps/init.tsx` + `apps/registry.tsx` 合并）
11. 实现 `kernel/bootstrap.ts`

### Phase 3: 前端服务层

12. 创建 `src/services/process/`（对接后端 Process API）
13. 将 `store/auth.ts` → `services/auth/`
14. 将 `store/connection.ts` → `services/connection/`
15. 将 `store/task.ts`, `store/notification.ts` → 对应 `services/`
16. 将 `store/desktop.ts` → `services/settings/`
17. 将 `store/keyboard.ts` → `services/keyboard/`

### Phase 4: 前端 Shell + Apps

18. 将 `components/` → `shell/`
19. 将 `store/contextMenu.ts` 和 `store/launchpad.ts` 内嵌到 Shell 内部
20. 为每个应用创建 `manifest.ts`，删除 `apps/init.tsx` + `apps/registry.tsx`
21. 更新应用组件的 import（使用 kernel API 和 services）

### Phase 5: 后端应用插件化

22. 为 K8s/DB/Redis/VFS/Agent 实现 `AppPlugin` trait
23. 在 `ventoos-server/src/router.rs` 中动态挂载插件路由
24. 实现每应用数据目录隔离

### Phase 6: 清理与验证

25. 删除旧的 `store/` 目录
26. 删除旧的 `api/` 目录
27. 更新 TypeScript 路径别名
28. 全量测试：`cd web && pnpm test` + `cd native && cargo test`
29. 全量 lint：`cd web && pnpm lint:all` + `cd native && cargo clippy`
30. 更新 CLAUDE.md 目录结构

---

## 10. 核心收益

| 维度 | 当前 | 重构后 |
|------|------|--------|
| **进程管理** | 前端模拟，刷新即丢 | 后端管理，持有真实资源，可恢复 |
| **子系统耦合** | Window store 直调 Process store | 内核直调 + 系统通知通道分离 |
| **新增应用** | 改 init.tsx + registry.tsx + server routes.rs | 一个 manifest.ts + 一个 AppPlugin impl |
| **应用隔离** | 无隔离，共享所有 store | 前端 manifest 隔离 + 后端数据目录隔离 |
| **应用生命周期** | 只是 React 组件 | 完整：install → activate → close → deactivate → uninstall |
| **后端架构** | 全在 server crate | 分层：Core → Services → Plugins → Server |
| **通信混乱风险** | 全局 EventBus | 三通道：直调 + 系统通知 + 应用 IPC |
| **应用商店就绪** | 否 | 是（manifest + 数据目录 + 生命周期） |
| **依赖方向** | 任意交叉 | 严格单向（上→下） |
| **测试隔离** | store 之间有隐式依赖 | 每层可独立 mock 测试 |
