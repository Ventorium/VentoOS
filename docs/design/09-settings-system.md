# 设置系统架构设计

> 模块：settings  
> 前端：web/src/apps/settings/ + web/src/services/settings/  
> 版本：v2.0

---

## 1. 职责

设置系统管理 VentoOS 的所有用户偏好与系统配置：

- 主题（Dark / Light / Auto）
- 壁纸
- 强调色自定义
- 桌面与 Dock 设置
- AI Provider / Agent Profile
- 通知行为
- 快捷键自定义
- 配置导入导出

---

## 2. 架构设计

### 2.1 设置分类

```
Settings
├── General           # 语言、启动行为
├── Appearance        # 主题、壁纸、强调色
├── Desktop & Dock    # Dock 位置、大小、放大效果
├── Keyboard          # 快捷键自定义
├── Notifications     # 通知行为设置
├── AI                # Provider、Agent Profile、运行时
└── Data              # 配置导入导出
```

### 2.2 快捷键系统

```typescript
interface KeyboardShortcut {
  id: string              // 唯一标识，如 'window.close'
  description: string     // 人类可读描述
  defaultKeys: string     // 默认键组合，如 'Meta+W'
  customKeys?: string     // 用户自定义键组合
  category: string        // 分类，如 'Window' | 'Navigation' | 'AI'
  scope: 'global' | 'app' // 全局 or 应用内
}

// 预注册的快捷键
const builtinShortcuts: KeyboardShortcut[] = [
  { id: 'window.close', description: '关闭窗口', defaultKeys: 'Meta+W', category: 'Window', scope: 'global' },
  { id: 'window.minimize', description: '最小化窗口', defaultKeys: 'Meta+M', category: 'Window', scope: 'global' },
  { id: 'window.maximize', description: '最大化窗口', defaultKeys: 'Meta+Shift+F', category: 'Window', scope: 'global' },
  { id: 'ai.toggle', description: '打开/关闭 AI', defaultKeys: 'Meta+Shift+A', category: 'AI', scope: 'global' },
  { id: 'search.open', description: '命令面板', defaultKeys: 'Meta+K', category: 'Navigation', scope: 'global' },
  { id: 'launchpad.open', description: '启动台', defaultKeys: 'F4', category: 'Navigation', scope: 'global' },
  { id: 'explorer.search', description: '文件搜索', defaultKeys: 'Meta+F', category: 'Explorer', scope: 'app' },
  { id: 'db.execute', description: '执行 SQL', defaultKeys: 'Meta+Enter', category: 'Database', scope: 'app' },
]
```

### 2.3 快捷键自定义 UI

```
Settings → Keyboard Tab
├── 分类分组列表
│   ├── Window
│   │   ├── 关闭窗口      [⌘W]  [编辑按钮]
│   │   ├── 最小化窗口    [⌘M]  [编辑按钮]
│   │   └── ...
│   ├── AI
│   │   └── 打开 AI       [⌘⇧A] [编辑按钮]
│   └── ...
└── 编辑模式：
    点击「编辑」→ 进入按键录制模式
    → 用户按下新组合键
    → 冲突检测（与已有快捷键冲突时提示）
    → 确认保存 / 取消
    → 「恢复默认」按钮
```

### 2.4 强调色自定义

```typescript
// 当前：预设 8 色
// 增强：自定义颜色选择器

interface AccentColorConfig {
  preset: string | null          // 预设颜色 ID
  custom: string | null          // 自定义 hex 颜色
}

// UI：
// [预设色块 8 个] + [+ 自定义] 按钮
// 点击 [+ 自定义] → 弹出颜色选择器（HSL picker）
// 选择后实时预览
// 自动计算衍生色（hover、active、disabled 状态）
```

### 2.5 配置导入导出

```typescript
interface ExportConfig {
  version: string
  exportDate: string
  settings: UserSettings
  connections: ConnectionConfig[]
  shortcuts: KeyboardShortcut[]
  aiProviders: AIProviderConfig[]
  aiProfiles: AIProfileConfig[]
}

// 导出：JSON 文件下载
// 导入：文件上传 → 解析 → 版本兼容检查 → 合并/覆盖选择 → 应用
```

---

## 3. 组件结构

```
apps/settings/
├── index.tsx                    # 设置入口 + 左侧Tab导航
├── components/
│   ├── GeneralSettings.tsx
│   ├── AppearanceSettings.tsx
│   ├── DesktopDockSettings.tsx
│   ├── KeyboardSettings.tsx     # (NEW)
│   ├── NotificationSettings.tsx
│   ├── AISettings.tsx
│   ├── DataSettings.tsx         # (NEW) 导入导出
│   ├── ColorPicker.tsx          # (NEW) HSL 颜色选择器
│   └── ShortcutEditor.tsx       # (NEW) 快捷键录制器
└── types.ts
```

---

## 4. 测试策略

### 4.1 前端测试

- 各设置面板渲染
- 主题切换（Dark/Light/Auto）
- 壁纸选择
- 强调色预设选择 + 自定义颜色
- 快捷键列表渲染
- 快捷键编辑（录制模式、冲突检测）
- 配置导出（验证 JSON 结构）
- 配置导入（版本兼容、合并策略）
- Dock 位置/大小设置
