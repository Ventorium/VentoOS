# VentoOS 应用间通信 — 事件总线（IPC EventBus）

## 1. 背景与动机

### 1.1 现状

VentoOS 当前有四种通信模式：

| 模式 | 方向 | 用途 |
|------|------|------|
| SystemChannel | Kernel/Services → Shell/Apps（单向） | 窗口生命周期、进程状态、主题变更等 OS 级广播 |
| WebSocket | Backend ↔ Frontend | 实时后端推送（任务进度、通知、连接状态） |
| Zustand Stores | 全局可读写 | UI 状态、缓存数据 |
| App Menu/Tray | Apps → Shell | 应用菜单和托盘图标注册 |

**缺失能力**：应用之间无法直接通信。K8s 应用发现一个 PostgreSQL 服务后，没有机制将连接信息传递给 Database 应用并触发其打开。

### 1.2 目标

建立系统级 **IPC EventBus**，实现：

1. **事件注册**：应用声明自己能处理的事件及处理函数
2. **事件发送**：应用声明自己可能发出的事件类型，运行时发送事件
3. **自动打开**：接收方可配置收到事件时是否自动打开应用窗口
4. **结构化载荷**：事件携带 `id`、连接信息等结构化参数，接收方可据此决定新增/编辑
5. **类型安全**：全链路 TypeScript 类型约束，无 stringly-typed 事件

### 1.3 典型场景

**场景：K8s 一键打开数据库**

```
用户在 K8s 应用中点击一个 PostgreSQL Service
  → K8s 应用发送 "open:postgres" 事件，携带连接信息
  → EventBus 查找已注册 "open:postgres" 的应用（Database）
  → Database 应用未打开 → 自动打开窗口
  → Database 应用接收事件，自动添加/更新连接配置
  → Database 应用可选：自动连接该数据库
```

**场景：携带 ID 参数决定新增 vs 编辑**

```
K8s 应用发送事件时携带 { connectionId: "conn-123" }
  → Database 应用检查 connectionId 是否已存在
  → 已存在 → 打开编辑对话框
  → 不存在 → 打开新增对话框并预填连接信息
```

## 2. 架构设计

### 2.1 分层定位

IPC EventBus 位于 **Layer 1（Kernel）**，与 SystemChannel 平级。

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Shell (Desktop, Dock, TopBar, Notifications)  │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Apps (K8s, Database, Redis, Explorer, AI)     │
│    ↕ 注册事件处理器 / 发送事件                           │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Services (Connection, Task, Notification)     │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Kernel                                        │
│    ┌──────────────┐  ┌──────────────┐                   │
│    │ SystemChannel │  │  EventBus    │ ← 新增            │
│    │ (OS 广播)     │  │ (应用间通信)  │                   │
│    └──────────────┘  └──────────────┘                   │
│    Window Manager │ App Registry │ App Storage          │
├─────────────────────────────────────────────────────────┤
│  Layer 0: Infra (API Client, WS Client, Storage, Log)   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心概念

| 概念 | 说明 |
|------|------|
| **EventTopic** | 事件主题，格式 `namespace:action`，如 `open:postgres`、`open:redis`、`navigate:resource` |
| **EventPayload** | 事件载荷，强类型对象，包含事件数据 |
| **EventRegistration** | 应用的事件声明：哪些事件可发送、哪些事件可处理 |
| **EventBinding** | 事件绑定配置：是否自动打开、处理优先级等 |

### 2.3 事件命名空间规范

```
<namespace>:<action>

namespace:
  - open      — 打开某类资源/应用
  - navigate  — 导航到某个视图
  - action    — 触发某个操作
  - sync      — 状态同步
  - custom    — 应用自定义

action:
  - postgres, redis, mysql, sqlite — 数据库类型
  - terminal, explorer, editor     — 应用类型
  - resource, pod, service         — K8s 资源
```

预定义事件主题：

| Topic | 发送方 | 接收方 | 载荷 |
|-------|--------|--------|------|
| `open:postgres` | K8s | Database | `OpenDatabasePayload` |
| `open:mysql` | K8s | Database | `OpenDatabasePayload` |
| `open:sqlite` | K8s/Explorer | Database | `OpenDatabasePayload` |
| `open:redis` | K8s | Redis | `OpenRedisPayload` |
| `open:terminal` | K8s/Explorer | SuperTerminal | `OpenTerminalPayload` |
| `open:explorer` | K8s | Explorer | `OpenExplorerPayload` |
| `navigate:resource` | 任意 | K8s | `NavigateResourcePayload` |

