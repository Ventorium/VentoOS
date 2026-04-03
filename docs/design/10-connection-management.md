# 连接管理架构设计

> 模块：connection  
> 前端：web/src/services/connection/  
> 后端：native/crates/ventoos-connection/  
> 版本：v2.0

---

## 1. 职责

连接管理是 VentoOS 的基础设施层，统一管理所有外部连接：

- 连接生命周期（创建、测试、连接、断开、删除）
- 凭据安全存储
- SSH 隧道管理
- 连接池
- 连接状态监控
- 连接统一模型

---

## 2. 统一连接模型

```rust
pub struct Connection {
    pub id: Uuid,
    pub name: String,
    pub conn_type: ConnectionType,
    pub status: ConnectionStatus,
    pub config: ConnectionConfig,
    pub tunnel: Option<TunnelConfig>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_connected_at: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
}

pub enum ConnectionType {
    Kubernetes,
    Teleport,
    PostgreSQL,
    MySQL,
    SQLite,
    Redis,
    SSH,
    SFTP,
    FTP,
    SMB,
    S3,
    WebDAV,
}

pub enum ConnectionStatus {
    Draft,
    Testing,
    Available,
    Connected,
    Expired,
    Reconnecting,
    AuthFailed,
    NetworkError,
    PermissionDenied,
}

pub enum TunnelConfig {
    None,
    Ssh(SshTunnelConfig),
    Http(HttpTunnelConfig),
}

pub struct SshTunnelConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub local_bind_port: Option<u16>,
}
```

---

## 3. 凭据管理

### 3.1 安全原则

- 凭据在 Rust 后端加密存储（SQLite）
- 前端只接收连接 ID，不接收明文密码
- SSH 私钥仅在 Rust 进程内使用
- 连接配置显示时密码字段脱敏

### 3.2 存储方式

```rust
// 凭据存储在 SQLite，密码字段使用 AES-256-GCM 加密
pub struct CredentialStore {
    db: SqlitePool,
    key: [u8; 32],  // 从系统密钥链 (keyring) 获取
}
```

---

## 4. SSH 隧道管理

```rust
pub struct TunnelManager {
    tunnels: Arc<RwLock<HashMap<Uuid, ActiveTunnel>>>,
}

struct ActiveTunnel {
    id: Uuid,
    connection_id: Uuid,
    ssh_session: russh::client::Handle,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
    handle: JoinHandle<()>,
}

// 隧道创建流程：
// 1. 建立 SSH 连接 (russh)
// 2. 分配本地随机端口
// 3. 启动 TCP 监听
// 4. 转发所有流量：local_port → SSH → remote_host:remote_port
// 5. 返回本地端口供上层使用
```

---

## 5. 测试策略

### 5.1 后端集成测试

Docker 环境：
- OpenSSH Server（SSH 隧道测试）
- PostgreSQL + MySQL（通过隧道连接）

测试场景：
- 连接创建/删除 CRUD
- 连接状态转换
- SSH 隧道建立/关闭
- 通过 SSH 隧道连接数据库
- 凭据加密存储/读取
- 连接池行为
- 重连机制
