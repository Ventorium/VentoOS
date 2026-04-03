# VentoOS 需求 vs 实现差异分析报告

> 文档版本：v1.0  
> 分析基准：`docs/requirements/01-core/claude-docs.md`  
> 分析时间：2025-07  
> 分析人：主 Agent

---

## 概要

本文档对照 `claude-docs.md` 中的原始需求，逐模块检查当前 VentoOS 代码库的实现状态，指出已完成项、未完成项以及实现与规范偏差项。

**整体完成度估算**：约 **45%**（基础设施与框架完整，核心业务功能待补全）

---

## 1. 整体完成情况速览

| 模块 | 完成度 | 主要缺口 |
|------|--------|----------|
| **基础设施与 Shell** | 🟢 85% | IndexedDB 持久化、多显示器、最小化缩略图 |
| **K8s 工作台** | 🟡 30% | Pod 日志/Terminal/Port-forward、Teleport、YAML 编辑 |
| **数据库工作台** | 🟡 50% | Monaco 编辑器、SQL 补全、导出、AI 辅助、SSH 隧道 |
| **Redis 工作台** | 🟡 55% | Sentinel/Cluster、MONITOR、批量操作、Pub/Sub |
| **VFS / 文件管理器** | 🟢 75% | K8s Pod Provider、Teleport SSH、拖拽跨 Provider |
| **AI Agent 工作台** | 🟡 40% | 平台 Tool 集、语音输入、Markdown 渲染、危险操作确认 |
| **窗口管理** | 🟢 75% | 桌面快照导出/导入、最小化到 Dock 动画 |
| **Dock & 启动台** | 🟢 80% | Dock badge、最小化窗口缩略图、AI 动态状态 |
| **通知中心** | 🟡 60% | K8s 事件自动推送、原生 Notification API |
| **系统设置** | 🟡 65% | 快捷键自定义、连接统一管理、Teleport 配置、配置导入导出 |

---

## 2. 模块详细差异分析

---

### 2.1 K8s 工作台

**实现文件**：`web/src/apps/kubernetes/index.tsx`（545 行）、`native/crates/ventoos-k8s/`

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| KubeConfig 加载（文件路径/内联） | ✅ | 支持通过 VFS 路径选择器选取远端 kubeconfig |
| 集群增/删/列举 | ✅ | |
| Namespace 浏览 | ✅ | |
| 资源类型导航（工作负载/网络/存储/配置） | ✅ | 覆盖 Pod、Deployment、StatefulSet、DaemonSet、Job、CronJob、Service、Ingress、PVC、PV、ConfigMap、Secret 等 |
| 资源列表（Name/Namespace/Status/Age） | ✅ | |
| 视图偏好持久化 | ✅ | 通过 localStorage |

#### 未实现

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **Teleport 集成**（`tsh kube ls` / `tsh login`） | 🔴 高 | 代码库中仅有枚举定义，无实际 tsh CLI 调用 |
| **Pod 实时日志流**（WebSocket 多 Pod 聚合、正则过滤、导出） | 🔴 高 | 后端 routes 中未见日志流 API |
| **Pod Web Terminal**（`kubectl exec`，多 tab） | 🔴 高 | 后端和前端均无 Pod exec 实现 |
| **Port-forward 管理**（一键，本地端口，状态栏） | 🔴 高 | 完全缺失 |
| **Service → DB/Redis 直连**（核心差异化） | 🔴 高 | 完全缺失 |
| **资源 YAML 查看/编辑**（Monaco diff 高亮） | 🟠 中 | 无详情面板 |
| **资源详情**（Events、Conditions、Annotations） | 🟠 中 | 无 |
| **Label selector / 高级过滤** | 🟠 中 | 仅有 namespace 切换 |
| **Pod 文件浏览**（集成 VFS） | 🟠 中 | 无 |
| **Helm release 管理** | 🟡 低 | 无 |
| **RBAC 可视化** | 🟡 低 | 无 |
| **资源用量**（CPU/Memory top，来自 Metrics Server） | 🟡 低 | 无 |
| **多集群并行视图** | 🟡 低 | 无 |
| **部署历史 & 一键回滚** | 🟡 低 | 无 |
| **CRD 识别与表单化展示** | 🟡 低 | 无 |