### 2.4 与 SystemChannel 的关系

| 维度 | SystemChannel | EventBus |
|------|---------------|----------|
| 方向 | 单向（Kernel → Apps） | 双向（App ↔ App） |
| 事件源 | 仅 Kernel/Services | 任何已注册的应用 |
| 类型安全 | 编译时类型映射 | 编译时类型映射 |
| 用途 | OS 级生命周期事件 | 应用间业务通信 |
| 自动打开 | 不支持 | 支持 |
| 载荷 | 简单状态对象 | 结构化业务数据 |

两者共存，互不干扰。SystemChannel 继续处理 OS 级广播， EventBus 处理应用间业务通信。

## 3. 接口设计

### 3.1 事件载荷基础类型

```typescript
// web/src/kernel/ipc/types.ts

/** 事件载荷基础接口 */
export interface EventPayloadBase {
  /** 事件唯一追踪 ID（自动生成） */
  readonly eventId: string
  /** 发送方应用 ID */
  readonly senderId: string
  /** 事件创建时间戳 */
  readonly timestamp: number
}

/** 打开数据库事件载荷 */
export interface OpenDatabasePayload extends EventPayloadBase {
  /** 数据库类型 */
  dbType: 'postgresql' | 'mysql' | 'sqlite'
  /** 连接名称（显示用） */
  name?: string
  /** 主机地址 */
  host: string
  /** 端口 */
  port: number
  /** 数据库名 */
  database?: string
  /** 用户名 */
  username?: string
  /** 密码（敏感，仅传给接收方处理，不持久化到 EventBus 日志） */
  password?: string
  /** 额外参数 */
  params?: Record<string, string>
  /** 关联的连接 ID（存在则为编辑模式，不存在则为新增模式） */
  connectionId?: string
  /** 是否自动连接（默认 true） */
  autoConnect?: boolean
  /** K8s 上下文信息（用于建立 port-forward） */
  k8sContext?: {
    cluster: string
    namespace: string
    service: string
    portName?: string
  }
}

/** 打开 Redis 事件载荷 */
export interface OpenRedisPayload extends EventPayloadBase {
  name?: string
  host: string
  port: number
  password?: string
  db?: number
  connectionId?: string
  autoConnect?: boolean
  k8sContext?: {
    cluster: string
    namespace: string
    service: string
  }
}

/** 打开终端事件载荷 */
export interface OpenTerminalPayload extends EventPayloadBase {
  /** 连接目标（SSH 地址、K8s Pod 等） */
  target?: string
  /** 工作目录 */
  workingDirectory?: string
  /** 关联连接 ID */
  connectionId?: string
}

/** 打开文件管理器事件载荷 */
export interface OpenExplorerPayload extends EventPayloadBase {
  /** 初始路径 */
  path?: string
  /** 关联连接 ID */
  connectionId?: string
}

/** 导航到 K8s 资源事件载荷 */
export interface NavigateResourcePayload extends EventPayloadBase {
  /** 资源类型 */
  resourceType: string
  /** 资源名称 */
  resourceName: string
  /** 命名空间 */
  namespace: string
  /** 集群 */
  cluster?: string
}

// ─── 事件主题到载荷的映射 ─────────────────────────────────────────────────

/** 系统预定义事件主题 → 载荷类型映射 */
export interface SystemEventMap {
  'open:postgres': OpenDatabasePayload
  'open:mysql': OpenDatabasePayload
  'open:sqlite': OpenDatabasePayload
  'open:redis': OpenRedisPayload
  'open:terminal': OpenTerminalPayload
  'open:explorer': OpenExplorerPayload
  'navigate:resource': NavigateResourcePayload
}

/** 扩展事件映射（应用自定义事件通过 module augmentation 扩展） */
export interface AppEventMap extends SystemEventMap {}

/** 所有支持的事件主题 */
export type EventTopic = keyof AppEventMap

/** 获取事件主题对应的载荷类型 */
export type EventPayloadOf<T extends EventTopic> = AppEventMap[T]
```

### 3.2 事件注册与绑定

```typescript
// web/src/kernel/ipc/types.ts (续)

/** 应用可发送的事件声明 */
export interface EventEmitDecl<T extends EventTopic = EventTopic> {
  /** 事件主题 */
  topic: T
  /** 事件说明（用于文档和调试） */
  description?: string
}

/** 应用可处理的事件声明 */
export interface EventHandleDecl<T extends EventTopic = EventTopic> {
  /** 事件主题 */
  topic: T
  /** 收到事件时是否自动打开应用窗口（默认 true） */
  autoOpen?: boolean
  /** 处理优先级（数值越小越先执行，默认 0） */
  priority?: number
  /** 事件说明 */
  description?: string
}

/** 运行时事件处理器注册 */
export interface EventRegistration<T extends EventTopic = EventTopic> {
  /** 事件主题 */
  topic: T
  /** 处理函数 */
  handler: (payload: EventPayloadOf<T>) => void | Promise<void>
  /** 所属应用 ID */
  appId: string
  /** 优先级 */
  priority: number
}
```

