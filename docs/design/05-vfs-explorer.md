# VFS / 资源管理器架构设计

> 模块：vfs / explorer  
> 前端：web/src/apps/explorer/  
> 后端：native/crates/ventoos-vfs/  
> 版本：v2.0

---

## 1. 职责

VFS（Virtual File System）是 VentoOS 的统一文件系统抽象层，资源管理器是其前端应用：

- 统一 Provider 抽象（Local / SFTP / S3 / SMB / WebDAV / FTP / K8s Pod）
- 挂载点管理
- 文件操作（CRUD + 复制/移动/重命名）
- 跨挂载点传输
- 拖拽交互
- 快速搜索
- 日志实时 tail
- 文件变更 Watch

---

## 2. 后端架构

### 2.1 Crate 结构

```
ventoos-vfs/
├── src/
│   ├── lib.rs             # 公共导出
│   ├── routes.rs          # Axum 路由定义
│   ├── manager.rs         # VfsManager 核心逻辑
│   ├── types.rs           # 请求/响应类型
│   ├── local.rs           # Local Provider
│   ├── sftp.rs            # SFTP Provider
│   ├── s3.rs              # S3/OSS/R2 Provider
│   ├── smb.rs             # SMB Provider
│   ├── webdav.rs          # WebDAV Provider
│   ├── webdav_server.rs   # 内置 WebDAV 服务器
│   ├── ftp.rs             # FTP Provider
│   ├── k8s_pod.rs         # K8s Pod Provider (NEW)
│   ├── search.rs          # 文件搜索 (NEW)
│   ├── watch.rs           # 文件变更 Watch (NEW)
│   ├── archive.rs         # 压缩/解压 (NEW)
│   ├── chmod.rs           # 权限修改 (NEW)
│   ├── tail.rs            # 日志实时 tail (NEW)
│   └── tests.rs           # 测试
└── tests/
    ├── integration.rs
    └── docker-compose.yml
```

### 2.2 VFS Provider Trait

```rust
#[async_trait]
pub trait VfsProvider: Send + Sync {
    async fn list(&self, path: &str) -> Result<Vec<VfsNode>>;
    async fn read(&self, path: &str) -> Result<Vec<u8>>;
    async fn write(&self, path: &str, data: &[u8]) -> Result<()>;
    async fn mkdir(&self, path: &str) -> Result<()>;
    async fn delete(&self, path: &str) -> Result<()>;
    async fn rename(&self, from: &str, to: &str) -> Result<()>;
    async fn stat(&self, path: &str) -> Result<VfsNode>;
    async fn exists(&self, path: &str) -> Result<bool>;

    // NEW: Optional capabilities
    async fn search(&self, path: &str, pattern: &str) -> Result<Vec<VfsNode>> {
        Err(VfsError::NotSupported("search"))
    }
    async fn watch(&self, path: &str, tx: Sender<WatchEvent>) -> Result<WatchHandle> {
        Err(VfsError::NotSupported("watch"))
    }
    async fn chmod(&self, path: &str, mode: u32) -> Result<()> {
        Err(VfsError::NotSupported("chmod"))
    }
    async fn tail(&self, path: &str, lines: usize, tx: Sender<String>) -> Result<TailHandle> {
        Err(VfsError::NotSupported("tail"))
    }
}
```

### 2.3 K8s Pod Provider

```rust
pub struct K8sPodProvider {
    client: kube::Client,
    namespace: String,
    pod_name: String,
    container: Option<String>,
}

// 实现方式：
// list → kubectl exec tar -cf - <path> | 解析 tar listing
// read → kubectl exec cat <path>
// write → kubectl exec 接收 stdin + tee <path>
// mkdir → kubectl exec mkdir -p <path>
// delete → kubectl exec rm -rf <path>
```

### 2.4 API 路由

