# 内核架构设计

> 模块：Kernel (web/src/kernel/)  
> 版本：v2.0

---

## 1. 职责

内核是 VentoOS 前端的核心层，负责：

- **窗口管理**：创建、销毁、移动、缩放、焦点、z-index、最小化/最大化
- **应用注册**：应用清单管理、组件加载、生命周期
- **进程管理**：PID 分配、状态跟踪
- **系统通道**：跨层事件通信
- **应用存储**：每个应用独立的持久化存储

---

## 2. 模块结构

```
kernel/
├── index.ts              # 公共 API 导出
├── bootstrap.ts          # 内核初始化流程
├── channel.ts            # SystemChannel 事件总线
├── window/
│   ├── store.ts          # Zustand 窗口状态
│   ├── manager.ts        # 窗口操作控制器
│   └── types.ts          # 窗口类型定义
├── apps/
│   ├── store.ts          # 应用注册表
│   ├── manager.ts        # 应用生命周期管理
│   └── registry.ts       # 内置应用注册
└── storage/
    └── appStorage.ts     # 应用独立存储 SDK
```

---

## 3. 窗口管理器

### 3.1 状态模型

```typescript
interface WindowInstance {
  id: string              // UUID
  appId: string           // 关联应用 ID
  title: string
  icon: LucideIcon
  position: { x: number; y: number }
  size: { width: number; height: number }
  minSize: { width: number; height: number }
  zIndex: number
  status: WindowStatus    // active | minimized | maximized | blurred
  isMaximized: boolean
  preMaximizeRect?: Rect  // 最大化前的位置/尺寸（用于还原）
  appState?: unknown      // 应用内部状态序列化
  tabStates?: unknown     // 应用 tab 状态
}

type WindowStatus = 'active' | 'minimized' | 'maximized' | 'blurred'
```

### 3.2 操作流程

```
openWindow(appId, params?)
  → 分配 WindowInstance
  → 计算初始位置（级联偏移/屏幕居中）
  → 加入 store.windows[]
  → 设置 zIndex 最高
  → 触发 onMount 渲染
  → 500ms 后同步到后端持久化

closeWindow(windowId)
  → 触发 beforeClose 回调（应用可阻止关闭）
  → 序列化 appState
  → 从 store.windows[] 移除
  → 通知后端删除持久化记录

minimizeWindow(windowId)
  → 计算 Dock 图标位置
  → Framer Motion 缩放动画至 Dock
  → 设置 status = 'minimized'
  → 在 Dock 中显示缩略图

restoreWindow(windowId)
  → 从 Dock 缩略图位置反向动画
  → 恢复原位置/尺寸
  → 设置 status = 'active'
  → zIndex 置顶
```

### 3.3 边缘吸附

```
鼠标拖拽至屏幕左边缘 → 窗口占左 50%
鼠标拖拽至屏幕右边缘 → 窗口占右 50%
鼠标拖拽至屏幕上边缘 → 窗口全屏
```

### 3.4 持久化

- 窗口状态通过 500ms 防抖同步到后端 SQLite
- 页面加载时从后端恢复所有窗口
- 每个窗口的 `appState` 字段存储应用内部状态（由各应用自行实现序列化）

---

## 4. 应用注册表

### 4.1 应用清单

```typescript
interface AppManifest {
  id: string              // 唯一 ID，如 'kubernetes'
  name: string            // 显示名称
  icon: LucideIcon
  description: string
  category: AppCategory   // system | devops | utility
  component: React.LazyComponent  // 懒加载组件
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }
  singleton: boolean      // 是否单实例
  keywords: string[]      // 搜索关键词
}
```

### 4.2 注册流程

```
bootstrap.ts
  → registerBuiltinApps()
      → registerApp('kubernetes', k8sManifest)
      → registerApp('database', dbManifest)
      → registerApp('redis', redisManifest)
      → registerApp('explorer', explorerManifest)
      → registerApp('ai-assistant', aiManifest)
      → registerApp('settings', settingsManifest)
      → registerApp('terminal', terminalManifest)
      → registerApp('ssh', sshManifest)
      → registerApp('file-viewer', fileViewerManifest)
```

---

## 5. SystemChannel 事件总线

### 5.1 设计原则

- 用于前端模块间解耦通信
- 发布/订阅模式
- 类型安全的事件定义

### 5.2 事件类型

```typescript
type SystemEvent =
  | { type: 'window:opened'; windowId: string; appId: string }
  | { type: 'window:closed'; windowId: string }
  | { type: 'window:focused'; windowId: string }
  | { type: 'app:stateChanged'; appId: string; state: unknown }
  | { type: 'notification:new'; notification: Notification }
  | { type: 'task:updated'; task: TaskUpdate }
  | { type: 'ai:statusChanged'; status: AIStatus }
  | { type: 'shortcut:triggered'; shortcut: string }
  | { type: 'connection:statusChanged'; connId: string; status: string }
```

---

## 6. 应用存储 SDK

### 6.1 API

```typescript
interface AppStorage {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

// 获取应用独立存储实例
function getAppStorage(appId: string): AppStorage
```

### 6.2 存储层级

```
AppStorage
  ├── 前端缓存：Zustand 内存
  ├── 本地缓存：localStorage (key = `app:${appId}:${key}`)
  └── 后端持久化：SQLite (通过 API 同步)
```
