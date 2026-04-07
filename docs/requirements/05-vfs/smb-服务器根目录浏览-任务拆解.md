# SMB 服务器根目录浏览 - 任务拆解

## 需求背景

当前 SMB 挂载只支持 `smb://host/share`，导致 `smb://host` 或 `smb://host/` 在加载和测试连接时会报 `SMB URI must include a share name` 警告。用户希望直接挂载到 SMB 服务器根，并在 VFS 中浏览该服务器下的所有 share 目录。

---

## 原始需求与拆解

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 支持 `smb://host` 形式挂载并浏览所有 share | 调整 SMB URI 解析，允许 server-root 形式 | `smb://host` 和 `smb://host/` 均可注册成功 | 未开始 |
| 2 | 浏览服务器下所有 share 目录 | 通过 `srvsvc` 枚举 share，并将 share 映射为虚拟目录 | `list_dir("/")` 可返回 share 列表 | 未开始 |
| 3 | 保持完整 VFS 能力 | 让 list/read/write/mkdir/delete/move/copy/stat/search 继续对 share 内路径生效 | 进入某个 share 后所有原有 VFS 能力保持可用 | 未开始 |
| 4 | 消灭历史 warning | 更新 mount 加载与测试连接逻辑，避免无 share 配置报错 | 重启加载 `smb://host` 不再打印 share 缺失 warning | 未开始 |
| 5 | 保持测试覆盖 | 增加单元测试覆盖 server-root URI 解析与路径路由 | `cargo test -p ventoos-vfs` 通过相关测试 | 未开始 |

---

## 依赖关系

- 依赖 `smolder-smb-core` 现有 `connect_srvsvc()` / `share_enum_level1()` 能力
- 依赖 `VfsManager` 的 SMB 挂载加载、测试连接、目录操作入口
- 需要确保 share 级操作仍然沿用原有读写删改逻辑，不破坏其他协议适配器

---

## 实现方案

1. 将 SMB 挂载从“单 share”扩展为“server-root + share-root”两种模式。
2. `smb://host` 或 `smb://host/` 作为 server-root，通过 `srvsvc` 枚举 share。
3. `smb://host/share[/path]` 继续作为兼容的 share-root 挂载。
4. 在 VFS 路径层面把 share 名当作根目录下的虚拟目录节点，进入后再连接对应 share。
5. 对 `IPC$` 做基础过滤，默认不展示；其余隐藏 share 可按 `show_hidden` 控制。

---

## 重点验收点

- `smb://host` 可成功创建挂载并列出所有 share。
- 原有 `smb://host/share` 行为不回退。
- 访问 share 内部子目录时，`list/read/write/mkdir/delete/move/copy/stat/search` 仍然可用。
- 旧的“缺少 share 名称” warning 被消除。
- 相关测试用例覆盖到 server-root URI 解析与路径路由。
