# VentoOS 存储架构 & 应用 SDK 重构 - 任务拆解

## 原始需求

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|------|---------|--------|---------|------|
| 1 | 窗口状态必须来自后端，存储在系统级 SQLite | 1.1 后端实现真正的窗口状态 CRUD<br>1.2 前端移除 localStorage persist，改为从后端加载+防抖同步 | GET/PUT `/api/settings/windows` 读写 system.db 的 window_states 表；前端刷新后窗口状态从后端恢复 | 已完成 |
| 2 | 提供统一的应用开发 SDK（UI kit、storage kit、菜单注册等） | 2.1 后端 StorageManager + per-app KV API<br>2.2 前端 storage SDK（useAppStorage hook）<br>2.3 整理并导出 UI SDK（已有能力统一出口） | 前端可通过 `useAppStorage(appId)` 进行 KV 存取；后端在 per-app SQLite 中持久化 | 已完成 |
| 3 | Explorer 数据必须通过 storage SDK 持久化 | 3.1 Explorer 使用 storage SDK 存储自定义配置 | Explorer 的用户偏好设置通过 storage SDK 持久化 | 已完成 |
| 4 | 删除菜单项中的 icon | 4.1 从 AppMenuItem/ContextMenu 类型中移除 icon 字段<br>4.2 移除所有消费 icon 的渲染代码 | 菜单项不再显示 icon；TypeScript 类型中无 icon 字段 | 已完成 |
| 5 | 系统环境变量控制基础存储路径，默认 `./storage` | 5.1 修改 main.rs 中 dirs_data_dir() 默认为 `./storage`<br>5.2 创建目录结构 | `VENTOOS_DATA_DIR=./storage` 为默认值；所有数据存储在该目录下 | 已完成 |

## 架构设计

### 存储目录结构

```
$VENTOOS_DATA_DIR/ (默认: ./storage)
├── system.db              # 系统级 SQLite（窗口状态、桌面设置、连接信息等）
├── apps/
│   ├── explorer/
│   │   └── store.db       # Explorer 的 KV 存储
│   ├── kubernetes/
│   │   └── store.db
│   ├── database/
│   │   └── store.db
│   ├── redis/
│   │   └── store.db
│   ├── ai-assistant/
│   │   └── store.db
│   ├── ssh/
│   │   └── store.db
│   └── settings/
│       └── store.db
```

### 后端架构变更

#### 1. StorageManager（新增）

位置：`native/crates/ventoos-persist/src/storage.rs`

职责：
- 管理 per-app 存储目录和 SQLite 数据库
- 提供 KV 存取 API

```rust
pub struct StorageManager {
    data_dir: PathBuf,
    dbs: RwLock<HashMap<String, Arc<Mutex<Connection>>>>,
}

impl StorageManager {
    pub fn new(data_dir: PathBuf) -> Self;
    pub fn get_value(&self, app_id: &str, key: &str) -> Result<Option<String>>;
    pub fn set_value(&self, app_id: &str, key: &str, value: &str) -> Result<()>;
    pub fn delete_value(&self, app_id: &str, key: &str) -> Result<bool>;
    pub fn list_keys(&self, app_id: &str) -> Result<Vec<String>>;
}
```

Per-app SQLite schema:
```sql
CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

#### 2. SettingsManager（新增/重构）

位置：`native/crates/ventoos-persist/src/settings.rs`

职责：
- 管理系统级 settings KV（桌面壁纸、主题、Dock 设置等）
- 读写 system.db 的 settings 表

```rust
pub struct SettingsManager {
    db: Arc<Database>,
}

impl SettingsManager {
    pub fn get(&self, key: &str) -> Result<Option<String>>;
    pub fn set(&self, key: &str, value: &str) -> Result<()>;
    pub fn get_batch(&self, keys: &[&str]) -> Result<HashMap<String, String>>;
}
```

#### 3. WindowStateManager（新增）

位置：`native/crates/ventoos-persist/src/window_state.rs`

职责：
- 读写 system.db 的 window_states 表
- 提供批量保存/加载窗口状态

```rust
pub struct WindowStateManager {
    db: Arc<Database>,
}

impl WindowStateManager {
    pub fn save_all(&self, states: &[WindowState]) -> Result<()>;
    pub fn load_all(&self) -> Result<Vec<WindowState>>;
    pub fn clear_all(&self) -> Result<()>;
}
```

#### 4. AppState 变更

新增字段：
- `storage: Arc<StorageManager>` — per-app KV 存储
- `settings_mgr: Arc<SettingsManager>` — 系统设置管理
- `window_states: Arc<WindowStateManager>` — 窗口状态管理

#### 5. 新增 API 路由

```
# Per-app 存储
GET    /api/storage/{app_id}           → list_keys
GET    /api/storage/{app_id}/{key}     → get_value
PUT    /api/storage/{app_id}/{key}     → set_value
DELETE /api/storage/{app_id}/{key}     → delete_value

# 已有路由（实现真正的读写）
GET    /api/settings/windows           → load_all window_states
PUT    /api/settings/windows           → save_all window_states
GET    /api/settings/desktop           → 从 settings 表读取桌面配置
PUT    /api/settings/desktop           → 写入 settings 表
```

### 前端架构变更

#### 1. Storage SDK（新增）

位置：`web/src/kernel/storage/`

```typescript
// sdk.ts
export function useAppStorage(appId: string) {
  return {
    get: (key: string) => Promise<string | null>,
    set: (key: string, value: string) => Promise<void>,
    remove: (key: string) => Promise<boolean>,
    keys: () => Promise<string[]>,
  }
}
```

#### 2. Window Store 改造

移除 `persist` middleware。新增：
- 启动时从后端加载窗口状态
- 状态变更后防抖（500ms）同步到后端

#### 3. Settings Store 改造

移除 `persist` middleware。新增：
- 启动时从后端加载设置
- 设置变更后同步到后端

#### 4. 菜单类型改造

- 从 `AppMenuItem` 移除 `icon` 字段
- 从 `ContextMenu` 的 `MenuItem` 移除 `icon` 字段
- 移除 TopBar 和 ContextMenu 中的 icon 渲染逻辑

#### 5. Kernel 导出

从 `@/kernel` 统一导出 Storage SDK：
```typescript
export { useAppStorage } from './storage/sdk'
```

### 实现顺序

1. 修改 main.rs 存储路径默认值（最基础的变更）
2. 实现后端 SettingsManager + WindowStateManager（system.db 读写）
3. 实现后端 StorageManager（per-app KV 存储）
4. 重写 routes.rs 中的 stub handlers
5. 新增 storage API 路由
6. API client 添加 storage 方法
7. 实现前端 storage SDK
8. 改造 window store（移除 localStorage persist）
9. 改造 settings store（移除 localStorage persist）
10. 移除菜单 icon
11. Explorer 接入 storage SDK
12. 构建验证 + 测试