### 3.3 AppManifest 扩展

```typescript
// 扩展 AppManifest 接口
export interface AppManifest {
  // ... 现有字段 ...

  // ── IPC 事件声明 ──────────────────────────────────────────────────────
  /**
   * 应用可发送的事件列表。
   * 声明后应用才被允许发送这些事件（运行时校验）。
   */
  emits?: EventEmitDecl[]

  /**
   * 应用可处理的事件列表。
   * 声明后 EventBus 在对应事件触发时自动路由到该应用。
   */
  handles?: EventHandleDecl[]
}
```

### 3.4 EventBus 核心 API

```typescript
// web/src/kernel/ipc/event-bus.ts

class EventBusImpl {
  /**
   * 注册事件处理器。
   * 通常在应用的 onActivate 生命周期中调用。
   * 返回注销函数。
   */
  on<T extends EventTopic>(
    appId: string,
    topic: T,
    handler: (payload: EventPayloadOf<T>) => void | Promise<void>,
    options?: { priority?: number }
  ): () => void

  /**
   * 发送事件。
   * 校验发送方是否在 manifest 中声明了该事件。
   * 自动附加 eventId、senderId、timestamp。
   * 如果接收方未打开且配置了 autoOpen，自动打开其窗口。
   */
  emit<T extends EventTopic>(
    senderId: string,
    topic: T,
    payload: Omit<EventPayloadOf<T>, keyof EventPayloadBase>
  ): Promise<void>

  /**
   * 查询已注册某个事件主题的所有应用。
   */
  getHandlers(topic: EventTopic): EventRegistration[]

  /**
   * 查询某个应用注册的所有事件处理器。
   */
  getAppHandlers(appId: string): EventRegistration[]

  /**
   * 注销某个应用的所有事件处理器（窗口关闭时调用）。
   */
  unregisterApp(appId: string): void
}

export const eventBus = new EventBusImpl()
```

### 3.5 React Hooks

```typescript
// web/src/kernel/ipc/hooks.ts

/**
 * 在组件中注册事件处理器。
 * 自动在组件卸载时注销。
 *
 * @example
 * useEventHandler('open:postgres', async (payload) => {
 *   await addOrUpdateConnection(payload)
 * })
 */
export function useEventHandler<T extends EventTopic>(
  topic: T,
  handler: (payload: EventPayloadOf<T>) => void | Promise<void>,
  options?: { priority?: number }
): void

/**
 * 获取事件发送函数。
 * 自动附加当前应用 ID。
 *
 * @example
 * const emit = useEventEmitter()
 * emit('open:postgres', { host: '...', port: 5432, ... })
 */
export function useEventEmitter(): <T extends EventTopic>(
  topic: T,
  payload: Omit<EventPayloadOf<T>, keyof EventPayloadBase>
) => Promise<void>
```

## 4. 应用清单扩展示例

### 4.1 K8s 应用 Manifest

```typescript
// web/src/apps/kubernetes/manifest.ts
export const manifest: AppManifest = {
  // ... 现有字段 ...
  permissions: ['network', 'connections', 'notifications', 'shell', 'ipc'],
  emits: [
    { topic: 'open:postgres', description: '打开 PostgreSQL 数据库连接' },
    { topic: 'open:mysql', description: '打开 MySQL 数据库连接' },
    { topic: 'open:redis', description: '打开 Redis 连接' },
    { topic: 'open:terminal', description: '打开终端连接' },
    { topic: 'open:explorer', description: '打开文件管理器' },
    { topic: 'navigate:resource', description: '导航到 K8s 资源' },
  ],
  handles: [
    { topic: 'navigate:resource', autoOpen: true, priority: 0 },
  ],
}
```

### 4.2 Database 应用 Manifest

```typescript
// web/src/apps/database/manifest.ts
export const manifest: AppManifest = {
  // ... 现有字段 ...
  permissions: ['network', 'connections', 'notifications', 'ipc'],
  emits: [
    { topic: 'open:terminal', description: '从数据库连接打开终端' },
  ],
  handles: [
    { topic: 'open:postgres', autoOpen: true, priority: 0 },
    { topic: 'open:mysql', autoOpen: true, priority: 0 },
    { topic: 'open:sqlite', autoOpen: true, priority: 0 },
  ],
}
```

