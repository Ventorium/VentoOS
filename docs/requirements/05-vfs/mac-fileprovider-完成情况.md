# Mac FileProvider 替代 macFUSE — 完成情况

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|------|--------|--------|----------|----------|------|
| 1 | FileProvider 可行性分析报告 | 主 agent | ✅ 已完成 | 文档已创建 | `mac-fileprovider-分析报告.md` |
| 2 | 任务拆解文档 | 主 agent | ✅ 已完成 | 文档已创建 | `mac-fileprovider-任务拆解.md` |
| 3.1 | MountBackend 枚举类型 | 子 agent (rust) | ✅ 已完成 | cargo build 通过 | `ventoos-vfs/src/types.rs` |
| 3.2 | LocalMountConfig backend 字段 | 子 agent (rust) | ✅ 已完成 | 向后兼容 (#[serde(default)]) | `ventoos-vfs/src/types.rs` |
| 3.3 | MountError::FileProvider 变体 | 子 agent (rust) | ✅ 已完成 | cargo build 通过 | `ventoos-mount/src/types.rs` |
| 3.4 | fileprovider_impl.rs 域管理 | 子 agent (rust) | ✅ 已完成 | macOS only, cargo build 通过 | 新文件 |
| 3.5 | manager.rs 双后端分发 | 子 agent (rust) | ✅ 已完成 | Fuse/FileProvider 分发逻辑 | mount/unmount/status 已更新 |
| 3.6 | lib.rs 模块导出 | 子 agent (rust) | ✅ 已完成 | MountBackend 已导出 | - |
| 3.7 | Swift FileProvider 扩展 | 子 agent (swift) | ✅ 已完成 | build.sh 编译通过 | `native/fileprovider/` |
| 3.8 | Server Routes 更新 | 主 agent | ✅ 已完成 | 新增 check-fileprovider API | `deps.rs` |
| 3.9 | 前端 API 类型更新 | 主 agent | ✅ 已完成 | MountBackend 类型已添加 | `explorer/api.ts` |
| 3.10 | 前端 MountForm UI 更新 | 主 agent | ✅ 已完成 | 后端选择下拉框已添加 | `explorer/index.tsx` |
| 4 | 前端构建验证 | 主 agent | ✅ 已完成 | `pnpm build` 无错误 | 同时修复了预存的 git merge 冲突 |
| 5 | 后端构建验证 | 主 agent | ✅ 已完成 | `cargo build` + `cargo clippy` 通过 | 无新增警告 |

## 实现说明

### Rust 后端变更

#### ventoos-vfs/src/types.rs
- 新增 `MountBackend` 枚举（`Fuse` | `FileProvider`），默认 `Fuse`
- `LocalMountConfig` 新增 `backend: MountBackend` 字段，`#[serde(default)]` 保证向后兼容

#### ventoos-mount/src/types.rs
- `MountError` 新增 `FileProvider(String)` 变体

#### ventoos-mount/src/fileprovider_impl.rs（新文件）
- macOS only (`#[cfg(target_os = "macos")]`)
- `is_fileprovider_available()` — 检查 macOS 版本 >= 12
- `is_extension_installed()` — 检查 VentoFS.app 是否存在
- `register_domain()` — 注册 FileProvider 域
- `unregister_domain()` — 注销域
- `domain_status()` — 查询域状态
- `signal_changes()` — 通知刷新
- `cleanup_all_domains()` — 清理所有域

#### ventoos-mount/src/manager.rs
- `MountState` 新增 `MountedFileProvider` 变体
- `mount()` 根据 `config.backend` 分发到 `mount_fuse()` 或 `mount_fileprovider()`
- `unmount()` 根据状态选择 FUSE 或 FileProvider 卸载逻辑
- `status()` 处理 FileProvider 挂载状态
- 新增 `is_fileprovider_available()` 静态方法

#### ventoos-mount/src/lib.rs
- 新增 `fileprovider_impl` 模块（macOS only）
- 导出 `MountBackend`

#### ventoos-server/src/deps.rs
- 新增 `GET /api/dependencies/check-fileprovider` 路由

### Swift FileProvider 扩展

#### native/fileprovider/
- `Sources/Extension.swift` — NSFileProviderReplicatedExtension 实现
- `Sources/FileProviderItem.swift` — NSFileProviderItem 实现
- `Sources/FileProviderEnumerator.swift` — 目录枚举器
- `Sources/VentoAPIClient.swift` — HTTP 客户端（调用 VentoOS VFS API）
- `Sources/DomainManager.swift` — 域管理工具
- `Resources/` — Info.plist 和 entitlements
- `build.sh` — 构建脚本
- `Makefile` — 构建目标
- `README.md` — 使用说明

### 前端变更

#### web/src/apps/explorer/api.ts
- 新增 `MountBackend` 类型
- `LocalMountConfig` 新增 `backend?` 字段
- 新增 `checkFileProvider()` API 方法

#### web/src/apps/explorer/index.tsx
- MountForm 新增 `mountBackend` 状态
- 新增"挂载方式"下拉选择器（FUSE / FileProvider）
- 根据选择的后端显示不同的依赖检查结果
- FileProvider 选中时隐藏挂载路径输入（由系统管理）
- 提交时 `local_mount` 包含 `backend` 字段
- 同时修复了文件中预存的 6 处 git merge 冲突标记

## 未完成项

无。所有计划子任务均已完成。

## 后续优化建议

1. FileProvider 增量同步支持
2. 大文件流式传输优化
3. FileProvider 扩展的 CI 自动构建
4. 离线缓存策略
5. 前端 FileProvider 状态实时刷新
