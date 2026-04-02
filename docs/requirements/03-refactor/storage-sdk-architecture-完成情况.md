# VentoOS 存储架构 & 应用 SDK 重构 - 完成情况

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|------|--------|--------|---------|---------|------|
| 1.1 | 后端 WindowStateManager 实现 | 主 agent | 已完成 | `cargo build` 通过 | `window_state.rs` - save_all/load_all/clear_all |
| 1.2 | 前端窗口 store 移除 localStorage persist，改为后端同步 | 主 agent | 已完成 | `pnpm build` 通过 | 移除 persist middleware，新增 loadFromBackend + scheduleSyncToBackend |
| 2.1 | 后端 StorageManager + per-app KV API | 主 agent | 已完成 | `cargo build` 通过 | `storage.rs` + 4 个路由 handler |
| 2.2 | 前端 storage SDK（useAppStorage hook） | 主 agent | 已完成 | `pnpm build` 通过 | `kernel/storage/sdk.ts` |
| 2.3 | UI SDK 统一出口整理 | 主 agent | 已完成 | `pnpm build` 通过 | `kernel/index.ts` 已导出 storage SDK |
| 3.1 | Explorer 使用 storage SDK 存储偏好 | 主 agent | 已完成 | `pnpm build` 通过 | showHidden 偏好通过 storage SDK 持久化 |
| 4.1 | 从 AppMenuItem/MenuItem 类型中移除 icon | 主 agent | 已完成 | `pnpm build` 通过 | 类型定义 + 所有使用处已清理 |
| 4.2 | 移除 icon 渲染和传递代码 | 主 agent | 已完成 | `pnpm build` 通过 | ContextMenu、TopBar、Explorer 中的 icon 代码已移除 |
| 5.1 | main.rs 默认存储路径改为 `./storage` | 主 agent | 已完成 | `cargo build` 通过 | `VENTOOS_DATA_DIR` 环境变量控制，默认 `./storage` |
| 5.2 | 数据库文件更名为 system.db | 主 agent | 已完成 | `cargo build` 通过 | 从 `ventoos.db` 改为 `system.db` |
| 6 | 后端 SettingsManager 实现 | 主 agent | 已完成 | `cargo build` 通过 | `settings.rs` - get/set/get_batch/delete |
| 7 | 前端 settings store 移除 localStorage persist | 主 agent | 已完成 | `pnpm build` 通过 | 同窗口 store 改造方式 |
| 8 | API 路由改为真正读写 SQLite | 主 agent | 已完成 | `cargo build` 通过 | get/save_desktop_state + get/save_window_states |

## 新增文件

| 文件 | 说明 |
|------|------|
| `native/crates/ventoos-persist/src/storage.rs` | Per-app KV StorageManager |
| `native/crates/ventoos-persist/src/settings.rs` | 系统设置 SettingsManager |
| `native/crates/ventoos-persist/src/window_state.rs` | 窗口状态 WindowStateManager |
| `web/src/kernel/storage/sdk.ts` | 前端 Storage SDK（createAppStorage + useAppStorage） |
| `web/src/kernel/storage/index.ts` | Storage SDK barrel export |

## 修改文件

| 文件 | 变更说明 |
|------|---------|
| `native/crates/ventoos-persist/src/lib.rs` | 导出新模块 |
| `native/crates/ventoos-server/src/main.rs` | 存储路径默认 `./storage`，DB 改名 system.db |
| `native/crates/ventoos-server/src/state.rs` | AppState 新增三个 manager 字段 |
| `native/crates/ventoos-server/src/routes.rs` | 实现真正的 settings/windows 读写 + storage KV 路由 |
| `web/src/infra/api/types.ts` | 新增 DesktopSettings、WindowStateDTO 类型 |
| `web/src/infra/api/client.ts` | 新增 storage API 方法，typed settings API |
| `web/src/kernel/index.ts` | 导出 storage SDK |
| `web/src/kernel/window/store.ts` | 移除 persist，新增后端同步 |
| `web/src/kernel/apps/menu.ts` | 移除 icon 字段 |
| `web/src/services/settings/store.ts` | 移除 persist，新增后端同步 |
| `web/src/services/settings/service.ts` | 简化为调用 store.loadFromBackend |
| `web/src/App.tsx` | 启动时加载后端状态 |
| `web/src/shell/ContextMenu/store.ts` | MenuItem 移除 icon |
| `web/src/shell/ContextMenu/index.tsx` | 移除 icon 渲染 |
| `web/src/shell/TopBar/index.tsx` | 移除 icon 映射 |
| `web/src/apps/explorer/index.tsx` | 移除菜单 icon，集成 storage SDK 持久化偏好 |

## 构建验证

| 验证项 | 结果 |
|--------|------|
| `cd web && pnpm build` | ✅ 通过（0 errors） |
| `cd native && cargo build` | ✅ 通过 |
| `cd native && cargo clippy` | ✅ 通过（仅 warnings，无 errors） |
