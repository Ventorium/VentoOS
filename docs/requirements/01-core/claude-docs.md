# DevOS · 产品需求文档 & 技术架构

> **一句话定位**：面向运维 / SRE / 平台工程师的浏览器原生桌面操作系统，将 K8s、数据库、缓存、文件系统、AI Agent 统一在一个 macOS 风格的沉浸式工作台里，用 AI 驱动一切操作。

---

## 目录

1. [产品愿景](#1-产品愿景)
2. [核心设计原则](#2-核心设计原则)
3. [UI / UX 规格](#3-ui--ux-规格)
4. [功能模块详细需求](#4-功能模块详细需求)
   - 4.1 K8s 工作台（含 Teleport）
   - 4.2 数据库工作台
   - 4.3 Redis 工作台
   - 4.4 资源管理器（VFS）
   - 4.5 AI Agent 工作台
   - 4.6 窗口管理系统
   - 4.7 应用启动台 & 顶部菜单栏
   - 4.8 通知 & 告警中心
   - 4.9 用户设置 & 主题系统
5. [技术架构总览](#5-技术架构总览)
6. [前端架构](#6-前端架构)
7. [后端架构（本地 Daemon）](#7-后端架构本地-daemon)
8. [数据持久化方案](#8-数据持久化方案)
9. [AI Agent 方案决策](#9-ai-agent-方案决策)
10. [开发路线图](#10-开发路线图)
11. [风险 & 关键决策点](#11-风险--关键决策点)

---

## 1. 产品愿景

**DevOS** 是一个运行在本地浏览器里的「运维工作台操作系统」。

- **统一入口**：告别 Lens、Navicat、TinyRDM、Finder、Terminal 之间反复切换的碎片化工作流
- **上下文贯通**：K8s Service → 一键进入数据库/Redis，无需手动 port-forward；Teleport 登录状态自动渗透到所有子模块
- **AI 加速**：AI Agent 理解平台所有能力，在对话框中直接完成任何操作，语音输入支持
- **本地优先**：所有敏感凭证、kubeconfig、SSH 私钥留在本机，后端 Daemon 在本地跑，浏览器只是渲染层
- **性能第一**：Rust 后端 + React 前端，WebSocket 实时推送，WASM 加速关键路径

---

## 2. 核心设计原则

| 原则 | 说明 |
|------|------|
| **本地优先，数据不出机器** | Daemon 跑在 localhost，浏览器通过 localhost API/WS 通信 |
| **状态持久化** | 窗口位置、大小、内部滚动位、标签页、连接状态 —— 刷新后完整恢复 |
| **跨模块上下文** | K8s Service 选中后，DB/Redis/Terminal 模块可直接继承其连接上下文 |
| **渐进式披露** | 简单操作 0 配置完成，高级操作按需展开，避免信息过载 |
| **Teleport 优先** | 所有集群访问以 Teleport 为统一身份入口，kubeconfig/DB/SSH 均可从 Teleport 自动获取 |
| **AI 可达** | 平台内任何 UI 操作，AI 都应能通过 Tool Call 等价完成 |

---

## 3. UI / UX 规格

### 3.1 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│  顶部菜单栏  [AppName] [File Edit View ...] [时钟/状态/通知]  │  ← 28px, macOS 风格
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                   桌面 / 窗口层                              │  ← 动态壁纸 + 毛玻璃窗口
│           （各应用窗口在此自由拖拽、层叠）                    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [启动台] [Dock图标...] │ [最小化窗口缩略图...] │ [AI 入口🤖]  │  ← 底部 Dock, 60px
└─────────────────────────────────────────────────────────────┘
```

### 3.2 视觉风格

- **背景**：动态壁纸（支持视频/动图/静态图，默认提供 5 套精选壁纸）
- **窗口**：`backdrop-filter: blur(40px) saturate(180%)` + `rgba(255,255,255,0.12)` 半透明毛玻璃
- **窗口阴影**：`0 32px 64px rgba(0,0,0,0.4)` 层次感强
- **Dock**：毛玻璃背景，图标 hover 时弹跳动画（cubic-bezier），悬浮预览
- **动画**：窗口打开/关闭用 scale+opacity，过渡时长 220ms，easing = `spring(1, 80, 12, 0)`
- **字体**：系统 `-apple-system, BlinkMacSystemFont` 优先；代码区域 `JetBrains Mono`
- **主题**：支持 Light / Dark / Auto，颜色全部走 CSS Custom Properties

### 3.3 窗口管理行为

- 任意拖拽（标题栏拖动）
- 三键：关闭（红）/ 最小化到 Dock（黄）/ 最大化（绿）
- 可调整大小（8个角/边 resize handler）
- 窗口层叠（z-index 自动管理，点击窗口即置顶）
- 快照式状态持久化（IndexedDB），刷新恢复所有窗口几何 + 应用内部状态
- 多显示器感知（通过 `window.screen` API 适配）
- 窗口吸附：拖到屏幕边缘自动 50% / 全屏分割（macOS Sequoia 风格）

### 3.4 顶部菜单栏

- 左侧：当前聚焦窗口的 App 图标 + 名称 + 应用菜单（File / Edit / View / 模块特定菜单）
- 中间：空（偶尔显示当前操作提示）
- 右侧：网络状态、Teleport 登录状态、通知铃铛、时钟

---

## 4. 功能模块详细需求

### 4.1 K8s 工作台

**对标产品**：Lens（功能完整度），加入 Teleport 集成

#### 4.1.1 集群接入

| 方式 | 说明 |
|------|------|
| **Teleport** | `tsh login` 认证后自动列举 K8s 集群，无需手动配置 kubeconfig |
| **kubeconfig** | 上传 / 读取 `~/.kube/config`，多 context 支持 |
| **手动** | 输入 API Server 地址 + Token/Cert |

Teleport 集成细节：
- 调用本机 `tsh` CLI，监听 `tsh kube ls` 输出
- 自动续期（`tsh kube login --ttl=8h`）
- 集群切换即时生效，无需重启

#### 4.1.2 资源浏览

- 左侧树：Cluster → Namespace → 资源类型（Pods/Deployments/Services/Ingress/ConfigMap/Secret/PV/PVC/CRD...）
- 右侧面板：资源列表（虚拟滚动支持万级 Pod）
- 顶部筛选：namespace 多选、label selector、搜索
- 资源详情：YAML 查看/编辑（diff 高亮）、Events、Conditions、Annotations

#### 4.1.3 Pod 操作

- 实时日志流（多 Pod 聚合，正则过滤，时间范围，导出）
- Web Terminal（xterm.js，`kubectl exec`，支持多 tab）
- Port-forward（一键，自动分配本地端口，状态在底部状态栏显示）
- 文件浏览（浏览 Pod 内文件系统，集成到 VFS 模块）

#### 4.1.4 Service → DB/Redis 直连（核心差异化）

当用户在 Service 列表中选中一个 Service 时：
1. 系统识别 Service 的 labels / annotations（支持约定标注：`devos.io/type: mysql`）
2. 显示「在数据库工作台中打开」/ 「在 Redis 工作台中打开」按钮
3. 点击后，Daemon 自动完成：
   - `kubectl port-forward svc/<name> <localPort>:<svcPort>`
   - 从 Secret 中读取凭证（支持约定的 Secret 名称模式）
   - 构造连接配置，注入到 DB/Redis 模块，自动连接
4. 连接生命周期与 K8s 窗口/Session 绑定，关闭时自动清理 port-forward

#### 4.1.5 其他 K8s 能力

- Helm：release 列表、升级、回滚、values 编辑
- RBAC 可视化
- 资源用量（CPU/Memory Top，来自 Metrics Server）
- 多集群并行视图
- 部署历史 & 一键回滚
- CRD 自动识别与表单化展示

---

### 4.2 数据库工作台

**对标产品**：Navicat（功能）+ 现代 UI

#### 支持数据库

MySQL / MariaDB · PostgreSQL · SQLite · MongoDB · ClickHouse · TiDB（优先级递减）

#### 核心功能

| 功能 | 说明 |
|------|------|
| **连接管理** | 支持直连、SSH 隧道、K8s port-forward（来自 K8s 模块自动注入） |
| **库/表浏览** | 树形结构，实时刷新，右键菜单 |
| **数据浏览** | 表格视图，虚拟滚动，行内编辑，筛选/排序，分页 |
| **SQL 编辑器** | Monaco Editor，SQL 自动补全（schema 感知），多 tab，执行历史 |
| **结果集** | 多结果标签，CSV/JSON 导出，图表可视化（简单聚合） |
| **结构设计** | 建表/改表 GUI，DDL 预览 |
| **数据迁移** | 表/库级别导入导出（mysqldump 等） |
| **慢查询** | 慢日志可视化（MySQL/PG explain 支持） |
| **AI 辅助** | 自然语言 → SQL，SQL 解释，查询优化建议 |

---

### 4.3 Redis 工作台

**对标产品**：TinyRDM

#### 核心功能

| 功能 | 说明 |
|------|------|
| **连接管理** | 单机、Sentinel、Cluster，TLS 支持，K8s 自动注入 |
| **键浏览** | 树形命名空间（按 `:` 分隔），模式搜索，TTL 展示 |
| **数据类型编辑** | String/Hash/List/Set/ZSet/Stream，友好编辑 UI |
| **CLI** | 内置 redis-cli，命令历史，自动补全 |
| **监控** | MONITOR 实时命令流，INFO 统计图表，内存分析 |
| **批量操作** | 按 pattern 批量删除/导出/TTL 设置 |
| **Pub/Sub** | 订阅频道实时消息查看 |

---

### 4.4 资源管理器（VFS）

**对标产品**：macOS Finder + 跨端文件管理

#### 4.4.1 VFS 抽象层

所有存储后端都抽象为统一的 VFS Provider 接口：

```
IVfsProvider {
  list(path): FileEntry[]
  read(path): Stream
  write(path, data): void
  mkdir(path): void
  delete(path): void
  rename(src, dst): void
  watch(path): EventStream  // 实时变更通知
}
```

内置 Provider：

| Provider | 说明 |
|----------|------|
| **Local** | 本机文件系统（通过 Daemon，绕过浏览器沙箱） |
| **SSH/SFTP** | 任意 SSH 服务器 |
| **K8s Pod** | Pod 内文件系统（通过 `kubectl cp` / `exec tar`） |
| **S3/OSS/R2** | 对象存储（读写对象，前缀模拟目录） |
| **Teleport SSH** | 通过 Teleport 节点 SFTP |
| **自定义挂载** | 类 alias 机制，将任意路径映射为具名挂载点 |

#### 4.4.2 挂载 & Alias

- 挂载点管理界面：命名、选择 Provider、配置参数、图标
- 挂载后出现在左侧边栏（类 Finder 侧栏）
- 持久化挂载配置，重启后自动重连

#### 4.4.3 跨端操作

- 拖拽跨挂载点复制/移动（后端流式传输，不经过浏览器内存）
- 批量操作：复制、压缩、解压、权限修改
- 剪贴板支持：跨窗口的文件剪切/复制/粘贴
- 传输队列：后台传输，进度显示在底部状态栏

#### 4.4.4 UI

- 双栏 / 列表 / 图标三种视图
- 预览面板（文本/图片/日志实时 tail）
- 快速查找（⌘F 全路径搜索）
- 右键菜单（在终端中打开、在编辑器中打开、复制路径...）

---

### 4.5 AI Agent 工作台

#### 4.5.1 Agent 方案决策（见第 9 节详细分析）

**推荐方案**：自建轻量 Agent 核心 + 可插拔 LLM Backend（优先 Claude API，可切换 OpenAI / 本地模型）

并提供「外部 CLI 模式」作为高级选项：调用本机 `claude` / `codex` / `opencode` CLI，将其输出流式展示在 DevOS 对话界面中。

#### 4.5.2 AI 入口

- 底部 Dock 右侧常驻 AI 图标，点击唤出对话悬浮窗（可调整大小、可固定）
- 全局快捷键（⌘ + Space 或自定义）快速唤出/收起
- 任意模块内的「问 AI」上下文按钮（右键菜单、工具栏）

#### 4.5.3 输入方式

- 文字输入（带自动补全、历史）
- **语音输入**：Web Speech API（浏览器原生）+ Whisper API fallback（准确率更高）
- 文件/截图粘贴（Vision 模型支持）
- 上下文注入：当前选中的 K8s 资源 YAML / SQL 结果集 / 文件内容 一键投喂给 AI

#### 4.5.4 Agent 工具集（Tool Calls）

AI 可调用的工具覆盖平台所有能力：

```
K8s 类：
  k8s_list_resources(cluster, namespace, kind)
  k8s_get_resource(cluster, namespace, kind, name)
  k8s_apply_yaml(yaml_content)
  k8s_delete_resource(...)
  k8s_exec(pod, command)
  k8s_logs(pod, container, tail)
  k8s_port_forward(svc, port)
  k8s_scale(deployment, replicas)

数据库类：
  db_execute_sql(connection_id, sql)
  db_list_tables(connection_id, database)
  db_describe_table(connection_id, database, table)
  db_export_data(connection_id, query, format)

Redis 类：
  redis_get(connection_id, key)
  redis_set(connection_id, key, value, ttl?)
  redis_execute(connection_id, command)
  redis_scan(connection_id, pattern, count)

文件系统类：
  vfs_list(mount_point, path)
  vfs_read(mount_point, path)
  vfs_write(mount_point, path, content)
  vfs_copy(src_mount, src_path, dst_mount, dst_path)

系统类：
  open_window(app, params)
  notify(title, message, level)
  get_context()  // 返回当前桌面状态快照
```

#### 4.5.5 Agent 对话 UI

- 消息气泡（用户/AI），Markdown 渲染，代码高亮，YAML 渲染
- Tool Call 可视化：显示「正在执行 k8s_logs...」进度条
- 执行结果折叠展示，失败可重试
- 会话历史（持久化，可搜索）
- 多会话 tab（不同任务并行）
- 「确认执行」模式：危险操作（delete/apply）需用户二次确认

---

### 4.6 窗口管理系统

这是 DevOS 的操作系统内核。

#### 状态模型

```typescript
interface WindowState {
  id: string
  appId: string           // 'k8s' | 'db' | 'redis' | 'vfs' | 'ai'
  title: string
  geometry: { x, y, width, height }
  isMinimized: boolean
  isMaximized: boolean
  zIndex: number
  appState: unknown       // 应用自己序列化的状态
  lastActiveAt: number
}
```

#### 持久化

- 每次窗口变化（移动/resize/内部状态变更）节流 500ms 写入 IndexedDB
- 页面加载时从 IndexedDB 恢复，并重建应用内部状态
- 导出/导入「桌面快照」（JSON），方便多机同步（通过 git 或云盘）

#### 层叠管理

- 全局 z-index 计数器，点击任意窗口自动置顶
- 最大化时其他窗口不隐藏，保持可见但不可交互

---

### 4.7 应用启动台 & 底部 Dock

#### Dock 结构（从左到右）

```
[🚀启动台] [⎔K8s] [🗄DB] [🔴Redis] [📁VFS] [💻Terminal] [···更多] ‖ [最小化窗口缩略图...] ‖ [🤖AI]
```

- 启动台：网格式 App 选择器（类 iOS Launchpad）
- Dock 图标：badge 显示活跃连接数 / 告警数
- 最小化窗口区域：缩略图 hover 预览（CSS snapshot），点击恢复
- AI 按钮：动态状态（idle / thinking / executing / error）

---

### 4.8 通知 & 告警中心

- K8s 资源异常事件（CrashLoopBackOff、OOMKilled 等）自动推送
- 长时间操作完成通知（文件传输、SQL 导出）
- AI Agent 执行结果通知
- 右上角通知下拉，历史记录，可按严重程度过滤
- 支持系统原生通知（`Notification` API）

---

### 4.9 用户设置 & 主题系统

- 壁纸管理（上传、在线壁纸库）
- 主题：Dark / Light / Auto + 强调色自定义
- 快捷键自定义
- 连接管理（统一查看所有 K8s/DB/Redis/SSH 连接，删除/编辑）
- AI 设置（API Key 管理、模型选择、默认行为）
- Teleport 配置（Proxy 地址、自动登录）
- 导入/导出配置（JSON）

---

## 5. 技术架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser (React Frontend)                  │
│  Window Manager · App Shell · Module UIs · AI Chat UI        │
│            ↕ WebSocket (real-time) + REST (commands)         │
├──────────────────────────────────────────────────────────────┤
│                  Local Daemon (Rust / Tauri)                  │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ K8s Srv  │ │  DB Srv  │ │Redis Srv │ │   VFS Srv    │   │
│  │(kube-api)│ │(sqlx)    │ │(redis-rs)│ │(sftp/s3/local│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │   AI Agent Engine    │  │   Teleport Bridge (tsh CLI)  │  │
│  │  (Tool Call Router)  │  │   (exec, watch output)       │  │
│  └──────────────────────┘  └──────────────────────────────┘  │
│                   ↕ IPC / System Calls                       │
├──────────────────────────────────────────────────────────────┤
│              Local Storage Layer                              │
│      IndexedDB (state) · SQLite (history/config)             │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. 前端架构

### 6.1 技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| 框架 | **React 19** + TypeScript | 成熟生态，concurrent features 提升流畅度 |
| 状态管理 | **Zustand** + Immer | 轻量，分 slice，适合窗口状态这种复杂场景 |
| 样式 | **Tailwind CSS v4** + CSS Variables | 原子类 + 主题变量双轨，毛玻璃效果用 CSS 原生 |
| 动画 | **Motion (framer-motion v12)** | spring 动画，手势，layout animation |
| 数据获取 | **TanStack Query v5** | 缓存、后台刷新、WS 数据 bridge |
| 路由 | 无（SPA，路由由窗口管理器取代） | — |
| 代码编辑器 | **Monaco Editor** | SQL、YAML、代码全场景 |
| 终端 | **xterm.js + xterm-addon-fit** | Web Terminal |
| 表格 | **TanStack Table v8** + 虚拟滚动 | 万级数据不卡顿 |
| 图表 | **Recharts** / D3（局部） | 指标可视化 |
| 构建 | **Vite 6** | 极速开发，ESM 原生 |

### 6.2 目录结构

```
src/
├── shell/                 # 操作系统 Shell
│   ├── Desktop.tsx        # 壁纸 + 窗口容器
│   ├── WindowManager/     # 窗口管理核心
│   │   ├── Window.tsx     # 单窗口组件（拖拽/缩放/层叠）
│   │   ├── useWindowStore.ts
│   │   └── persistence.ts # IndexedDB 序列化
│   ├── Dock/              # 底部 Dock
│   ├── MenuBar/           # 顶部菜单栏
│   └── NotificationCenter/
│
├── apps/                  # 各应用模块
│   ├── k8s/
│   │   ├── K8sApp.tsx
│   │   ├── ClusterTree/
│   │   ├── ResourceList/
│   │   ├── PodLogs/
│   │   ├── Terminal/
│   │   └── PortForwardManager/
│   ├── database/
│   ├── redis/
│   ├── vfs/
│   └── ai/
│       ├── AiChatWindow.tsx
│       ├── VoiceInput/
│       ├── ToolCallRenderer/
│       └── useAgentStream.ts
│
├── api/                   # Daemon API Client
│   ├── ws.ts              # WebSocket 连接管理
│   ├── rest.ts            # REST client
│   └── types/             # 共享类型定义
│
├── design-system/         # 设计系统
│   ├── tokens.css         # CSS Variables
│   ├── GlassPanel.tsx     # 毛玻璃基础组件
│   ├── WindowChrome.tsx   # 窗口框架（三键+标题）
│   └── ...
│
└── store/                 # 全局状态
    ├── windowStore.ts
    ├── connectionStore.ts  # 所有活跃连接
    └── aiStore.ts
```

### 6.3 窗口渲染方案

- 每个 App 是一个 **React Portal**，挂载到 `#desktop` 容器
- 使用 `CSS transform: translate()` 做位置（GPU 加速，不触发 layout）
- `will-change: transform` 仅在拖拽时设置，拖拽结束后移除（节省显存）
- 窗口内容用 `React.memo` + `appState` key 防止不必要重渲染
- 最小化动画：`scale(0.1) translate(到Dock位置)` + `opacity: 0`

---

## 7. 后端架构（本地 Daemon）

### 7.1 技术选型

**Rust + Tauri v2**

- Tauri：提供 系统 tray、文件系统权限、原生通知、自动更新
- 如果纯浏览器（不打包为 App），则 Daemon 为独立 Rust 二进制（通过 npm 包分发，`npx devos-daemon`）

### 7.2 Daemon 核心 Crate

```toml
[dependencies]
axum = "0.7"              # HTTP + WebSocket server
tokio = { features = ["full"] }
kube = "0.91"             # K8s client
sqlx = { features = ["mysql","postgres","sqlite"] }
redis = { features = ["aio","cluster"] }
russh = "0.44"            # SSH/SFTP client
aws-sdk-s3 = "1.x"       # S3 compatible
serde = { features = ["derive"] }
tokio-tungstenite = "0.23"
```

### 7.3 API 设计

**WebSocket Protocol（主通道，JSON-RPC 2.0 风格）**

```jsonc
// 客户端 → Daemon
{ "id": "1", "method": "k8s.watchPods", "params": { "cluster": "prod", "namespace": "default" } }

// Daemon → 客户端（流式推送）
{ "id": "1", "type": "data", "payload": { "event": "MODIFIED", "object": {...} } }
{ "id": "1", "type": "end" }
{ "id": "1", "type": "error", "message": "..." }
```

**REST API（一次性命令）**

```
POST /api/k8s/{cluster}/resources         # apply yaml
DELETE /api/k8s/{cluster}/{ns}/{kind}/{name}
POST /api/db/{connId}/execute             # execute sql
GET  /api/vfs/{mount}/ls?path=/           # list files
POST /api/vfs/copy                        # cross-mount copy
POST /api/ai/chat                         # agent 入口（SSE stream）
GET  /api/teleport/clusters               # list tsh clusters
```

### 7.4 Teleport 集成

```rust
// Daemon 侧：执行 tsh 命令，解析输出
async fn list_kube_clusters() -> Vec<KubeCluster> {
    let output = Command::new("tsh")
        .args(["kube", "ls", "--format=json"])
        .output().await?;
    serde_json::from_slice(&output.stdout)
}

// 自动维持登录：后台定时检查 tsh status，过期前刷新
// 通过 tsh proxy kube 或直接 kubeconfig 注入 kube client
```

### 7.5 AI Agent Engine（Daemon 侧）

```
用户消息
  → Daemon AgentEngine
    → 调用 LLM API（Claude / OpenAI，stream）
    → 解析 Tool Call
    → 路由到对应 Service（K8sSvc / DbSvc / VfsSvc...）
    → 执行，获得结果
    → 结果追加到 conversation，继续推理
    → SSE 流式推送进度和最终回复给浏览器
```

---

## 8. 数据持久化方案

| 数据类型 | 存储位置 | 说明 |
|----------|----------|------|
| 窗口几何 & 应用 UI 状态 | IndexedDB（浏览器） | 毫秒级读写，离线可用 |
| 连接配置（含凭证） | Daemon SQLite + OS Keychain | 凭证用系统密钥链加密 |
| AI 会话历史 | Daemon SQLite | 可搜索，支持导出 |
| 查询历史（SQL/Redis） | Daemon SQLite | 按连接分组 |
| 用户设置 | Daemon SQLite + JSON | 方便 git 版本管理 |
| VFS 挂载配置 | Daemon SQLite | — |
| 壁纸文件 | 本机文件系统 | Daemon 提供静态文件服务 |

---

## 9. AI Agent 方案决策

### 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **复用 claude code CLI** | 零开发成本，工具完整 | 工具集不对齐平台能力，UI 集成差，无法拦截确认 | ⭐⭐ |
| **复用 opencode / codex** | 类似上述 | 与平台深度不够 | ⭐⭐ |
| **自建 Agent（推荐）** | 工具集完全自定义，UI 深度集成，确认流程可控，可离线 | 需要开发 | ⭐⭐⭐⭐⭐ |
| **混合模式** | 核心 Agent 自建，支持「转发给 claude code」执行代码类任务 | 稍复杂 | ⭐⭐⭐⭐ |

### 推荐：自建 Agent + 混合 Backend

1. **自建 Agent Engine**（Rust/Daemon 侧）
   - Tool Call 路由 100% 对齐平台能力
   - 危险操作确认流程完全可控
   - 会话状态持久化
   - UI 深度集成（内联结果、一键跳转到窗口）

2. **LLM Backend 可插拔**
   - 默认 Claude API（`claude-sonnet-4-20250514`，工具调用能力最强）
   - 可切换 OpenAI / Gemini / 本地 Ollama
   - API Key 本地加密存储

3. **「调用外部 CLI」高级模式**
   - 在 AI 设置中开启「使用本机 claude code」
   - Daemon 启动子进程，将用户消息 pipe 进去，stream 输出到 UI
   - 适合需要写代码、执行 shell 的高级用户

### 语音输入实现

```typescript
// 优先 Web Speech API（零延迟，离线）
const recognition = new webkitSpeechRecognition()
recognition.continuous = true
recognition.interimResults = true

// Fallback: 录音 → 发送到 Whisper API
const recorder = new MediaRecorder(stream)
recorder.ondataavailable = async (e) => {
  const transcript = await callWhisperApi(e.data)
  appendToInput(transcript)
}
```

---

## 10. 开发路线图

### Phase 0 · 基础设施（第 1-2 周）

- [ ] Tauri 项目初始化（React + Rust）
- [ ] 窗口管理系统（拖拽/缩放/层叠/持久化）
- [ ] 顶部菜单栏 + 底部 Dock 基础结构
- [ ] 毛玻璃 UI 设计系统（tokens / GlassPanel / WindowChrome）
- [ ] Daemon WebSocket + REST 框架（axum）
- [ ] IndexedDB 持久化层

### Phase 1 · K8s 模块（第 3-5 周）

- [ ] kubeconfig 读取 + 多 context 切换
- [ ] Teleport 集成（`tsh` CLI bridge）
- [ ] 资源树 + 列表（虚拟滚动）
- [ ] Pod 日志流 + Web Terminal
- [ ] Port-forward 管理
- [ ] Service → DB/Redis 直连（基础版）

### Phase 2 · DB + Redis 模块（第 6-8 周）

- [ ] 数据库连接管理（MySQL/PG 优先）
- [ ] 表格浏览 + SQL 编辑器（Monaco）
- [ ] Redis 连接 + Key 浏览 + CLI
- [ ] K8s Service 自动注入连接

### Phase 3 · VFS 模块（第 9-10 周）

- [ ] VFS Provider 接口定义
- [ ] Local + SSH/SFTP Provider
- [ ] Finder 风格 UI
- [ ] 跨 Provider 文件复制（流式）
- [ ] 挂载管理 & Alias

### Phase 4 · AI Agent（第 11-13 周）

- [ ] Agent Engine（Tool Call 路由）
- [ ] 工具集实现（K8s / DB / Redis / VFS）
- [ ] 对话 UI + ToolCall 可视化
- [ ] 语音输入（Web Speech API）
- [ ] 危险操作确认流程

### Phase 5 · 打磨（第 14-16 周）

- [ ] 动画全面优化（spring 参数调优）
- [ ] 通知 & 告警中心
- [ ] 设置系统（壁纸/主题/快捷键/连接管理）
- [ ] 性能测试（万级 Pod 虚拟滚动，WS 消息吞吐）
- [ ] K8s 高级功能（Helm / RBAC 可视化 / CRD）
- [ ] 多显示器支持 + 窗口吸附

---

## 11. 风险 & 关键决策点

### 风险清单

| 风险 | 严重程度 | 缓解方案 |
|------|----------|----------|
| 浏览器沙箱限制（文件系统/网络） | 高 | Tauri 原生权限 or 独立 Daemon 二进制 |
| Teleport 版本兼容性（tsh CLI 输出格式变化） | 中 | 解析层抽象 + 版本检测 |
| 毛玻璃效果性能（低端机器 backdrop-filter 慢） | 中 | 检测性能等级，低端降级为纯色背景 |
| AI 工具调用错误（误删资源）| 高 | 所有 mutating 操作默认需确认，支持 dry-run |
| 多 K8s 集群 WS 连接数过多 | 中 | 按需连接 + 连接池 + 心跳管理 |
| 凭证安全（API Key / kubeconfig 存储）| 高 | OS Keychain（macOS Keychain / Secret Service）|

### 关键技术决策

1. **Tauri App vs. 纯浏览器**：强烈推荐 Tauri，获得文件系统、系统通知、Keychain、自动更新能力，且前端代码不变
2. **WebSocket vs. HTTP Polling**：WebSocket 唯一选择，K8s Watch / 日志流 / AI 流式输出都需要
3. **Monaco vs. CodeMirror**：Monaco 更重但功能完整（LSP 支持、diff、multi-cursor），SQL/YAML 场景推荐 Monaco
4. **Zustand vs. Redux**：Zustand，窗口管理状态树的复杂度用 Zustand slice 就够，无需 Redux 的仪式感

---

## 附录：推荐开源依赖参考

| 功能 | 参考项目 |
|------|----------|
| K8s 客户端逻辑参考 | [Lens (OpenLens)](https://github.com/MuhammedKalkan/OpenLens) |
| Redis 客户端参考 | [TinyRDM](https://github.com/tiny-craft/tiny-rdm) |
| VFS 设计参考 | [Rclone](https://github.com/rclone/rclone) |
| 窗口管理参考 | [react-rnd](https://github.com/bokuweb/react-rnd) (可定制) |
| xterm | [xterm.js](https://xtermjs.org/) |
| K8s Rust Client | [kube-rs](https://github.com/kube-rs/kube) |
| SSH Rust | [russh](https://github.com/Eugeny/russh) |

---

*文档版本：v0.1 · 生成日期：2026-04*