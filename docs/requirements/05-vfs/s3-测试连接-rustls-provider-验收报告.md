# S3 测试连接 rustls Provider Panic - 验收报告

## 验收核查表

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|---|---|---|---|---|---|
| 1 | 添加 S3 数据源时测试连接不能因 rustls provider 缺失而 panic | 服务启动链是否在首次 rustls 使用前安装默认 `CryptoProvider` | 通过 | 无 | `native/crates/ventoos-server/src/main.rs` 已增加启动初始化 |
| 2 | S3 适配器自身应具备 TLS 使用兜底能力 | `tls_connector()` 是否在构造 TLS client 前确保 provider 已安装 | 通过 | 无 | `native/crates/ventoos-vfs/src/s3.rs` 已增加幂等安装 |
| 3 | 修复应有最小回归验证 | 与本次问题直接相关的最小测试是否通过 | 通过 | 无 | `ventoos-vfs` 与 `ventoos-server` 的针对性测试均通过 |
| 4 | Rust 后端质量门禁 | `cd native && cargo clippy`、`cd native && cargo build` 是否通过 | 通过 | 无 | 命令已执行并通过，存在仓库既有 warning |
| 5 | VFS 相关测试门禁 | `cd native && cargo test -p ventoos-vfs --lib -- --nocapture` 是否通过 | 不通过 | 需要后续处理 SMB 过期/冲突测试 | 失败项为 `smb::tests::test_parse_smb_uri_no_share` |
| 6 | 前端质量门禁 | `cd web && pnpm build` 是否通过 | 不通过 | 需要先补齐当前环境 `node` | 当前环境报错 `env: node: No such file or directory` |

## 验收结论

本次 S3 测试连接 panic 的核心问题已修复，且相关最小回归测试、Rust 构建和 clippy 均已通过；因此“rustls provider 缺失导致 S3 测试连接 panic”这一子需求可判定为已完成。

但按仓库强化验收标准，当前仍存在两个未闭环项：

1. `cargo test -p ventoos-vfs --lib -- --nocapture` 受既有 SMB 测试失败影响，尚未全绿。
2. `cd web && pnpm build` 因环境缺少 `node` 未能执行成功。

因此本次问题修复已完成，但仓库级完整验收仍有阻塞，需要在后续继续处理上述两项。