---

### 2.2 数据库工作台

**实现文件**：`web/src/apps/database/index.tsx`（793 行）、`native/crates/ventoos-db/`

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| 连接管理（MySQL/MariaDB、PostgreSQL、SQLite） | ✅ | |
| 连接测试（inline 测试） | ✅ | |
| Schema/表树形浏览 | ✅ | 支持多 schema 展开 |
| 表结构查看（列、索引） | ✅ | |
| 表数据浏览（虚拟滚动，分页） | ✅ | 使用 `virtua` VList |
| SQL 执行 | ✅ | textarea 输入，⌘+Enter 快捷键 |
| 连接/断开/删除 | ✅ | |

#### 未实现

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **Monaco Editor SQL 编辑器** | 🔴 高 | 当前用普通 textarea，缺少语法高亮、补全、多 tab |
| **SQL 自动补全**（schema 感知） | 🔴 高 | 无 |
| **多结果 tab** | 🟠 中 | 无 |
| **CSV/JSON 结果导出** | 🟠 中 | 无 |
| **图表可视化** | 🟡 低 | 无 Recharts/D3 |
| **建表/改表 GUI & DDL 预览** | 🟡 低 | 无 |
| **数据迁移**（mysqldump 等） | 🟡 低 | 无 |
| **慢查询/EXPLAIN 可视化** | 🟠 中 | 无 |
| **AI 辅助**（自然语言→SQL、SQL 解释） | 🟠 中 | 无 |
| **SSH 隧道连接** | 🟠 中 | 后端 `CreateDbConnectionReq` 无 tunnel 字段 |
| **K8s port-forward 自动注入** | 🔴 高 | 依赖 K8s 模块 port-forward，均缺失 |
| **行内编辑** | 🟠 中 | 无 |

---

### 2.3 Redis 工作台

**实现文件**：`web/src/apps/redis/index.tsx`（1241 行）、`native/crates/ventoos-redis/`

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| 单机连接管理 | ✅ | |
| 键浏览（Trie 树，`:` 分隔命名空间） | ✅ | 实现质量较高 |
| TTL 展示 | ✅ | |
| 模式搜索 | ✅ | |
| 数据类型查看/编辑（String/Hash/List/Set/ZSet） | ✅ | |
| 内置 Redis CLI（命令历史） | ✅ | |
| 虚拟滚动键列表 | ✅ | 使用 virtua VList |

#### 未实现

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **Sentinel、Cluster 模式** | 🟠 中 | 后端和前端均不支持 |
| **TLS 连接** | 🟠 中 | 无 |
| **MONITOR 实时命令流** | 🟠 中 | 无 WebSocket 推流 |
| **INFO 统计图表** | 🟡 低 | 无 |
| **内存分析** | 🟡 低 | 无 |
| **批量操作**（按 pattern 删除/导出/TTL 设置） | 🟠 中 | 无 |
| **Pub/Sub 订阅实时查看** | 🟠 中 | 无 |
| **Stream 类型编辑** | 🟠 中 | 未包含在数据类型编辑中 |
| **K8s 自动注入连接** | 🔴 高 | 依赖 K8s port-forward |
| **CLI 自动补全** | 🟡 低 | 无 |

---

### 2.4 VFS / 资源管理器

