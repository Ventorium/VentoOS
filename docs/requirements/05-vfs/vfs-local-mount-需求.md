# VFS 本地挂载需求文档

## 1. 需求背景

用户在管理远程存储源（S3、SFTP、SMB、FTP、WebDAV）时，希望能像使用 rclone mount 一样，将远程
文件系统挂载到本机某个目录，让本机任意程序（IDE、终端、浏览器等）透明读写远程文件，无需
通过 VentoOS Explorer UI 中转。

---

## 2. 功能需求

### 2.1 前端 — 挂载配置开关

在 Explorer 的 VFS 源配置表单（`MountForm`）中新增**通用挂载配置区块**：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| 启用本地挂载 | Toggle（Switch） | **关闭** | 控制是否启用 FUSE 挂载功能 |
| 挂载路径 | 文本输入框 | `~/mnt/<源名称>` | 本机挂载目录，仅在开关开启时显示 |

路径校验规则（前后端均需实施）：

- 不允许为空
- 路径分隔符只能是 `/`（Windows 采用 `\`，但在输入框层面统一显示 `/`，后端转换）
- 各路径段不允许含有以下字符：`\0` `*` `?` `"` `<` `>` `|`
- 不允许路径段为 `.` 或 `..`（防止目录遍历）
- 长度限制：整体路径不超过 512 字符，单个路径段不超过 255 字符
- 允许以 `~` 开头（home 目录展开由后端负责）

### 2.2 后端 — 配置存储

`VfsMount` 及 `PersistedVfsMount` 增加字段：

```rust
pub struct LocalMountConfig {
    /// 是否启用本地 FUSE 挂载
    pub enabled: bool,
    /// 挂载目标路径（`~` 由服务端展开）
    pub mount_point: String,
}
```

- 序列化为 JSON 存入 `vfs_mounts` 表的新列 `mount_config TEXT`（NULL 等价于未配置）。
- 新增 DB 迁移 `004_vfs_mount_config.sql`。

### 2.3 后端 — 挂载 / 卸载生命周期

#### 2.3.1 自动挂载

- 服务器启动时，遍历所有 `enabled=true` 的挂载源，自动执行挂载。
- 新建 / 更新挂载源时，若 `enabled=true`，自动执行挂载；若 `enabled=false` 且已挂载，自动卸载。
- 删除挂载源时，若已挂载先卸载再删除。

#### 2.3.2 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/vfs/mounts/:id/local-mount` | 手动触发挂载 |
| `DELETE` | `/api/vfs/mounts/:id/local-mount` | 手动触发卸载 |
| `GET` | `/api/vfs/mounts/:id/local-mount` | 查询当前挂载状态 |

挂载状态响应：

```json
{
  "mounted": true,
  "mount_point": "/Users/erguotou/mnt/my-s3",
  "error": null
}
```

### 2.4 跨平台 FUSE 实现

#### 技术选型

| 平台 | 机制 | Rust crate |
|---|---|---|
| Linux | kernel FUSE (libfuse3) | `fuse3` |
| macOS | macFUSE / FUSE-T | `fuse3`（macFUSE 兼容接口） |
| Windows | WinFSP | `winfsp` crate |

说明：
- `fuse3` crate 在 Linux/macOS 上直接链接系统 FUSE 库，最为底层，无子进程依赖。
- 需要用户安装 macFUSE（macOS）或 libfuse3-dev（Linux）；Windows 需安装 WinFSP。
- 通过条件编译 `#[cfg(target_os = "windows")]` 等区分平台实现后端，对外提供统一接口。

#### 虚拟文件系统接口

新建 `ventoos-mount` crate，向 `ventoos-vfs` 提供 `LocalMountManager` 服务：

```
native/crates/ventoos-mount/
├── Cargo.toml
└── src/
    ├── lib.rs          # 对外接口：LocalMountManager
    ├── types.rs        # MountStatus, MountConfig
    ├── validate.rs     # 路径合法性校验
    ├── fuse_impl.rs    # Linux/macOS FUSE 适配（fuse3 crate）
    └── winfsp_impl.rs  # Windows WinFSP 适配（feature gate）
```

`LocalMountManager` 核心方法：

