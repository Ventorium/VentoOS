# Redis 工作台架构设计

> 模块：redis  
> 前端：web/src/apps/redis/  
> 后端：native/crates/ventoos-redis/  
> 版本：v2.0

---

## 1. 职责

Redis 工作台提供完整的 Redis 数据库管理能力：

- 多连接模式（Standalone / Sentinel / Cluster）
- TLS 安全连接
- 键浏览（Trie 树命名空间）
- 全数据类型编辑（String / Hash / List / Set / ZSet / Stream）
- 内置 Redis CLI
- MONITOR 实时命令流
- Pub/Sub 订阅查看
- 批量操作
- INFO 统计图表与内存分析

---

## 2. 后端架构

### 2.1 Crate 结构

```
ventoos-redis/
├── src/
│   ├── lib.rs            # 公共导出
│   ├── routes.rs         # Axum 路由定义
│   ├── manager.rs        # RedisManager 核心逻辑
│   ├── types.rs          # 请求/响应类型
│   ├── resp.rs           # RESP 协议解析
│   ├── sentinel.rs       # Sentinel 模式 (NEW)
│   ├── cluster.rs        # Cluster 模式 (NEW)
│   ├── tls.rs            # TLS 连接 (NEW)
│   ├── monitor.rs        # MONITOR 命令流 (NEW)
│   ├── pubsub.rs         # Pub/Sub 管理 (NEW)
│   ├── stream.rs         # Stream 类型操作 (NEW)
│   ├── batch.rs          # 批量操作 (NEW)
│   └── stats.rs          # INFO 解析与统计 (NEW)
└── tests/
    ├── integration.rs
    ├── sentinel_test.rs
    ├── cluster_test.rs
    └── docker-compose.yml
```

### 2.2 RedisManager

```rust
pub struct RedisManager {
    connections: Arc<RwLock<HashMap<Uuid, RedisConnection>>>,
    monitors: Arc<RwLock<HashMap<Uuid, MonitorSession>>>,
    pubsubs: Arc<RwLock<HashMap<Uuid, PubSubSession>>>,
}

enum RedisConnection {
    Standalone(StandaloneConn),
    Sentinel(SentinelConn),
    Cluster(ClusterConn),
}

struct StandaloneConn {
    id: Uuid,
    config: RedisConfig,
    stream: TcpStream,        // or TlsStream
    tls: Option<TlsConfig>,
}

struct SentinelConn {
    id: Uuid,
    sentinels: Vec<SocketAddr>,
    master_name: String,
    current_master: SocketAddr,
    stream: TcpStream,
}

struct ClusterConn {
    id: Uuid,
    nodes: Vec<ClusterNode>,
    slot_map: HashMap<u16, SocketAddr>,  // slot → node
}
```

### 2.3 API 路由

```
# 连接管理
POST   /api/redis/connections              → 创建连接
GET    /api/redis/connections              → 列表连接
POST   /api/redis/connections/:id/test     → 测试连接
POST   /api/redis/connections/:id/connect  → 建立连接
DELETE /api/redis/connections/:id          → 删除连接

# 键浏览
GET    /api/redis/connections/:id/keys?pattern=&cursor=&count=
GET    /api/redis/connections/:id/keys/:key/info
GET    /api/redis/connections/:id/keys/:key/value
PUT    /api/redis/connections/:id/keys/:key/value
DELETE /api/redis/connections/:id/keys/:key
PUT    /api/redis/connections/:id/keys/:key/ttl

# Stream 类型 (NEW)
GET    /api/redis/connections/:id/keys/:key/stream?start=&end=&count=
POST   /api/redis/connections/:id/keys/:key/stream           → XADD
POST   /api/redis/connections/:id/keys/:key/stream/groups    → XGROUP CREATE

# 批量操作 (NEW)
POST   /api/redis/connections/:id/batch/delete    → 按 pattern 批量删除
POST   /api/redis/connections/:id/batch/ttl       → 按 pattern 批量设置 TTL
POST   /api/redis/connections/:id/batch/export    → 按 pattern 批量导出

# CLI (NEW)
POST   /api/redis/connections/:id/cli             → 执行 Redis 命令

# MONITOR (NEW) - WebSocket
POST   /api/redis/connections/:id/monitor/start   → 开始 MONITOR → WS
POST   /api/redis/connections/:id/monitor/stop    → 停止 MONITOR

# Pub/Sub (NEW) - WebSocket
POST   /api/redis/connections/:id/pubsub/subscribe    → 订阅频道 → WS
POST   /api/redis/connections/:id/pubsub/unsubscribe  → 取消订阅
POST   /api/redis/connections/:id/pubsub/publish      → 发布消息

# 统计 (NEW)
GET    /api/redis/connections/:id/info             → 解析 INFO 返回结构化数据
GET    /api/redis/connections/:id/memory/:key      → MEMORY USAGE key
GET    /api/redis/connections/:id/memory/stats      → MEMORY STATS
```

