# K8s 工作台架构设计

> 模块：kubernetes  
> 前端：web/src/apps/kubernetes/  
> 后端：native/crates/ventoos-k8s/  
> 版本：v2.0

---

## 1. 职责

K8s 工作台是 VentoOS 的核心应用之一，提供完整的 Kubernetes 集群管理功能：

- 多集群管理与切换
- 资源浏览（Workloads / Network / Storage / Config）
- Pod 实时日志流
- Pod Web Terminal（kubectl exec）
- Port-forward 管理
- 资源 YAML 查看/编辑
- Service → DB/Redis 直连
- Teleport 集成

---

## 2. 后端架构

### 2.1 Crate 结构

```
ventoos-k8s/
├── src/
│   ├── lib.rs            # 公共导出
│   ├── routes.rs         # Axum 路由定义
│   ├── manager.rs        # K8sManager 核心逻辑
│   ├── k8s_client.rs     # kube-rs 客户端封装
│   ├── types.rs          # 请求/响应类型
│   ├── log_stream.rs     # Pod 日志流 (NEW)
│   ├── exec.rs           # Pod exec 终端 (NEW)
│   ├── port_forward.rs   # Port-forward 管理 (NEW)
│   ├── teleport.rs       # Teleport 集成 (NEW)
│   └── service_bridge.rs # Service→App 直连 (NEW)
└── tests/
    ├── integration.rs    # 基于 kind 集群的集成测试
    └── docker-compose.yml
```

### 2.2 K8sManager

```rust
pub struct K8sManager {
    clusters: Arc<RwLock<HashMap<Uuid, ClusterState>>>,
    port_forwards: Arc<RwLock<HashMap<Uuid, PortForwardHandle>>>,
    log_streams: Arc<RwLock<HashMap<Uuid, JoinHandle<()>>>>,
    exec_sessions: Arc<RwLock<HashMap<Uuid, ExecSession>>>,
}

struct ClusterState {
    id: Uuid,
    name: String,
    client: kube::Client,
    config: kube::Config,
    teleport_session: Option<TeleportSession>,
}
```

### 2.3 API 路由

```
# 集群管理
POST   /api/k8s/clusters              → 添加集群
GET    /api/k8s/clusters              → 列举集群
DELETE /api/k8s/clusters/:id          → 删除集群
POST   /api/k8s/clusters/:id/test     → 测试连接

# 资源浏览
GET    /api/k8s/clusters/:id/namespaces
GET    /api/k8s/clusters/:id/resources/:kind?ns=&labels=
GET    /api/k8s/clusters/:id/resources/:kind/:name?ns=
GET    /api/k8s/clusters/:id/resources/:kind/:name/yaml?ns=
PUT    /api/k8s/clusters/:id/resources/:kind/:name/yaml?ns=
GET    /api/k8s/clusters/:id/resources/:kind/:name/events?ns=

# Pod 日志
POST   /api/k8s/clusters/:id/pods/:name/logs/stream    → WebSocket 升级
GET    /api/k8s/clusters/:id/pods/:name/logs?container=&tail=

# Pod Terminal
POST   /api/k8s/clusters/:id/pods/:name/exec           → WebSocket 升级

# Port-forward
POST   /api/k8s/clusters/:id/port-forward               → 创建转发
GET    /api/k8s/clusters/:id/port-forward               → 列举活跃转发
DELETE /api/k8s/clusters/:id/port-forward/:fwId          → 停止转发

# Service → App 桥接
GET    /api/k8s/clusters/:id/services/:name/detect      → 检测服务类型
POST   /api/k8s/clusters/:id/services/:name/bridge      → 建立连接桥
```

### 2.4 日志流架构

```
Browser (xterm.js) ←→ WebSocket ←→ Axum WS Handler
                                      ↓
                                 K8sManager
                                      ↓
                            kube::Api<Pod>.log_stream()
                                      ↓
                              Multiple pods aggregated
                              + regex filter
                              + timestamp prefix
                              + color coding per pod
```

### 2.5 Exec 终端架构

