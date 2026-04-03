# 测试策略

> 版本：v2.0

---

## 1. 总体原则

- 每个系统模块和应用必须有完整的测试用例
- 测试必须使用真实数据，不能简单 mock
- 允许使用 Docker 启动所需的外部服务
- 测试覆盖率目标：所有公开 API 和核心业务逻辑 100%

---

## 2. 后端测试架构

### 2.1 Docker Compose 测试环境

```yaml
# native/tests/docker-compose.yml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    ports: ["5432:5432"]

  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: test
      MYSQL_DATABASE: testdb
    ports: ["3306:3306"]

  redis:
    image: redis:7
    ports: ["6379:6379"]

  redis-sentinel:
    image: bitnami/redis-sentinel:7.0
    depends_on: [redis]
    environment:
      REDIS_MASTER_HOST: redis
    ports: ["26379:26379"]

  minio:
    image: minio/minio:latest
    command: server /data
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000"]

  sftp:
    image: atmoz/sftp
    command: test:test:::upload
    ports: ["2222:22"]

  webdav:
    image: bytemark/webdav
    environment:
      AUTH_TYPE: Basic
      USERNAME: test
      PASSWORD: test
    ports: ["8080:80"]

  ftp:
    image: fauria/vsftpd
    environment:
      FTP_USER: test
      FTP_PASS: test
    ports: ["21:21", "21000-21010:21000-21010"]

  kind:
    image: kindest/node:v1.28.0
    privileged: true
    ports: ["6443:6443"]

  mock-llm:
    build: ./mock-llm
    ports: ["8090:8090"]
```

### 2.2 测试分层

```
native/
├── crates/
│   ├── ventoos-k8s/
│   │   └── tests/
│   │       ├── cluster_test.rs     # 集群管理
│   │       ├── resource_test.rs    # 资源 CRUD
│   │       ├── log_test.rs         # 日志流
│   │       ├── exec_test.rs        # Pod exec
│   │       └── portforward_test.rs # 端口转发
│   ├── ventoos-db/
│   │   └── tests/
│   │       ├── postgres_test.rs    # PostgreSQL 全功能
│   │       ├── mysql_test.rs       # MySQL 全功能
│   │       ├── sqlite_test.rs      # SQLite 全功能
│   │       ├── tunnel_test.rs      # SSH 隧道连接
│   │       └── export_test.rs      # 导出功能
│   ├── ventoos-redis/
│   │   └── tests/
│   │       ├── standalone_test.rs  # 单机模式
│   │       ├── sentinel_test.rs    # Sentinel 模式
│   │       ├── cluster_test.rs     # Cluster 模式
│   │       ├── datatypes_test.rs   # 全数据类型
│   │       ├── monitor_test.rs     # MONITOR
│   │       └── pubsub_test.rs      # Pub/Sub
│   ├── ventoos-vfs/
│   │   └── tests/
│   │       ├── local_test.rs       # Local Provider
│   │       ├── sftp_test.rs        # SFTP Provider
│   │       ├── s3_test.rs          # S3 Provider
│   │       ├── webdav_test.rs      # WebDAV Provider
│   │       ├── ftp_test.rs         # FTP Provider
│   │       ├── smb_test.rs         # SMB Provider
│   │       └── transfer_test.rs    # 跨 Provider 传输
│   ├── ventoos-agent/
│   │   └── tests/
│   │       ├── tool_test.rs        # Tool 注册与执行
│   │       ├── guard_test.rs       # 安全守卫
│   │       ├── session_test.rs     # 会话管理
│   │       └── provider_test.rs    # LLM Provider
│   ├── ventoos-connection/
│   │   └── tests/
│   │       ├── lifecycle_test.rs   # 连接生命周期
│   │       └── tunnel_test.rs      # SSH 隧道
│   ├── ventoos-task/
│   │   └── tests/
│   │       └── queue_test.rs       # 任务队列
│   └── ventoos-persist/
│       └── tests/
│           └── migration_test.rs   # 迁移测试
```