### 4.3 Redis 应用 Manifest

```typescript
// web/src/apps/redis/manifest.ts
export const manifest: AppManifest = {
  // ... 现有字段 ...
  permissions: ['network', 'connections', 'notifications', 'ipc'],
  handles: [
    { topic: 'open:redis', autoOpen: true, priority: 0 },
  ],
}
```

## 5. 实现流程

### 5.1 K8s → Database 一键连接完整流程

```
1. 用户在 K8s 应用中右键点击一个 Service
2. K8s 应用通过端口/标签/镜像识别为 PostgreSQL 服务
3. 用户点击"打开数据库"菜单项
4. K8s 应用调用：
   eventBus.emit('kubernetes', 'open:postgres', {
     dbType: 'postgresql',
     name: 'my-pg-service',
     host: 'localhost',      // port-forward 后的地址
     port: 5432,
     database: 'mydb',
     username: 'postgres',
     connectionId: undefined, // 新增模式
     autoConnect: true,
     k8sContext: {
       cluster: 'my-cluster',
       namespace: 'default',
       service: 'my-pg-service',
     }
   })

5. EventBus 处理逻辑：
   a. 校验 'kubernetes' 是否在 manifest 中声明了 emits 'open:postgres' → 通过
   b. 自动生成 eventId，附加 senderId 和 timestamp
   c. 查找注册了 'open:postgres' 的处理器 → 找到 Database 应用
   d. 检查 Database 应用是否有窗口打开
      → 未打开且 autoOpen=true → 调用 openWindow('database')
      → 已打开 → focusWindow()
   e. 调用 Database 应用注册的 handler(payload)

6. Database 应用 handler 逻辑：
   a. 检查 payload.connectionId
      → 无 connectionId → 新增模式
        → 使用 dbApi.createDbConnection() 创建连接
        → 连接信息来自 payload（host, port, database, username, password）
      → 有 connectionId → 编辑模式
        → 使用 dbApi.updateDbConnection() 更新连接
   b. 如果 payload.autoConnect === true
      → 自动调用 dbApi.connectDb(connectionId)
   c. 刷新连接树，选中该连接
```

### 5.2 安全考量

| 风险 | 缓解措施 |
|------|----------|
| 应用越权发送事件 | 发送前校验 manifest 中是否声明了 emits |
| 应用越权处理事件 | 处理器只能通过 manifest 声明注册 |
| 密码泄露 | EventBus 日志中脱敏密码字段；密码仅传给接收方 |
| 事件风暴 | 单次 emit 同步执行所有 handler，不支持队列积压 |
| 循环触发 | EventBus 检测同一 eventId 的重复触发并阻断 |

### 5.3 调试支持

- EventBus 内部维护最近 100 条事件日志（环形缓冲区）
- 每条日志包含：eventId、topic、senderId、targetId、timestamp、脱敏载荷
- 开发模式下在控制台输出事件流
- 可通过 `eventBus.getRecentEvents()` 查询

## 6. 测试策略

| 测试类型 | 覆盖范围 |
|----------|----------|
| 单元测试 | EventBus 核心：注册、注销、发送、校验、自动打开 |
| 单元测试 | useEventHandler / useEventEmitter hooks |
| 集成测试 | K8s → Database 完整事件流 |
| 集成测试 | 事件日志记录与脱敏 |
| E2E 测试 | 用户操作 K8s Service → Database 自动打开并连接 |

## 7. 验收标准

| 序号 | 验收项 | 标准 |
|------|--------|------|
| 1 | 事件注册 | 应用可通过 manifest 声明 emits/handles，运行时通过 eventBus.on() 注册处理器 |
| 2 | 事件发送 | 应用可通过 eventBus.emit() 发送事件，自动校验权限 |
| 3 | 自动打开 | 接收方未打开时，autoOpen=true 自动打开窗口 |
| 4 | 载荷传递 | 事件携带完整连接信息，接收方可据此新增/编辑连接 |
| 5 | 类型安全 | 全链路 TypeScript 类型约束，编译时检查事件主题和载荷 |
| 6 | 安全校验 | 未声明的事件发送/处理被拒绝 |
| 7 | 调试支持 | 事件日志可查，密码脱敏 |
| 8 | 前端构建 | `cd web && pnpm build` 无错误 |
| 9 | 测试通过 | `cd web && pnpm test` 通过 |
