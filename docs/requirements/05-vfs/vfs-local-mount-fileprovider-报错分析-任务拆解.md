# VFS Local Mount FileProvider 报错分析 - 任务拆解

## 背景

当前 `POST /api/vfs/mounts/:id/local-mount` 在 `backend=fileprovider` 场景下返回 500，日志显示：

- `VentoFS register failed`
- `NSFileProviderErrorDomain Code=-2001`
- `NSUnderlyingError Code=-2014`

本次任务目标不是直接修复，而是先完成根因分析，判断：

1. 报错发生在哪一层
2. 当前 `VentoFS.app` / `.appex` 是否真的可用
3. 这套方案当前对用户是否足够简单、是否需要用户感知复杂度

## 任务拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 分析挂载报错原因 | 梳理 `local-mount -> LocalMountManager -> fileprovider_impl -> VentoFS CLI -> NSFileProviderManager.add()` 调用链 | 能定位错误发生层级 | 已完成 |
| 2 | 分析挂载报错原因 | 本机复现 `VentoFS register` 并采集系统侧证据 | 能稳定复现相同错误 | 已完成 |
| 3 | 分析挂载报错原因 | 检查 `VentoFS.app` 安装、签名、插件注册状态 | 能判断扩展是否被 macOS 识别 | 已完成 |
| 4 | 判断当前扩展能否使用 | 对照证据评估 `VentoFS.app` 当前可用性 | 给出明确可用/不可用结论 | 已完成 |
| 5 | 判断用户是否无需感知 | 评估当前 UI/后端可用性检测是否足够透明 | 给出是否“用户无感”结论与差距 | 已完成 |

## 依赖与边界

- 需求文档：`docs/requirements/05-vfs/vfs-local-mount-需求.md`
- 相关设计与说明：
  - `docs/requirements/05-vfs/FileProvider挂载使用指南.md`
  - `docs/requirements/05-vfs/mac-fileprovider-分析报告.md`
- 后端实现：
  - `native/crates/ventoos-mount/src/manager.rs`
  - `native/crates/ventoos-mount/src/fileprovider_impl.rs`
  - `native/fileprovider/Sources/main.swift`
  - `native/fileprovider/build.sh`

## 说明

- 本次仅做分析与验收，不修改业务代码。
- 后续若进入修复阶段，应单独补“实现型”任务拆解与回补文档。
