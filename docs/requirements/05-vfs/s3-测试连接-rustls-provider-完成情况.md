# S3 测试连接 rustls Provider Panic - 完成情况

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 定位 `test-connection` 调用链与 panic 根因 | 主 agent | 已完成 | 已检查 `native/crates/ventoos-vfs/src/manager.rs`、`native/crates/ventoos-vfs/src/s3.rs`、`native/crates/ventoos-server/src/main.rs` | 根因是 rustls 0.23 在当前依赖特征组合下无法自动决定进程级 `CryptoProvider` |
| 2 | 服务端启动早期安装 rustls 默认 provider | 主 agent | 已完成 | `cargo test -p ventoos-server tests::test_install_rustls_crypto_provider_sets_default -- --exact --nocapture` 通过 | 修改 `native/crates/ventoos-server/src/main.rs`、`native/crates/ventoos-server/Cargo.toml` |
| 3 | S3 TLS connector 增加幂等兜底 | 主 agent | 已完成 | `cargo test -p ventoos-vfs s3::tests::test_tls_connector_installs_rustls_crypto_provider -- --exact --nocapture` 通过 | 修改 `native/crates/ventoos-vfs/src/s3.rs` |
| 4 | 修补现有 VFS 测试编译错误 | 主 agent | 已完成 | `cargo test -p ventoos-vfs -- --list` 可正常列出测试 | 为 `VfsListReq` 补齐 `show_hidden` 字段，修改 `native/crates/ventoos-vfs/src/manager.rs`、`native/crates/ventoos-vfs/src/tests.rs` |
| 5 | 执行 Rust 构建与静态检查 | 主 agent | 已完成 | `cargo build` 通过；`cargo clippy` 通过（有仓库既有 warning） | 未新增 clippy error |
| 6 | 执行仓库要求的全量 VFS 单元测试 | 主 agent | 部分完成 | `cargo test -p ventoos-vfs --lib -- --nocapture` 未全绿 | 存在既有失败：`smb::tests::test_parse_smb_uri_no_share` |
| 7 | 执行前端构建 | 主 agent | 阻塞 | `pnpm build` 失败：`env: node: No such file or directory` | 当前环境缺少 `node`，无法完成前端验收命令 |

## 实现说明

### 代码修改

| 路径 | 说明 |
|---|---|
| `native/crates/ventoos-server/src/main.rs` | 在服务启动最开始执行 `install_rustls_crypto_provider()`，并补充对应单元测试 |
| `native/crates/ventoos-server/Cargo.toml` | 为服务端添加 `rustls` workspace 依赖 |
| `native/crates/ventoos-vfs/src/s3.rs` | 在 `tls_connector()` 里调用幂等的 provider 安装逻辑 |
| `native/crates/ventoos-vfs/src/manager.rs` | 修补受 `VfsListReq.show_hidden` 字段影响的现有测试 |
| `native/crates/ventoos-vfs/src/tests.rs` | 同上，修补测试请求体编译错误 |

### 实际执行的验证命令

```bash
cd native && cargo test -p ventoos-vfs s3::tests::test_tls_connector_installs_rustls_crypto_provider -- --exact --nocapture
cd native && cargo test -p ventoos-server tests::test_install_rustls_crypto_provider_sets_default -- --exact --nocapture
cd native && cargo test -p ventoos-vfs --lib -- --nocapture
cd native && cargo clippy
cd native && cargo build
cd web && pnpm build
```

## 未完成项 / 阻塞项

| 序号 | 项目 | 状态 | 说明 |
|---|---|---|---|
| 1 | `cargo test -p ventoos-vfs --lib` 全绿 | 阻塞 | 现有 `smb::tests::test_parse_smb_uri_no_share` 与当前代码/需求方向不一致，非本次 S3 rustls 修复直接引入 |
| 2 | `cd web && pnpm build` | 阻塞 | 当前环境缺少 `node`，命令无法启动 |