**实现文件**：`web/src/apps/explorer/index.tsx`（3219 行）、`native/crates/ventoos-vfs/`

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| VFS Provider 抽象（统一 list/read/write/mkdir/delete/rename） | ✅ | Rust trait 化实现 |
| Local Provider | ✅ | |
| SSH/SFTP Provider | ✅ | 支持密码 & 私钥认证，SSH config 导入 |
| FTP Provider | ✅ | |
| SMB Provider | ✅ | |
| S3/OSS/R2 Provider | ✅ | 支持自定义 endpoint |
| WebDAV Provider | ✅ | 支持 http/https，自动 URL 解析 |
| 内置 WebDAV 服务器 | ✅ | `webdav_server.rs` |
| 挂载点管理（增/删/改） | ✅ | |
| 目录导航（面包屑） | ✅ | |
| 文件操作（复制/移动/删除/重命名/新建目录） | ✅ | |
| VFS 剪贴板（跨挂载点剪切/复制/粘贴） | ✅ | 独立 Zustand store |
| 传输任务队列 | ✅ | `services/task` |
| 文件内容预览（文本/图片） | ✅ | 集成 file-viewer app |
| 右键上下文菜单 | ✅ | 文件操作、属性 |
| 测试连接 | ✅ | |
| 连接测试时错误提示 | ✅ | |
| 列表/图标视图切换（FlipHorizontal / FlipVertical） | ✅ | |
| 隐藏文件显示切换 | ✅ | |

#### 未实现

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **K8s Pod 文件系统 Provider** | 🟠 中 | 需 kubectl cp/exec tar |
| **UI 拖拽跨挂载点复制/移动** | 🟠 中 | 后端流式传输已支持，UI 拖拽交互缺失 |
| **批量压缩/解压** | 🟡 低 | 无 |
| **权限修改（chmod）** | 🟡 低 | 无 |
| **快速查找（⌘F 全路径搜索）** | 🟠 中 | 无 |
| **日志文件实时 tail** | 🟠 中 | 预览仅支持完整读取 |
| **右键「在终端中打开」** | 🟠 中 | 无 |
| **右键「在编辑器中打开」** | 🟡 低 | 无 |
| **双栏对比视图** | 🟡 低 | 仅单栏 |
| **自定义挂载别名（Mount/Alias 机制）** | 🟡 低 | 无 |
| **Watch 实时变更通知** | 🟡 低 | VFS Provider 接口未实现 watch |

---

### 2.5 AI Agent 工作台

**实现文件**：`web/src/apps/ai-assistant/index.tsx`（523 行）、`web/src/shell/AISidePanel/index.tsx`、`native/crates/ventoos-agent/`

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| Agent Engine（Rust，Tool Call 路由） | ✅ | `ventoos-agent` crate |
| Provider 管理（API Key 等） | ✅ | |
| Agent profile 管理 | ✅ | |
| 多会话历史（持久化，可删除） | ✅ | SQLite |
| 流式对话（SSE → 前端增量显示） | ✅ | |
| Tool Call 可视化（"Calling X..."，结果折叠） | ✅ | |
| AI 悬浮侧边栏（TopBar 入口） | ✅ | AISidePanel |
| AI 工作台窗口（完整功能） | ✅ | AIAssistantApp |
| 设置跳转（⚙️ → Settings AI tab） | ✅ | |
| 4 个内置工具（read/write/edit/bash） | ✅ | StubToolExecutor 仍为桩，未接真实执行 |

#### 未实现

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **平台 Tool 集**（k8s_*/db_*/redis_*/vfs_* 等） | 🔴 高 | `ToolExecutor` 仅有 4 个基础工具，无平台业务工具；`StubToolExecutor` 为占位符 |
| **open_window / notify / get_context 工具** | 🔴 高 | 无 |
| **AI 工具真实执行**（StubToolExecutor → 接实际服务） | 🔴 高 | `StubToolExecutor` 仅返回描述字符串 |
| **语音输入**（Web Speech API + Whisper fallback） | 🟠 中 | 无 |
| **文件/截图粘贴**（Vision 多模态） | 🟠 中 | 无 |
| **上下文注入**（K8s YAML/SQL 结果/文件内容一键投喂） | 🟠 中 | 无 |
| **Markdown 渲染 & 代码高亮** | 🔴 高 | 消息内容为普通文本显示，无 Markdown 解析 |
| **危险操作「确认执行」模式** | 🔴 高 | 无确认拦截机制 |
| **多会话并行 tab** | 🟠 中 | 仅列表切换，无并排 tab |
| **外部 CLI 高级模式**（本机 claude/codex CLI） | 🟡 低 | 无 |
| **会话搜索** | 🟡 低 | 无 |
| **全局快捷键唤起 AI** | 🟠 中 | 仅 TopBar 按钮触发 |

