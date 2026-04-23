---
name: ventoos-app-creation
description: Use when creating a brand new application for VentoOS, extending the system with a new built-in app, or when user requests building a new app that will run inside the WebOS window manager.
---

# VentoOS 应用创建

## 概述

以架构师 + 产品经理的视角，完成 VentoOS 新应用的完整设计与实现。**先创建图标，再设计应用，最后开发**，全程复用系统已有能力。

## 状态持久化硬约束

- 新应用的业务状态必须默认进入数据库持久化链路，页面和组件只负责表现，不得成为唯一状态源
- 设计阶段就要明确哪些状态需要刷新恢复，并为其选择持久化路径：`window appState -> SQLite`、系统 settings、或应用专属 Rust/SQLite 表
- `useState` 仅用于模态开关、hover、临时输入框焦点等短生命周期 UI 态；可恢复的会话、选择、草稿、日志、上下文必须进入 store + DB
- 若应用宣称支持刷新恢复，必须在测试与验收中明确验证恢复行为，不能只验证首屏渲染

## 第一步：创建应用图标

**REQUIRED SUB-SKILL:** 使用 `ventoos-icon-creation` 技能创建应用图标。

在进入设计阶段前，必须确定：
- 应用名称（中英文）
- 应用核心功能（一句话描述）
- 选定的图标（Lucide 图标名）
- 选定的渐变配色（参考 icon-creation 色板避免重复）

## 第二步：需求细化（产品经理视角）

用户描述往往不完整，必须主动补全以下内容（必要时询问用户）：

```
从用户描述中自动提取：
- id: <小写连字符，如 my-app>
- name: <显示名称>
- version: 1.0.0
- description: <功能描述，1-2 句>
- permissions: [需要哪些权限？参考下方权限表]
- defaultSize: { width: ?, height: ? }
- hasBackendPlugin: true/false（是否需要 Rust 后端）
- fileOpenAssociations?: [文件扩展名]（是否关联文件类型）
- multiWindow: true/false
```

**权限表：**
| 权限 | 场景 |
|------|------|
| `network` | 需要访问外部网络 |
| `connections` | 使用连接管理器（DB/K8s/SSH 等） |
| `storage` | 读写本地存储 |
| `shell` | 执行命令 |
| `notifications` | 发送系统通知 |
| `clipboard` | 访问剪贴板 |
| `ipc` | 与其他应用通信 |

## 第三步：架构设计

### 确认应用分类
| 分类 | 特征 | 示例 |
|------|------|------|
| 资源管理类 | 需要连接配置，展示远程资源 | K8s、Database、Redis、Explorer |
| 工具类 | 本地操作，不需要连接 | 文本编辑器、图片编辑器、字体预览 |
| 服务类 | 后台常驻，提供系统服务 | 终端、日志中心、依赖管理器 |
| 集成类 | 嵌入外部服务 | Office 编辑器 |

### 应用内部架构
```
apps/<app-id>/
  manifest.ts        # 应用声明（图标、权限、尺寸）
  index.ts           # 懒加载入口（component: () => import('./index')）
  App.tsx            # 根组件
  components/        # 应用内部组件
  hooks/             # 应用 hooks
  store.ts           # 应用级状态（Zustand，业务状态需同步到数据库）
  api.ts             # 后端 API 调用（如需要）
  __tests__/         # 测试
```

## 第四步：复用系统能力（关键）

**先查再造，不重复实现：**

### 可直接复用的服务
```ts
import { connectionService, useConnectionStore } from '@/services'  // 连接管理
import { notificationService } from '@/services'                    // 发送通知
import { taskService, useTaskStore } from '@/services'              // 任务管理
import { useSettingsStore } from '@/services'                       // 系统设置
import { useVfsClipboardStore } from '@/services'                   // VFS 剪贴板
```

### 可复用的 Kernel 能力
```ts
import { openWindow, useWindowActions } from '@/kernel'  // 窗口操作
import { useAppStore } from '@/kernel'                   // 应用注册
```

### 可复用的 UI 组件
```ts
import { AppLayout, Modal, EmptyState, Spinner, StatusBadge, FormInput } from '@/components/ui'
import { AppSidebar } from '@/components/AppSidebar'
```

### 文件关联（可让系统通过"打开方式"启动应用）
```ts
fileOpenAssociations: ['txt', 'md'],   // 可编辑打开
filePreviewAssociations: ['pdf'],      // 可预览打开
```

## 第五步：注册应用

1. 在 `web/src/apps/index.ts` 中导入并注册 manifest
2. 应用自动出现在 Launchpad 中

```ts
// web/src/apps/index.ts
import { myAppManifest } from './my-app/manifest'
export const builtinManifests: AppManifest[] = [
  // ... 已有应用
  myAppManifest,
]
```

## 测试要求

- 应用核心功能页面：Vitest + React Testing Library
- 如有 Rust 后端：单元测试覆盖核心逻辑
- 执行验证：
```bash
cd web && pnpm build && pnpm test
cd native && cargo clippy && cargo build && cargo test  # 如有后端
```

## 使用子 Agent 策略

大型应用可拆分：
- 子 agent A：Rust 后端插件实现
- 子 agent B：应用 UI 与前端逻辑
- 主 agent：定义接口规范 + 注册应用 + 汇总验收

## 完成后提交

```bash
cd /path/to/VentoOS
git add web/src/apps/<app-id>/
git add web/src/apps/index.ts
git add native/crates/ventoos-<app-id>/  # 如有后端
git commit -m "feat(app): add <应用名称> application"
git push
```