### 2.3 测试工具

```rust
// 公共测试工具模块
mod test_helpers {
    pub async fn wait_for_service(host: &str, port: u16, timeout: Duration) -> bool;
    pub async fn setup_test_postgres() -> PgPool;
    pub async fn setup_test_mysql() -> MySqlPool;
    pub async fn setup_test_redis() -> RedisConnection;
    pub async fn setup_test_minio() -> S3Client;
    pub async fn setup_kind_cluster() -> kube::Client;
}
```

---

## 3. 前端测试架构

### 3.1 工具栈

- **Vitest**：测试运行器
- **React Testing Library**：组件测试
- **MSW (Mock Service Worker)**：API 拦截
- **@testing-library/user-event**：用户交互模拟

### 3.2 测试分层

```
web/src/
├── apps/
│   ├── kubernetes/
│   │   └── __tests__/
│   │       ├── ClusterPanel.test.tsx
│   │       ├── ResourceList.test.tsx
│   │       ├── PodLogViewer.test.tsx
│   │       ├── PodTerminal.test.tsx
│   │       └── PortForwardPanel.test.tsx
│   ├── database/
│   │   └── __tests__/
│   │       ├── SqlEditor.test.tsx
│   │       ├── ResultTabs.test.tsx
│   │       ├── InlineEditor.test.tsx
│   │       └── ExportDialog.test.tsx
│   ├── redis/
│   │   └── __tests__/
│   │       ├── KeyTreeBrowser.test.tsx
│   │       ├── StreamEditor.test.tsx
│   │       ├── MonitorView.test.tsx
│   │       ├── PubSubView.test.tsx
│   │       └── StatsCharts.test.tsx
│   ├── explorer/
│   │   └── __tests__/
│   │       ├── FileList.test.tsx
│   │       ├── SearchBar.test.tsx
│   │       ├── DragDrop.test.tsx
│   │       └── TailViewer.test.tsx
│   ├── ai-assistant/
│   │   └── __tests__/
│   │       ├── MarkdownRenderer.test.tsx
│   │       ├── ConfirmDialog.test.tsx
│   │       ├── ToolCallCard.test.tsx
│   │       └── VoiceInput.test.tsx
│   └── settings/
│       └── __tests__/
│           ├── KeyboardSettings.test.tsx
│           ├── ColorPicker.test.tsx
│           └── DataSettings.test.tsx
├── shell/
│   └── __tests__/
│       ├── Window.test.tsx
│       ├── Dock.test.tsx
│       ├── Launchpad.test.tsx
│       └── NotificationCenter.test.tsx
├── kernel/
│   └── __tests__/
│       ├── windowStore.test.ts
│       ├── appStore.test.ts
│       └── channel.test.ts
└── test/
    ├── setup.ts              # 全局测试设置
    ├── mocks/
    │   ├── handlers.ts       # MSW 请求处理器
    │   └── server.ts         # MSW 服务器
    └── utils/
        ├── renderWithProviders.tsx  # 带 Provider 的渲染
        └── mockData.ts              # 测试数据工厂
```

### 3.3 MSW 配置

```typescript
// web/src/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  // K8s
  http.get('/api/k8s/clusters', () => HttpResponse.json({
    success: true,
    data: [{ id: '1', name: 'test-cluster', status: 'connected' }]
  })),

  // Database
  http.get('/api/db/connections', () => HttpResponse.json({
    success: true,
    data: [{ id: '1', name: 'test-pg', engine: 'postgresql', status: 'connected' }]
  })),

  // 更多处理器...
]
```

---

## 4. CI 集成

```yaml
# .github/workflows/ci.yml
test-backend:
  services:
    postgres: { image: postgres:15 }
    mysql: { image: mysql:8 }
    redis: { image: redis:7 }
    minio: { image: minio/minio }
  steps:
    - cargo test --workspace

test-frontend:
  steps:
    - pnpm test --coverage
```