```rust
impl LocalMountManager {
    pub async fn mount(&self, mount_id: &str, config: &LocalMountConfig, vfs: Arc<VfsManager>) -> Result<(), MountError>
    pub async fn unmount(&self, mount_id: &str) -> Result<(), MountError>
    pub fn status(&self, mount_id: &str) -> MountStatus
    pub async fn mount_all_enabled(&self, mounts: &[VfsMount], vfs: Arc<VfsManager>)
}
```

#### FUSE 文件系统实现覆盖的操作

| FUSE 操作 | 映射到 VfsManager |
|---|---|
| `getattr` / `lookup` | `stat` |
| `readdir` | `list_dir` |
| `open` / `read` | `get_object` / `read` |
| `create` / `write` / `fsync` | `put_object` / `write` |
| `unlink` / `rmdir` | `delete` |
| `rename` | `rename` / `move` |
| `mkdir` | `mkdir` |

---

## 3. 路径校验规范（前后端共用规则）

```
合法路径示例：
  ~/mnt/my-s3         ✓
  /home/user/mnt/s3   ✓
  C:\mnt\s3           ✓（仅 Windows）

非法路径例子：
  ../../../etc        ✗ 含 ..
  /mnt/my*folder      ✗ 含 *
  /mnt/my:folder      ✗ 含 :（Windows 禁止，Linux 允许但不建议）
  ""（空）            ✗
```

---

## 4. 非功能需求

- FUSE 挂载为**后台异步任务**，挂载失败不影响 VentoOS 正常启动与使用。
- 挂载失败错误信息通过 `LocalMountManager.status()` 查询，前端可在挂载源列表旁展示小图标提示。
- 卸载 (unmount) 时若挂载点有进程占用，先尝试 lazy unmount，再返回错误。
- `ventoos-mount` crate 不依赖除 `fuse3`/`winfsp`/`tokio` 以外的大型库。

---

## 5. 任务拆解

| 序号 | 子任务 | 交付物 | 验收标准 | 状态 |
|---|---|---|---|---|
| T1 | 设计并创建需求文档 | 本文档 | 文档齐全 | ✅ 已完成 |
| T2 | 后端：新增 `LocalMountConfig` 类型到 `ventoos-vfs/types.rs` | 类型定义 | 编译通过 | 未开始 |
| T3 | 后端：DB 迁移 `004_vfs_mount_config.sql` + `PersistedVfsMount` 新增字段 `mount_config` | 迁移文件 | 服务启动后表结构升级 | 未开始 |
| T4 | 后端：`VfsMountStore` 的 insert/update/load 支持 `mount_config` | 持久化代码 | 单元测试通过 | 未开始 |
| T5 | 后端：新建 `ventoos-mount` crate，实现 `LocalMountManager` 框架 + 路径校验 | crate 骨架 | cargo build 通过 | 未开始 |
| T6 | 后端：Linux/macOS FUSE 实现（fuse3 crate）| `fuse_impl.rs` | 基础文件读写可通过挂载点操作 | 未开始 |
| T7 | 后端：挂载/卸载 API 路由 `/api/vfs/mounts/:id/local-mount` | 路由代码 | curl 测试通过 | 未开始 |
| T8 | 后端：服务启动自动挂载 + 创建/删除源时联动 | `VfsManager` 联动 | 重启后已启用的源自动挂载 | 未开始 |
| T9 | 前端：`MountForm` 添加挂载配置区块（开关 + 路径输入 + 校验） | UI 代码 | 视觉符合设计，校验正确 | 未开始 |
| T10 | 前端：`VfsMount` / `CreateVfsMountReq` 类型增加 `mount_config` | api.ts | TypeScript 编译无错误 | 未开始 |
| T11 | 前端：挂载源列表旁显示挂载状态小图标 | UI 代码 | 已挂载显示✅，挂载失败显示⚠️ | 未开始 |
| T12 | 测试：ventoos-mount 单元测试 + 路径校验测试 | 测试文件 | cargo test 通过 | 未开始 |

---

## 6. 优先执行顺序

1. T2 → T3 → T4（后端数据层，互相依赖，顺序执行）
2. T5 → T6（新 crate，可后 T4 并行）
3. T7 → T8（API 路由依赖 T5/T6）
4. T9 → T10 → T11（前端，依赖 T2~T4 的类型定义）
5. T12（测试，最后补全）
