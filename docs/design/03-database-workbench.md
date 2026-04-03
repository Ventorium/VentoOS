# 数据库工作台架构设计

> 模块：database  
> 前端：web/src/apps/database/  
> 后端：native/crates/ventoos-db/  
> 版本：v2.0

---

## 1. 职责

数据库工作台提供完整的关系型数据库管理能力：

- 多引擎支持（PostgreSQL / MySQL / MariaDB / SQLite）
- Monaco SQL 编辑器（语法高亮、schema 感知自动补全）
- 多结果 Tab
- 表数据浏览与行内编辑
- 结果导出（CSV / JSON）
- SSH 隧道连接
- EXPLAIN 可视化
- AI 辅助 SQL 生成

---

## 2. 后端架构

### 2.1 Crate 结构

```
ventoos-db/
├── src/
│   ├── lib.rs            # 公共导出
│   ├── routes.rs         # Axum 路由定义
│   ├── manager.rs        # DbManager 核心逻辑
│   ├── types.rs          # 请求/响应类型
│   ├── pool.rs           # 连接池管理 (NEW)
│   ├── tunnel.rs         # SSH 隧道 (NEW)
│   ├── export.rs         # 结果导出 (NEW)
│   ├── completion.rs     # Schema 补全数据 (NEW)
│   └── explain.rs        # EXPLAIN 解析 (NEW)
└── tests/
    ├── integration.rs    # Docker PostgreSQL/MySQL 集成测试
    └── docker-compose.yml
```

### 2.2 DbManager

```rust
pub struct DbManager {
    connections: Arc<RwLock<HashMap<Uuid, DbConnection>>>,
    tunnels: Arc<RwLock<HashMap<Uuid, SshTunnel>>>,
}

struct DbConnection {
    id: Uuid,
    config: DbConnectionConfig,
    pool: Pool,                    // 连接池
    tunnel: Option<SshTunnelRef>,  // SSH 隧道引用
    schema_cache: Arc<RwLock<SchemaCache>>,
}

struct SchemaCache {
    schemas: Vec<SchemaInfo>,
    tables: HashMap<String, Vec<TableInfo>>,
    columns: HashMap<String, Vec<ColumnInfo>>,
    last_refresh: Instant,
}
```

### 2.3 API 路由

```
# 连接管理
POST   /api/db/connections                → 创建连接
GET    /api/db/connections                → 列表连接
POST   /api/db/connections/:id/test       → 测试连接
POST   /api/db/connections/:id/connect    → 建立连接
POST   /api/db/connections/:id/disconnect → 断开连接
DELETE /api/db/connections/:id            → 删除连接

# Schema 浏览
GET    /api/db/connections/:id/schemas
GET    /api/db/connections/:id/schemas/:schema/tables
GET    /api/db/connections/:id/schemas/:schema/tables/:table/columns
GET    /api/db/connections/:id/schemas/:schema/tables/:table/indexes
GET    /api/db/connections/:id/schemas/:schema/tables/:table/data?page=&size=

# SQL 执行
POST   /api/db/connections/:id/query      → 执行 SQL
POST   /api/db/connections/:id/explain    → EXPLAIN 查询 (NEW)

# 数据编辑 (NEW)
PUT    /api/db/connections/:id/schemas/:schema/tables/:table/rows
DELETE /api/db/connections/:id/schemas/:schema/tables/:table/rows

# 补全数据 (NEW)
GET    /api/db/connections/:id/completion  → 返回 schema/table/column 树

# 导出 (NEW)
POST   /api/db/connections/:id/export     → 导出查询结果（CSV/JSON）
```

### 2.4 SSH 隧道

```rust
struct SshTunnel {
    id: Uuid,
    ssh_config: SshTunnelConfig,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
    handle: JoinHandle<()>,
}

struct SshTunnelConfig {
    host: String,
    port: u16,
    username: String,
    auth: SshAuth,  // Password | PrivateKey
}
```

**隧道流程**：
```
Frontend → POST /connect { tunnel: { host, port, username, auth } }
  → DbManager 启动 SSH 连接 (russh)
  → 建立本地 TCP 监听 (127.0.0.1:random_port)
  → 端口转发：local_port → SSH → remote_host:remote_port
  → 使用 local_port 建立数据库连接
```

---

## 3. 前端架构

### 3.1 组件结构

```
apps/database/
├── index.tsx                # 应用入口 + 三栏布局
├── components/
│   ├── ConnectionPanel.tsx  # 连接列表/添加
│   ├── SchemaTree.tsx       # Schema/表树形导航
│   ├── SqlEditor.tsx        # Monaco SQL 编辑器 (NEW)
│   ├── ResultTabs.tsx       # 多结果 Tab 管理 (NEW)
│   ├── ResultTable.tsx      # 查询结果表格（虚拟滚动）
│   ├── InlineEditor.tsx     # 行内编辑组件 (NEW)
│   ├── ExportDialog.tsx     # 导出对话框 (NEW)
│   ├── ExplainView.tsx      # EXPLAIN 可视化 (NEW)
│   ├── TunnelConfig.tsx     # SSH 隧道配置 (NEW)
│   └── AISqlHelper.tsx      # AI SQL 辅助 (NEW)
├── hooks/
│   ├── useDbConnection.ts
│   ├── useSqlEditor.ts      # (NEW) Monaco 配置
│   └── useSchemaCompletion.ts # (NEW) Schema 补全
└── types.ts
```

### 3.2 Monaco SQL 编辑器

```typescript
// SqlEditor.tsx 关键设计
interface SqlEditorProps {
  connectionId: string
  defaultValue?: string
  onExecute: (sql: string) => void
}

// 补全 provider
class SchemaCompletionProvider implements monaco.languages.CompletionItemProvider {
  constructor(private schemaTree: SchemaTree) {}

  provideCompletionItems(model, position): CompletionList {
    // 1. 解析当前 SQL 上下文（FROM 后? WHERE 后? SELECT 后?）
    // 2. 根据上下文返回 schema/table/column/keyword 建议
    // 3. 优先显示当前 schema 的表和列
  }
}
```

### 3.3 多结果 Tab

```typescript
interface QueryResult {
  id: string
  sql: string
  columns: ColumnInfo[]
  rows: any[][]
  executionTime: number
  affectedRows?: number
  error?: string
  timestamp: Date
}

// ResultTabs 管理多个 QueryResult
// 新执行→新 Tab，可关闭/切换
```

---

## 4. EXPLAIN 可视化

### 4.1 数据格式

```
PostgreSQL: EXPLAIN (FORMAT JSON, ANALYZE) SELECT ...
MySQL: EXPLAIN FORMAT=JSON SELECT ...
```

### 4.2 可视化

- 树形节点图，每个节点显示：
  - 操作类型（Seq Scan / Index Scan / Hash Join 等）
  - 预估行数 vs 实际行数
  - 成本
  - 执行时间
- 热点着色（成本最高的节点标红）

---

## 5. 测试策略

### 5.1 后端集成测试

Docker Compose 启动：
- PostgreSQL 15
- MySQL 8

测试场景：
- 连接/断开/重连
- Schema 内省（tables, columns, indexes）
- SQL 查询（SELECT, INSERT, UPDATE, DELETE）
- 参数化查询
- 事务处理
- SSH 隧道连接（Docker 内 sshd + PostgreSQL）
- EXPLAIN 解析
- CSV/JSON 导出
- 连接池压力测试

### 5.2 前端测试

- Monaco 编辑器加载/输入
- 补全触发与选择
- 结果 Tab 增删切换
- 行内编辑保存/取消
- 导出对话框交互
- SSH 隧道配置表单验证