### 2.4 MONITOR 架构

```
Frontend (实时流列表) ←→ WebSocket ←→ Axum WS Handler
                                        ↓
                                   MonitorSession
                                        ↓
                              MONITOR command → Redis
                              (持续读取命令流)
                              + 时间戳解析
                              + 命令类型着色
                              + 频率统计
```

### 2.5 Pub/Sub 架构

```
Frontend (消息列表) ←→ WebSocket ←→ Axum WS Handler
                                     ↓
                               PubSubSession
                                     ↓
                           SUBSCRIBE channel
                           (持续读取消息)
                           + 频道着色
                           + 消息计数
```

---

## 3. 前端架构

### 3.1 组件结构

```
apps/redis/
├── index.tsx                  # 应用入口 + 三栏布局
├── components/
│   ├── ConnectionPanel.tsx    # 连接列表（含 Sentinel/Cluster 配置）
│   ├── KeyTreeBrowser.tsx     # Trie 树键浏览器
│   ├── ValueEditor.tsx        # 值编辑器（按类型分发）
│   ├── StringEditor.tsx       # String 编辑
│   ├── HashEditor.tsx         # Hash field 编辑
│   ├── ListEditor.tsx         # List 元素编辑
│   ├── SetEditor.tsx          # Set 成员编辑
│   ├── ZSetEditor.tsx         # ZSet score+member 编辑
│   ├── StreamEditor.tsx       # Stream 消息编辑 (NEW)
│   ├── RedisCli.tsx           # 内置 CLI
│   ├── MonitorView.tsx        # MONITOR 实时流 (NEW)
│   ├── PubSubView.tsx         # Pub/Sub 消息查看 (NEW)
│   ├── BatchOperations.tsx    # 批量操作面板 (NEW)
│   ├── StatsCharts.tsx        # INFO 统计图表 (NEW)
│   └── MemoryAnalysis.tsx     # 内存分析 (NEW)
├── hooks/
│   ├── useRedisConnection.ts
│   ├── useMonitor.ts          # (NEW)
│   ├── usePubSub.ts           # (NEW)
│   └── useRedisStats.ts       # (NEW)
└── types.ts
```

### 3.2 Sentinel 配置

```typescript
interface SentinelConfig {
  sentinels: Array<{ host: string; port: number }>
  masterName: string
  password?: string
  sentinelPassword?: string
}
```

### 3.3 Cluster 配置

```typescript
interface ClusterConfig {
  nodes: Array<{ host: string; port: number }>
  password?: string
  tls?: TlsConfig
}
```

---

## 4. 测试策略

### 4.1 后端集成测试

Docker Compose 启动：
- Redis 7 Standalone
- Redis 7 Sentinel (1 master + 2 replicas + 3 sentinels)
- Redis 7 Cluster (6 nodes: 3 master + 3 replica)

测试场景：
- 单机连接/断开/重连
- Sentinel 连接 + 主节点切换
- Cluster 连接 + slot 路由
- TLS 连接
- 全数据类型 CRUD（String/Hash/List/Set/ZSet/Stream）
- SCAN 遍历与 pattern 匹配
- MONITOR 命令流（并发写入→验证监控输出）
- Pub/Sub（发布→订阅→验证消息）
- 批量删除/TTL 操作
- INFO 解析
- MEMORY USAGE 分析

### 4.2 前端测试

- 连接配置表单（单机/Sentinel/Cluster）
- Trie 树键浏览渲染
- 值编辑器（各类型切换与编辑）
- CLI 命令输入与历史
- MONITOR 实时流显示
- Pub/Sub 订阅/取消/消息显示
- 批量操作确认对话框
- 统计图表渲染
