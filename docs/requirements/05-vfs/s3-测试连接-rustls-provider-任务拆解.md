# S3 测试连接 rustls Provider Panic - 任务拆解

## 背景

用户在 2026-04-02 反馈：通过 Explorer 新增 S3 数据源时，调用 `POST /api/vfs/mounts/test-connection` 会触发服务端 panic，错误为 rustls 无法自动确定进程级 `CryptoProvider`。

相关需求依据：

- `docs/requirements/01-core/ventoos-vfs.md`
- `docs/requirements/05-vfs/vfs-explorer-改进需求.md` 中“新增源时没有测试”

## 原始需求与拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 添加 S3 数据源时测试连接不能 panic | 定位 `test-connection -> VfsManager::test_connection -> S3Client HTTPS` 调用链中的根因 | 明确是 rustls `CryptoProvider` 未安装导致，而不是 URI/认证解析错误 | 已完成 |
| 2 | 修复 S3 测试连接的 TLS 初始化问题 | 在 S3 TLS 建连路径中确保 rustls 默认 provider 已安装，且重复调用安全 | 调用 TLS connector 构造逻辑时不再触发 panic | 进行中 |
| 3 | 为本次问题补回归测试 | 增加最小测试覆盖 rustls provider 未安装时的构造路径 | 新测试在修复前失败、修复后通过 | 未开始 |
| 4 | 验证当前修复不破坏 VFS 模块质量门禁 | 执行相关 `cargo test`，并执行仓库要求的 `cargo clippy`、`cargo build`、`pnpm build` | 命令有实际结果并记录到完成/验收文档 | 未开始 |

## 实现点映射

| 类别 | 路径 | 说明 |
|---|---|---|
| 服务端入口 | `native/crates/ventoos-server/src/main.rs` | 如需进程级初始化，可在这里安装全局 provider |
| VFS 管理 | `native/crates/ventoos-vfs/src/manager.rs` | `test_connection` 通过临时 mount 调用 S3 列表接口 |
| S3 适配器 | `native/crates/ventoos-vfs/src/s3.rs` | TLS connector 和 HTTPS 请求逻辑在这里 |
| 需求文档 | `docs/requirements/05-vfs/` | 输出拆解、完成情况、验收报告 |

## 风险与边界

- 只处理当前 S3 测试连接相关的 rustls provider 初始化问题，不扩大到无关协议改造。
- 工作区存在其他未提交修改，本次不回退、不覆盖无关文件。
