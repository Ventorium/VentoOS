# tokimo-package-vfs 改进 - 完成情况

## 概述

将 tokimo-package-vfs 的可借鉴设计模式移植到 VentoOS VFS 系统。详见对比分析。

## 完成项

| 序号 | 改进项目 | 来源 | 完成情况 | 涉及文件 | 验证结果 |
|------|---------|------|---------|---------|---------|
| 1 | S3 预签名 URL (link) | tokimo link() | ✅ 已完成 | `s3.rs`, `s3_driver.rs` | cargo build + test 通过 |
| 2 | SMB 读取优化: ReadHandleCache | tokimo LRU 缓存 | ✅ 已完成 | `smb.rs`, `smb_driver.rs` | cargo build + test 通过 |
| 3 | SMB 并行分块读取 | tokimo FuturesUnordered | ✅ 已完成 | `smb.rs` | cargo build + test 通过 |
| 4 | 挂载点前缀路由 | tokimo StorageManager | ✅ 已完成 | `manager.rs`, `routes.rs` | cargo build + test 通过 |
| 5 | ConfigPersister 模式 | tokimo ConfigPersister | ✅ 已完成 | `driver/mod.rs`, `manager.rs` | cargo build + test 通过 |
| 6 | 流式上传 (VfsPutStream) | tokimo stream upload | ✅ 已完成 | `local_driver.rs`, `s3_driver.rs` | cargo build + test 通过 |

## 详细实现说明

### 1. S3 预签名 URL

在 `S3Client` 上添加 `presign_get_url()` 方法：
- 使用已有的 SigV4 签名基础设施生成查询字符串认证
- 返回 (URL, 过期时间) 对，过期时间为 1 小时
- S3Driver 启用 `link: true`，link() 返回预签名 URL 而非默认值

### 2. SMB ReadHandleCache

添加 `ReadHandleCache` 结构体：
- LRU 策略，最多 16 个条目
- 仅缓存小于 10 MB 的文件
- 在写入/删除操作时自动失效
- 挂载移除时批量失效

### 3. SMB 并行分块读取

大文件（>= 20 MB）使用并行读取：
- 分成 1 MB 的块
- 最多 4 个并发连接（通过 try_join_all）
- 每个连接打开独立的 SMB 文件句柄，读取一个块范围
- 按顺序重新组装

### 4. 挂载点前缀路由

添加 `PrefixRouter` 结构体和 `VfsManager` 方法：
- 最长前缀匹配，挂载名前缀（/mount_name）→ mount_id
- 创建/更新/删除挂载时自动注册/注销
- 新增 API：`GET /api/vfs/resolve?path=vfs://mount_name/rel/path`
- 新增方法：`resolve_mount_by_path()`, `list_prefixes()`

### 5. ConfigPersister 模式

添加 `VfsConfigPersister` trait：
- 提供 `persist(key, value)` 和 `load(key)` 方法
- 注入到 `VfsDriverContext` 作为可选回调
- 为云端服务（OAuth 令牌刷新等）提供永续化通道

### 6. 流式上传

为 LocalDriver 和 S3Driver 实现 `VfsPutStream` trait：
- 通过 mpsc::Receiver 接收数据块，依次写入
- LocalDriver：支持大文件流式写入，不一次性加载到内存
- S3Driver：收集所有块后作为单个 PutObject 上传

## 验证结果

| 检查项 | 结果 |
|-------|------|
| `cargo build -p ventoos-vfs` | ✅ 通过 |
| `cargo build` (workspace) | ✅ 通过 |
| `cargo test -p ventoos-vfs` | ✅ 73 passed |
| `cargo test` (workspace) | ✅ 273 passed |
| `cargo clippy -p ventoos-vfs` | ✅ 无新增警告 |

## 架构对比

| 维度 | 改进前 | 改进后 |
|------|-------|-------|
| S3 下载 | 全部通过服务端代理 | 预签名 URL 直接下载（大文件不经过服务端） |
| SMB 读取 | 每次都打开/关闭句柄 | 小文件 LRU 缓存，大文件并行读取 |
| 路径路由 | 仅 mount_id 查找 | 支持路径前缀最长匹配（vfs://name/path） |
| 配置持久化 | 无驱动层 | 驱动可以通过回调持久化配置变更 |
| 上传 | 仅全量写入 | 支持流式写入（mpsc channel） |