```
Browser (xterm.js) ←→ WebSocket ←→ Axum WS Handler
                                      ↓
                                 ExecSession
                                      ↓
                            kube::Api<Pod>.exec()
                                      ↓
                              stdin/stdout/stderr
                              + resize support
                              + session timeout
```

### 2.6 Port-forward 架构

```
LocalPort ←→ TCP Listener ←→ kube port-forward tunnel
                                      ↓
                              Pod:ContainerPort
```

```rust
struct PortForwardHandle {
    id: Uuid,
    cluster_id: Uuid,
    pod_name: String,
    namespace: String,
    local_port: u16,
    remote_port: u16,
    status: PortForwardStatus,  // active | closing | closed
    listener: JoinHandle<()>,
}
```

---

## 3. 前端架构

### 3.1 组件结构

```
apps/kubernetes/
├── index.tsx               # 应用入口 + 布局
├── components/
│   ├── ClusterPanel.tsx    # 集群列表/添加
│   ├── ResourceTree.tsx    # 资源类型导航树
│   ├── ResourceList.tsx    # 资源列表表格
│   ├── ResourceDetail.tsx  # 资源详情面板 (NEW)
│   ├── YamlEditor.tsx      # YAML Monaco 编辑器 (NEW)
│   ├── PodLogViewer.tsx    # Pod 日志查看器 (NEW)
│   ├── PodTerminal.tsx     # Pod Web Terminal (NEW)
│   ├── PortForwardPanel.tsx # 端口转发管理 (NEW)
│   ├── ServiceBridge.tsx   # Service 直连桥 (NEW)
│   └── LabelFilter.tsx    # Label 高级过滤 (NEW)
├── hooks/
│   ├── useCluster.ts
│   ├── useResources.ts
│   ├── usePodLogs.ts       # (NEW)
│   ├── usePodExec.ts       # (NEW)
│   └── usePortForward.ts   # (NEW)
└── types.ts
```

### 3.2 状态管理

```
K8s App State (Zustand slice or AppStorage)
├── clusters: ClusterInfo[]
├── activeCluster: ClusterId | null
├── activeNamespace: string
├── activeResource: { kind, name } | null
├── labelFilters: Record<string, string>
├── portForwards: PortForwardInfo[]
├── logSessions: LogSession[]
└── execSessions: ExecSession[]
```

---

## 4. Service → DB/Redis 直连

### 4.1 检测流程

```
1. 用户选择 K8s Service
2. 前端 GET /detect → 后端分析 Service:
   - 端口号猜测：5432=PostgreSQL, 3306=MySQL, 6379=Redis
   - Annotation 检测：app.kubernetes.io/component
   - ConfigMap/Secret 引用分析
3. 返回 DetectedService { type, port, credentials? }
4. 前端展示「在 Database/Redis App 中打开」按钮
```

### 4.2 桥接流程

```
1. POST /bridge → 后端创建 port-forward
2. 获取本地端口 + 凭据（从 Secret 解密）
3. 前端 openWindow('database', { host: '127.0.0.1', port, ...credentials })
4. Database App 自动建立连接
```

---

## 5. 测试策略

### 5.1 后端集成测试

- **环境**：Docker 启动 kind (Kubernetes in Docker) 集群
- **测试范围**：
  - 集群连接/断开
  - 资源列表（Pod/Deployment/Service/ConfigMap）
  - Pod 日志流（创建测试 Pod，验证日志输出）
  - Pod exec（执行 `echo hello`，验证输出）
  - Port-forward（创建 nginx Pod，转发 80 端口，HTTP 请求验证）
  - YAML 读写（修改 ConfigMap，验证变更）
  - Service 检测（创建带注解的 Service，验证类型识别）

### 5.2 前端测试

- **环境**：Vitest + React Testing Library + MSW
- **测试范围**：
  - 集群列表渲染与切换
  - 资源树导航
  - 日志查看器 UI 交互
  - Terminal 组件键入/显示
  - Port-forward 面板创建/停止
  - YAML 编辑器加载/保存
