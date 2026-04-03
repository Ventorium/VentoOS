# VentoOS 系统架构总览

> 版本：v2.0  
> 更新时间：2026-04-03

---

## 1. 架构哲学

VentoOS 是一个运行在本机的 WebOS，面向运维与基础设施管理场景。系统架构遵循以下核心原则：

- **本地优先**：凭据、缓存、任务历史、索引默认保存在本机
- **性能优先**：高频 I/O、连接池、隧道、日志流、文件传输在 Rust Core 完成
- **安全默认**：高风险写操作必须确认，凭据不暴露到前端
- **可恢复**：窗口、应用上下文、任务状态支持恢复
- **严守分层**：不跨层堆逻辑，协议层、领域层、应用层分离

---

## 2. 五层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Applications                                       │
│  K8s App │ Database App │ Redis App │ Explorer │ AI Assistant │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: WebOS Shell                                        │
│  Desktop │ TopBar │ Dock │ Window │ Launchpad │ Notifications│
├─────────────────────────────────────────────────────────────┤
│  Layer 3: System Services                                    │
│  Auth │ Connection │ Process │ Task │ Notification │ Settings│
│  Keyboard │ VFS Service │ AI Service                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Kernel                                             │
│  Window Manager │ App Registry │ Process Manager │ Channel   │
│  App Storage │ Bootstrap                                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Infrastructure                                     │
│  HTTP Client │ WebSocket Client │ Storage │ Logger           │
└─────────────────────────────────────────────────────────────┘
                           │
                    HTTP REST / WebSocket
                           │
┌─────────────────────────────────────────────────────────────┐
│  Rust Runtime Core (Axum)                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Layer (routes.rs)                                │   │
│  │  Auth │ K8s │ DB │ Redis │ VFS │ Agent │ Task │ SSH   │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Domain Layer (managers)                               │   │
│  │  K8sManager │ DbManager │ RedisManager │ VfsManager   │   │
│  │  AgentManager │ TaskManager │ ProcessManager           │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Infrastructure Layer                                  │   │
│  │  SQLite (persist) │ SSH │ WebSocket │ Connection Pool  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
              External Providers & Protocols
                           │
┌─────────────────────────────────────────────────────────────┐
│  Kubernetes │ PostgreSQL │ MySQL │ Redis │ SSH/SFTP/FTP     │
│  S3/OSS/R2 │ SMB │ WebDAV │ Teleport │ LLM APIs           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 前后端通信协议

### 3.1 HTTP REST

- **用途**：CRUD 操作、配置管理、一次性查询
- **格式**：JSON，统一 `ApiResponse<T>` 包装
- **路由前缀**：`/api/`
- **认证**：JWT Bearer Token

### 3.2 WebSocket

- **用途**：实时流（日志、watch、任务进度、通知、Agent 流式输出）
- **端点**：`/ws`
- **消息格式**：JSON，类型标签分发

```
WebSocket Message Types:
├── notification    → 通知推送
├── task_update     → 任务进度
├── k8s_log         → Pod 日志流
├── k8s_exec        → Pod Terminal I/O
├── k8s_watch       → 资源变更事件
├── redis_monitor   → MONITOR 命令流
├── redis_pubsub    → Pub/Sub 消息
├── agent_stream    → AI 响应流
├── agent_confirm   → 危险操作确认请求
├── vfs_watch       → 文件变更通知
└── port_forward    → 端口转发状态
```

### 3.3 统一响应格式

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: number
}
```

---

## 4. 数据流架构

### 4.1 CRUD 数据流

```
User Action → React Component → Service Hook → apiClient.request()
  → Vite Proxy → Axum Route Handler → Manager → External Provider
  → Response → apiClient → Service Hook → Component State Update → UI
```

### 4.2 实时数据流

```
External Event (K8s watch / Redis MONITOR / log stream)
  → Rust Tokio Task → WebSocket broadcast
  → Frontend wsClient → Event Subscription → Store Update → UI
```

### 4.3 窗口状态持久化

```
Window State Change → Zustand Store → 500ms debounce
  → Backend POST /api/windows/state → SQLite persist

Page Load → Backend GET /api/windows/state → SQLite read
  → Frontend → Window Store → Restore Windows
```

---

## 5. Crate 依赖图

```
ventoos-server (binary)
 ├── ventoos-core        (shared types, traits)
 ├── ventoos-persist     (SQLite storage)
 ├── ventoos-connection  (connection pool, tunnel)
 ├── ventoos-k8s         (Kubernetes adapter)
 │    └── ventoos-core
 ├── ventoos-db          (Database adapter)
 │    └── ventoos-core
 ├── ventoos-redis       (Redis adapter)
 │    └── ventoos-core
 ├── ventoos-vfs         (VFS adapter)
 │    ├── ventoos-core
 │    └── ventoos-k8s    (K8s Pod filesystem)
 ├── ventoos-agent       (AI agent system)
 │    ├── ventoos-core
 │    ├── ventoos-k8s    (K8s tools)
 │    ├── ventoos-db     (DB tools)
 │    ├── ventoos-redis  (Redis tools)
 │    └── ventoos-vfs    (VFS tools)
 └── ventoos-task        (Task engine)
      └── ventoos-core
```

---

## 6. 安全架构

### 6.1 认证

- 本地部署：Bcrypt 密码哈希 + JWT Token
- Token 过期与刷新机制
- 锁屏状态管理

### 6.2 凭据隔离

- 数据库/Redis/SSH 凭据存储在 Rust 后端 SQLite
- 前端只接收连接 ID 引用，不接收明文密码
- SSH 私钥仅在 Rust 进程内使用

### 6.3 操作安全

- AI Agent 工具执行分三级风险：Low / Medium / High
- High 风险操作需前端确认
- 命令执行有 Guard 机制（路径白名单、命令黑名单）

### 6.4 通信安全

- 开发模式：Vite proxy 转发
- 生产模式：前端资产 embed 到 Rust 二进制，单进程服务

---

## 7. 前端模块依赖图

```
Apps (Layer 5)
 ├── Shell Components (Layer 4)
 │    ├── kernel (Layer 2)
 │    │    ├── window/store    [Zustand]
 │    │    ├── apps/manager    [App registry]
 │    │    ├── channel         [SystemChannel]
 │    │    └── storage         [AppStorage]
 │    └── services (Layer 3)
 │         ├── auth/store      [Zustand]
 │         ├── settings/store  [Zustand]
 │         ├── notification/   [Store + Channel]
 │         ├── keyboard/       [Shortcut registry]
 │         └── vfs/            [VFS operations]
 └── infra (Layer 1)
      ├── api/client           [Axios-like fetch wrapper]
      ├── ws/                  [WebSocket manager]
      ├── storage/             [localStorage]
      └── logger/              [Console logger]
```

---

## 8. 部署架构

### 8.1 开发模式

```
Browser → localhost:5173 (Vite Dev Server)
           ├→ /api/*  proxy → localhost:5454 (Rust Axum)
           └→ /ws     proxy → localhost:5454 (Rust WebSocket)
```

### 8.2 生产模式

```
Browser → localhost:5454 (Rust Axum)
           ├→ /api/*       → REST handlers
           ├→ /ws          → WebSocket handler
           └→ /*           → rust-embed 静态资源
```

### 8.3 数据目录

```
$VENTOOS_DATA_DIR (default: ./storage)
 ├── system.db      [SQLite: auth, settings, window state, connections]
 └── apps/          [App-specific data]
```
