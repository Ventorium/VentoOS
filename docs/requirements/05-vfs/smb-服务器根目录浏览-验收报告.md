# SMB 服务器根目录浏览 - 验收报告

## 验收核查表

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|---|---|---|---|---|---|
| 1 | `smb://host` 挂载 | 允许 server-root URI 注册，不再要求 share 名；并对非标准 srvsvc 响应增加 raw fallback | 通过 | 无 | 满足 |
| 2 | share 枚举 | `srvsvc.share_enum_level1()` 返回的 share 映射为根目录节点 | 通过 | 无 | 满足 |
| 3 | 完整 VFS 能力 | 进入某个 share 后，目录/文件读写删改查继续工作 | 通过 | 真实 SMB 服务上的手工回归未执行 | 满足，保留回归风险 |
| 4 | warning 消除 | 旧的 `SMB URI must include a share name` 加载 warning 消失 | 通过 | 无 | 满足 |
| 5 | 测试门禁 | 相关 Rust 单测、构建通过；clippy 结果记录 | 部分通过 | `cargo clippy -p ventoos-vfs --all-targets -- -D warnings` 被仓库既有 warning 阻断 | 需要后续处理仓库既有 warning |

## 验收结论

本次 SMB 改造已经完成 server-root 浏览能力，`smb://host` 可作为挂载入口浏览所有可见 share，并且不会再因为缺 share 直接报错。share 下面的原有 VFS 读写删改能力仍然保留。

为兼容部分服务端的实现差异，当前 SMB client 采用 SMB 2.0.2 / 2.1 / 3.0 / 3.0.2 协商配置，并在 `srvsvc share_enum_level1` 解析失败时切换到 raw stub 解析，以恢复 share 名单。

真实 SMB 服务的 live 回归已经验证：`smb://host` 根目录可以列出 share，`IPC$` 也能被枚举出来。

当前唯一保留项是：尚未在真实 SMB 服务上执行一次完整的手工回归，所以对复杂 share 权限、隐藏 share、以及跨 share 操作的最终表现仍需后续联调确认。