---

### 2.6 窗口管理系统

**实现文件**：`web/src/kernel/window/`、`web/src/shell/Window/index.tsx`、`web/src/shell/WindowManager/index.tsx`

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| 拖拽移动 | ✅ | |
| 缩放（resize） | ✅ | |
| 关闭/最小化/最大化（三键） | ✅ | |
| Z-index 管理（点击置顶） | ✅ | |
| 窗口状态恢复（持久化到 SQLite） | ✅ | 500ms 防抖同步到后端 |
| 页面加载时从后端恢复窗口 | ✅ | |
| 边缘吸附（50%/全屏） | ✅ | 鼠标拖至边缘触发 |

#### 未实现 / 偏差

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **最小化动画（scale to Dock 位置）** | 🟠 中 | 最小化后直接隐藏，无缩放至 Dock 动画 |
| **应用内部状态序列化与恢复** | 🟠 中 | `appState` 字段有定义，但各应用未完全实现内部状态恢复 |

---

### 2.7 Dock & 启动台

**实现文件**：`web/src/shell/Dock/index.tsx`、`web/src/shell/Launchpad/index.tsx`

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| 底部/左侧 Dock 位置切换 | ✅ | isHorizontal 属性 |
| Spring hover 放大效果 | ✅ | framer-motion |
| 运行中指示点 | ✅ | |
| Launch/Focus 现有窗口 | ✅ | |
| Dock 图标启动弹跳效果 | ✅ | |
| Dock 右键菜单 | ✅ | |
| 启动台（全屏网格，搜索，键盘导航） | ✅ | |
| AI 图标（Dock 右侧） | ✅ | 触发 AISidePanel |

#### 未实现

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **Dock 图标 badge**（活跃连接数/告警数） | 🟠 中 | 无 badge 渲染 |
| **最小化窗口缩略图区域** | 🟠 中 | Dock 中间区域规范为缩略图 hover 预览，当前无此功能 |
| **AI 图标动态状态**（idle/thinking/executing/error） | 🟠 中 | 固定图标，无状态变化 |

---

### 2.8 通知 & 告警中心

**实现文件**：`web/src/shell/NotificationCenter/index.tsx`、`web/src/services/notification/`

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| 通知中心面板（右上角下拉） | ✅ | |
| 通知级别（info/success/warning/error） | ✅ | |
| 标记已读/全部已读/清除 | ✅ | |
| Toast 浮层通知 | ✅ | |

#### 未实现

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **长操作完成通知**（文件传输、SQL 导出） | 🟠 中 | 传输任务队列未接入通知 |
| **AI Agent 执行结果通知** | 🟠 中 | 无 |
| **系统原生 Notification API** | 🟡 低 | 无 |
| **按严重程度过滤** | 🟡 低 | 无筛选 UI |

---

### 2.9 用户设置 & 主题

**实现文件**：`web/src/apps/settings/index.tsx`（965 行）

#### 已实现

| 功能 | 状态 | 备注 |
|------|------|------|
| Dark/Light/Auto 主题切换 | ✅ | |
| 壁纸选择（预设图片 + 渐变） | ✅ | |
| Desktop & Dock 设置（位置、大小、放大效果） | ✅ | |
| AI 设置（Provider、Agent Profile、运行时、Channel） | ✅ | 独立 AI tab |
| 通知行为设置 | ✅ | |
| 通用设置 | ✅ | |

