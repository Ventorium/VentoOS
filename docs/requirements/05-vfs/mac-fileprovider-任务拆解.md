# Mac FileProvider 替代 macFUSE — 任务拆解

## 原始需求

根据 Apple FileProvider 框架最新方案，深度分析使用该方案来替代 macFUSE 的可行性，将分析结果记录到文档中，然后对照文档去实施。不删除原来的 macFUSE 方案，做一个新的挂载方案，临时切换来尝试。

## 需求拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|------|----------|--------|----------|------|
| 1 | 深度分析 FileProvider 可行性 | 编写分析报告文档 | 文档包含框架分析、对比、架构设计、性能、问题与规避方案 | 已完成 |
| 2 | 不删除原来的 macFUSE 方案 | 保留 fuse_impl.rs 不修改 | fuse_impl.rs 无变更，cargo build 通过 | 进行中 |
| 3 | 做一个新的挂载方案 | 3.1 Rust 类型层：MountBackend 枚举 | types.rs 新增 MountBackend，编译通过 | 未开始 |
| 3 | 做一个新的挂载方案 | 3.2 Rust FileProvider 管理层 | fileprovider_impl.rs 实现域注册/注销/状态 | 未开始 |
| 3 | 做一个新的挂载方案 | 3.3 Rust Manager 双后端分发 | manager.rs 根据 backend 选择 fuse 或 fileprovider | 未开始 |
| 3 | 做一个新的挂载方案 | 3.4 Rust lib.rs 导出更新 | 新模块正确导出 | 未开始 |
| 3 | 做一个新的挂载方案 | 3.5 Swift FileProvider 扩展 | 完整 Extension 源码 + build.sh + README | 未开始 |
| 3 | 做一个新的挂载方案 | 3.6 Server Routes 更新 | API 支持 backend 参数 | 未开始 |
| 3 | 做一个新的挂载方案 | 3.7 前端 API 类型更新 | TypeScript 类型与后端一致 | 未开始 |
| 3 | 做一个新的挂载方案 | 3.8 前端 UI 更新 | MountForm 可选择挂载后端 | 未开始 |
| 4 | 临时切换尝试 | MountBackend 切换机制 | 可在 Fuse 和 FileProvider 之间切换 | 未开始 |
| 5 | 项目可运行无报错 | 前端 pnpm build 通过 | 无编译错误 | 未开始 |
| 5 | 项目可运行无报错 | 后端 cargo build + clippy 通过 | 无编译错误和警告 | 未开始 |
| 6 | 提交代码并 push | git commit + push | 代码已推送到远端 | 未开始 |

## 子任务详细说明

### 3.1 Rust 类型层
- 文件：`native/crates/ventoos-mount/src/types.rs`
- 新增 `MountBackend` 枚举（Fuse, FileProvider）
- 新增 `MountError::FileProvider(String)` 变体
- 不修改现有 `MountStatus` 和 `MountError` 的已有变体

### 3.2 Rust FileProvider 管理层
- 新文件：`native/crates/ventoos-mount/src/fileprovider_impl.rs`
- 仅 macOS 编译（`#[cfg(target_os = "macos")]`）
- 实现：
  - `register_domain(domain_id, display_name)` — 注册 FileProvider 域
  - `unregister_domain(domain_id)` — 注销域
  - `domain_status(domain_id)` — 查询域状态
  - `signal_changes(domain_id)` — 通知刷新
  - `is_fileprovider_available()` — 检查是否支持
  - `build_extension()` — 构建 Swift 扩展
  - `install_extension()` — 安装扩展

### 3.3 Rust Manager 双后端
- 文件：`native/crates/ventoos-mount/src/manager.rs`
- `mount()` 方法根据 `LocalMountConfig.backend` 分发
- 默认 backend 为 `Fuse`（向后兼容）
- FileProvider backend 调用 `fileprovider_impl` 方法

### 3.5 Swift FileProvider 扩展
- 目录：`native/fileprovider/`
- 文件结构：
  ```
  native/fileprovider/
  ├── README.md
  ├── build.sh
  ├── Makefile
  ├── Sources/
  │   ├── Extension.swift
  │   ├── FileProviderItem.swift
  │   ├── FileProviderEnumerator.swift
  │   └── VentoAPIClient.swift
  └── Resources/
      ├── Extension-Info.plist
      ├── Host-Info.plist
      └── VentoFS.entitlements
  ```

### 3.7-3.8 前端更新
- `api.ts`：添加 `MountBackend` 类型
- `index.tsx`：MountForm 增加"挂载后端"选择器
  - macOS 且非 local 类型的 mount 显示后端选择
  - 选项：FUSE（默认）、FileProvider
  - FileProvider 选中时显示说明文字

## 依赖关系

```
doc-analysis ──→ rust-types ──→ rust-fileprovider-impl ──→ rust-manager ──→ rust-server
     │                                    │                                      │
     └──→ swift-extension                 └──→ rust-lib                          │
                                                                                 │
                          frontend-api ──→ frontend-ui ──────────────────────────→│
                                                                                 ▼
                                                                           build-verify
                                                                                 │
                                                                           doc-completion
                                                                                 │
                                                                           git-commit
```