```
# 挂载点管理
POST   /api/vfs/mounts                     → 创建挂载点
GET    /api/vfs/mounts                     → 列表挂载点
PUT    /api/vfs/mounts/:id                 → 更新挂载点
DELETE /api/vfs/mounts/:id                 → 删除挂载点
POST   /api/vfs/mounts/test-connection     → 测试连接

# 文件操作
GET    /api/vfs/mounts/:id/ls?path=        → 列表目录
GET    /api/vfs/mounts/:id/read?path=      → 读取文件
POST   /api/vfs/mounts/:id/write?path=     → 写入文件
POST   /api/vfs/mounts/:id/mkdir?path=     → 创建目录
DELETE /api/vfs/mounts/:id/delete?path=    → 删除
POST   /api/vfs/mounts/:id/rename          → 重命名

# 跨挂载点操作
POST   /api/vfs/transfer                   → 跨挂载点复制/移动

# NEW: 搜索
GET    /api/vfs/mounts/:id/search?path=&pattern=

# NEW: Watch (WebSocket)
POST   /api/vfs/mounts/:id/watch?path=     → WebSocket 文件变更流

# NEW: Tail (WebSocket)
POST   /api/vfs/mounts/:id/tail?path=&lines=  → WebSocket 日志 tail 流

# NEW: 压缩/解压
POST   /api/vfs/mounts/:id/archive         → 压缩文件
POST   /api/vfs/mounts/:id/extract         → 解压文件

# NEW: 权限
PUT    /api/vfs/mounts/:id/chmod?path=&mode=
```

---

## 3. 前端架构

### 3.1 组件结构

```
apps/explorer/
├── index.tsx                  # 应用入口 + 布局
├── components/
│   ├── MountPanel.tsx         # 挂载点列表/添加
│   ├── Breadcrumb.tsx         # 路径面包屑
│   ├── FileList.tsx           # 文件列表（列表/图标视图）
│   ├── FileIcon.tsx           # 文件类型图标
│   ├── ContextMenu.tsx        # 右键菜单
│   ├── FileProperties.tsx     # 文件属性面板
│   ├── TransferQueue.tsx      # 传输任务队列
│   ├── SearchBar.tsx          # 快速搜索 (NEW)
│   ├── DragOverlay.tsx        # 拖拽预览层 (NEW)
│   ├── TailViewer.tsx         # 日志 tail 查看器 (NEW)
│   ├── ArchiveDialog.tsx      # 压缩/解压对话框 (NEW)
│   └── ChmodDialog.tsx        # 权限修改对话框 (NEW)
├── hooks/
│   ├── useFileList.ts
│   ├── useClipboard.ts        # VFS 剪贴板
│   ├── useDragDrop.ts         # (NEW) 拖拽逻辑
│   ├── useSearch.ts           # (NEW) 搜索
│   └── useWatch.ts            # (NEW) 文件变更
└── types.ts
```

### 3.2 拖拽架构

```
DnD 实现方案：HTML5 Drag and Drop API

拖拽场景：
1. 同挂载点内移动文件 → rename API
2. 跨挂载点复制/移动 → transfer API
3. 从桌面拖入文件 → write API (File Upload)

DragOverlay 渲染：
- 拖拽时显示文件名 + 图标
- 目标文件夹高亮
- 跨挂载点时显示「复制」/「移动」选择

状态管理：
- useDragDrop hook 管理拖拽状态
- VFS 剪贴板 store 管理剪切/复制缓冲
```

### 3.3 搜索架构

```
⌘+F → 打开 SearchBar
  → debounced 输入 → GET /search?pattern=
  → 结果列表（虚拟滚动）
  → 点击结果 → 导航到文件位置
  → Esc → 关闭搜索
```

---

## 4. 测试策略

### 4.1 后端集成测试

Docker Compose 启动：
- OpenSSH Server (SFTP)
- MinIO (S3 兼容)
- WebDAV Server (nginx + webdav)
- vsftpd (FTP)
- Samba (SMB)

测试场景（每个 Provider）：
- 连接/断开
- list 目录
- read/write 文件
- mkdir/delete/rename
- 大文件传输（> 10MB）
- 跨 Provider 传输
- 搜索（递归目录搜索）
- 权限修改（SFTP/Local）

K8s Pod Provider 额外测试：
- Docker 启动 kind 集群 + 部署 Pod
- 文件列表/读写/删除

### 4.2 前端测试

- 文件列表渲染（列表/图标视图切换）
- 面包屑导航
- 右键菜单操作
- 拖拽交互（同挂载点/跨挂载点）
- 搜索输入/结果/导航
- 传输队列进度显示
- 各类挂载点配置表单
