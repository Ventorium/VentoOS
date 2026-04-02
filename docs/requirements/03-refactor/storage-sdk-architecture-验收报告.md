# VentoOS 存储架构 & 应用 SDK 重构 - 验收报告

## 验收核查表

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|------|---------|-----------|------|-----------|------|
| 1 | 窗口状态来自后端 SQLite | WindowStateManager 实现 save_all/load_all；前端 store 移除 persist，启动调 loadFromBackend | 通过 | - | 窗口状态存入 system.db window_states 表，前端启动时加载，变更后 500ms 防抖同步 |
| 2 | 统一应用 SDK（storage kit） | StorageManager per-app KV + useAppStorage hook + kernel 统一导出 | 通过 | - | `useAppStorage(appId)` 提供 get/set/remove/keys/getJSON/setJSON |
| 3 | Explorer 通过 storage SDK 持久化 | Explorer 使用 `useAppStorage('explorer')` 存储 showHidden 偏好 | 通过 | - | 偏好变更时自动写入后端，重新打开时自动恢复 |
| 4 | 菜单项无 icon | AppMenuItem 和 ContextMenu MenuItem 类型无 icon 字段；Explorer 菜单项已移除所有 icon | 通过 | - | 6 个无用 lucide 图标导入已清理 |
| 5 | 环境变量控制存储路径 | `VENTOOS_DATA_DIR` 环境变量，默认 `./storage`；DB = `system.db` | 通过 | - | 移除了 dirs_next 平台特定目录逻辑 |

## 构建验证结果

| 验证命令 | 执行结果 |
|---------|---------|
| `cd web && pnpm build` | ✅ 通过 - 0 error，811ms 完成（3次验证均通过） |
| `cd native && cargo build` | ✅ 通过 |
| `cd native && cargo clippy` | ✅ 通过（仅 pedantic 级别 warnings，无 error） |

## 架构验收

### 存储路径

- 默认：`./storage`（相对于工作目录）
- 环境变量覆盖：`VENTOOS_DATA_DIR=/custom/path`
- 系统 DB：`$DATA_DIR/system.db`
- 应用 KV：`$DATA_DIR/apps/{app_id}/store.db`

### 后端新增能力

| 组件 | 文件 | 职责 |
|------|------|------|
| StorageManager | `ventoos-persist/src/storage.rs` | Per-app 隔离 KV 存储 |
| SettingsManager | `ventoos-persist/src/settings.rs` | 系统级设置 KV |
| WindowStateManager | `ventoos-persist/src/window_state.rs` | 窗口状态批量 CRUD |

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/storage/{app_id}` | 列出 app 所有 key |
| GET | `/api/storage/{app_id}/{key}` | 读取 value |
| PUT | `/api/storage/{app_id}/{key}` | 写入 value |
| DELETE | `/api/storage/{app_id}/{key}` | 删除 key |
| GET | `/api/settings/desktop` | 读取桌面设置（真实 SQLite） |
| PUT | `/api/settings/desktop` | 写入桌面设置（真实 SQLite） |
| GET | `/api/settings/windows` | 加载所有窗口状态 |
| PUT | `/api/settings/windows` | 保存所有窗口状态 |

### 前端 SDK

| 导出 | 来源 | 用途 |
|------|------|------|
| `useAppStorage(appId)` | `@/kernel` | React hook，返回 KV 操作 API |
| `createAppStorage(appId)` | `@/kernel` | 非 React 环境的 KV 操作 |

### 数据流变更

**之前**：前端 Zustand persist → localStorage（刷新即恢复，后端不知情）

**之后**：前端 Zustand store → 变更触发 500ms 防抖 → PUT 后端 → SQLite 持久化；启动时 GET 后端 → hydrate store

## 结论

5 项原始需求全部完成，前端后端构建均通过验证。数据持久化从 localStorage 迁移到后端 SQLite，应用 SDK 已集成到 Explorer 作为示范。