#### 未实现

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **在线壁纸库** | 🟡 低 | 无 |
| **强调色自定义** | 🟠 中 | 仅预设 8 色，无自定义颜色选择器 |
| **快捷键自定义 UI** | 🟠 中 | `services/keyboard` 有注册机制，但无 UI 供用户修改 |

---

## 3. 技术架构偏差

以下是规范描述与实际实现的技术选型差异：

| 规范要求 | 实际实现 | 评估 |
|----------|----------|------|
| TanStack Query v5 | **未引入** | 数据获取用 useState + useCallback，无缓存层 |
| Recharts / D3 图表 | **未引入** | DB/Redis 统计图表未实现 |
| AI 工具集（k8s/db/redis/vfs 类） | **仅 4 个基础工具（read/write/edit/bash）** | 平台业务工具集缺失，StubToolExecutor 未接实际服务 |
| Monaco Editor | **textarea（DB SQL）** | 编辑体验缺失，无语法高亮/补全 |

---

## 4. 优先级行动计划

### P0 — 关键核心（阻塞其他功能）

1. **AI 工具集接入真实服务**：将 `StubToolExecutor` 替换为真实工具执行器，并注册 K8s/DB/Redis/VFS 类 Tool
2. **AI Markdown 渲染**：消息气泡中渲染 Markdown（代码块高亮、列表等）
3. **AI 危险操作确认**：在 Tool Call 执行前对 `RiskLevel::High` 操作弹出确认

### P1 — K8s 核心功能

4. **Pod 日志流**：后端 WebSocket 推流，前端 xterm 渲染多 Pod 聚合日志
5. **Pod Web Terminal**：`kubectl exec` via WebSocket
6. **Port-forward 管理**：后端端口转发，前端状态面板

### P2 — 编辑体验

7. **Monaco Editor**：替换 DB SQL 的 textarea，接入 schema 感知自动补全
8. **YAML 查看/编辑**：K8s 资源详情面板，Monaco diff

### P3 — 连接增强

9. **Service → DB/Redis 直连**：K8s Service 注解识别 + port-forward + 凭据注入
10. **Redis Sentinel/Cluster**：后端多节点支持
11. **DB SSH 隧道**：连接配置增加 tunnel 字段

### P4 — 完善度

12. **Teleport 集成**：`tsh` CLI 桥接，K8s 集群 / SSH 节点列举
13. **K8s 波浪事件告警**：WebSocket watch → NotificationCenter
14. **VFS 拖拽跨挂载点**：前端 drag-and-drop UI
15. **窗口缩略图 & 最小化动画**：Dock 缩略图预览

---

## 5. 附录：代码文件清单

| 模块 | 前端文件 | 后端文件 |
|------|----------|----------|
| K8s | `web/src/apps/kubernetes/index.tsx` (545L) | `ventoos-k8s/src/` |
| 数据库 | `web/src/apps/database/index.tsx` (793L) | `ventoos-db/src/` |
| Redis | `web/src/apps/redis/index.tsx` (1241L) | `ventoos-redis/src/` |
| VFS | `web/src/apps/explorer/index.tsx` (3219L) | `ventoos-vfs/src/` |
| AI 助手 | `web/src/apps/ai-assistant/index.tsx` (523L) | `ventoos-agent/src/` |
| AI 侧边栏 | `web/src/shell/AISidePanel/index.tsx` | — |
| 设置 | `web/src/apps/settings/index.tsx` (965L) | — |
| 窗口管理 | `web/src/kernel/window/` | `ventoos-server/src/` |
| Dock | `web/src/shell/Dock/index.tsx` | — |
| 启动台 | `web/src/shell/Launchpad/index.tsx` | — |
| 通知 | `web/src/shell/NotificationCenter/index.tsx` | — |

---

*分析完成时间：2025-07*
