# Shell 组件架构设计

> 模块：shell  
> 路径：web/src/shell/  
> 版本：v2.0

---

## 1. 职责

Shell 组件层构成 VentoOS 的桌面壳，包括：

- 桌面（壁纸、右键菜单）
- 顶部栏（时钟、任务中心、AI 入口、主题切换）
- Dock（应用启动器、运行指示、弹跳动画、badge、缩略图）
- 窗口组件（标题栏、红绿灯按钮、拖拽、缩放）
- 启动台（全屏网格搜索）
- 右键菜单（上下文操作）
- 通知中心

---

## 2. 模块结构

```
shell/
├── Desktop/
│   └── index.tsx          # 桌面背景 + 右键菜单触发
├── TopBar/
│   └── index.tsx          # 顶部状态栏
├── Dock/
│   └── index.tsx          # 应用启动器
├── Window/
│   └── index.tsx          # 窗口组件
├── WindowManager/
│   └── index.tsx          # 窗口管理器（渲染所有窗口）
├── Launchpad/
│   └── index.tsx          # 启动台
├── ContextMenu/
│   └── index.tsx          # 右键菜单系统
├── FilePicker/
│   └── index.tsx          # VFS 文件选择器
├── CommandPalette/
│   └── index.tsx          # ⌘+K 命令面板
├── WebShell/
│   └── index.tsx          # xterm.js 终端
├── NotificationCenter/
│   └── index.tsx          # 通知中心面板
├── NotificationToast/
│   └── index.tsx          # Toast 通知
├── TaskCenter/
│   └── index.tsx          # 任务中心
├── AISidePanel/
│   └── index.tsx          # AI 悬浮侧边栏
└── LoginScreen/
    └── index.tsx          # 登录/锁屏
```

---

## 3. Dock 增强设计

### 3.1 Badge 系统

```typescript
interface DockBadge {
  appId: string
  count?: number        // 数字 badge
  color?: string        // 自定义颜色
  pulse?: boolean       // 脉冲动画
}

// Badge 来源：
// - K8s: 活跃集群数 / 告警数
// - Database: 活跃连接数
// - Redis: 活跃连接数
// - AI: 进行中的任务数
// - Settings: 未保存变更
```

### 3.2 最小化缩略图

```
最小化窗口 → Dock 分隔区域显示缩略图

实现方案：
1. 窗口最小化前，使用 html2canvas 捕获窗口截图
2. 缩略图存储在 WindowStore
3. Dock 中间区域渲染缩略图列表
4. hover 缩略图 → 放大预览
5. 点击缩略图 → 恢复窗口

Dock 布局：
[固定图标区] | [缩略图区] | [AI 图标]
```

### 3.3 AI 图标动态状态

```typescript
type AIStatus = 'idle' | 'thinking' | 'executing' | 'error'

// idle: 静态图标
// thinking: 脉冲呼吸动画（opacity 0.4 → 1.0 循环）
// executing: 旋转动画
// error: 红色闪烁
```

---

## 4. 窗口最小化动画

### 4.1 动画设计

```
最小化：
1. 获取窗口当前 rect (x, y, width, height)
2. 获取 Dock 对应图标位置 (targetX, targetY)
3. Framer Motion animate:
   - scale: 1 → 0.1
   - x: currentX → targetX
   - y: currentY → targetY
   - opacity: 1 → 0
   - borderRadius: 8 → 24
   - duration: 300ms
   - ease: cubicBezier(0.4, 0, 0.2, 1)

恢复：
1. 从 Dock 位置反向动画至原位置
2. scale: 0.1 → 1
3. opacity: 0 → 1
```

### 4.2 实现方案

```typescript
// Window/index.tsx
const minimizeAnimation = {
  initial: { scale: 1, opacity: 1 },
  animate: minimized ? {
    scale: 0.1,
    x: dockIconPosition.x - window.position.x,
    y: dockIconPosition.y - window.position.y,
    opacity: 0,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
  } : {
    scale: 1, x: 0, y: 0, opacity: 1,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
  }
}
```

---

## 5. 应用内部状态恢复

### 5.1 协议

```typescript
// 每个应用需实现 appState 序列化
interface AppStateHandler {
  // 序列化当前状态
  serializeState(): Record<string, unknown>
  // 从序列化状态恢复
  restoreState(state: Record<string, unknown>): void
}

// 示例：K8s App
serializeState() → {
  activeCluster: 'cluster-1',
  activeNamespace: 'default',
  activeResource: { kind: 'Pod', name: 'nginx' },
  viewMode: 'list'
}

// 示例：Database App
serializeState() → {
  activeConnection: 'conn-1',
  activeSchema: 'public',
  sqlTabs: [{ sql: 'SELECT * FROM users', title: 'Query 1' }]
}
```

### 5.2 恢复时机

```
页面加载 → 后端返回窗口列表（含 appState）
  → WindowManager 创建窗口
  → 应用组件 mount
  → useEffect 中检查 appState
  → 调用 restoreState(appState)
  → 恢复 UI 状态
```

---

## 6. 测试策略

### 6.1 前端测试

Window 组件：
- 拖拽移动（mousedown→mousemove→mouseup）
- 缩放（resize handles）
- 最小化/最大化/关闭
- 最小化动画触发
- z-index 管理（点击置顶）
- 边缘吸附

Dock 组件：
- 图标渲染
- hover 放大效果
- 点击启动应用
- 运行中指示点
- Badge 渲染
- 缩略图区域
- AI 图标状态切换

Launchpad 组件：
- 全屏打开/关闭
- 搜索过滤
- 键盘导航
- 应用启动

WindowManager：
- 多窗口渲染
- 焦点切换
- 窗口关闭后清理
