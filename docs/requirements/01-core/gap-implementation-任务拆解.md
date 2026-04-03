# VentoOS 差异实现 — 任务拆解

> 基于 `implementation-gap-analysis.md` 的完整实现计划  
> 主 Agent 统一拆解，7 个子 Agent 并行实现  
> 创建时间：2026-04-03

---

## 1. 总体目标

将 `implementation-gap-analysis.md` 中所有未实现项全部完成，具体包括：

1. 每个模块输出架构设计文档到 `docs/design/`
2. 所有未实现功能完成编码
3. 每个系统模块 + 每个应用均有完整测试用例（真实数据，允许 Docker 启动服务）
4. 前端 `pnpm build` 通过，后端 `cargo clippy` + `cargo build` 通过

---

## 2. 子 Agent 分工

### 子 Agent 1：K8s 工作台

| 序号 | 子任务 | 验收标准 | 优先级 |
|------|--------|----------|--------|
| 1.1 | Pod 实时日志流（WebSocket 多 Pod 聚合、正则过滤、导出） | 后端 WebSocket 日志推送 API 可用；前端 xterm 渲染日志流 | P0 |
| 1.2 | Pod Web Terminal（kubectl exec，多 tab） | 后端 exec WebSocket；前端 xterm 终端可交互 | P0 |
| 1.3 | Port-forward 管理（一键，本地端口，状态栏） | 后端端口转发可用；前端 UI 管理面板 | P0 |
| 1.4 | 资源 YAML 查看/编辑（Monaco diff 高亮） | 资源详情面板可展示 YAML；Monaco 编辑器集成 | P1 |
| 1.5 | 资源详情（Events、Conditions、Annotations） | 点击资源展示详情面板 | P1 |
| 1.6 | Label selector / 高级过滤 | 资源列表支持 label 筛选 | P2 |
| 1.7 | Service → DB/Redis 直连 | K8s Service 识别→port-forward→凭据注入→打开应用 | P0 |
| 1.8 | Teleport 集成（tsh kube ls / tsh login） | tsh CLI 桥接可用 | P2 |
| 1.9 | K8s 模块完整测试 | Docker 启动 k3s/kind 集群，覆盖所有 API 操作 | P0 |

### 子 Agent 2：数据库工作台

| 序号 | 子任务 | 验收标准 | 优先级 |
|------|--------|----------|--------|
| 2.1 | Monaco Editor SQL 编辑器 | textarea 替换为 Monaco，语法高亮 | P0 |
| 2.2 | SQL 自动补全（schema 感知） | 输入时弹出 schema/table/column 补全 | P0 |
| 2.3 | 多结果 tab | 多次执行 SQL 结果在 tab 中切换 | P1 |
| 2.4 | CSV/JSON 结果导出 | 查询结果可导出为文件 | P1 |
| 2.5 | SSH 隧道连接 | 连接配置增加 tunnel 字段，后端实现 SSH 隧道 | P1 |
| 2.6 | 行内编辑 | 表格单元格可直接编辑并保存 | P1 |
| 2.7 | 慢查询/EXPLAIN 可视化 | EXPLAIN 结果可视化展示 | P2 |
| 2.8 | AI 辅助（自然语言→SQL、SQL 解释） | 接入 AI Agent，自然语言生成 SQL | P2 |
| 2.9 | 数据库模块完整测试 | Docker 启动 PostgreSQL/MySQL，覆盖连接/查询/导出 | P0 |

### 子 Agent 3：Redis 工作台

| 序号 | 子任务 | 验收标准 | 优先级 |
|------|--------|----------|--------|
| 3.1 | Sentinel 模式支持 | 后端 Sentinel 连接；前端配置 UI | P1 |
| 3.2 | Cluster 模式支持 | 后端 Cluster 节点发现；前端配置 UI | P1 |
| 3.3 | TLS 连接 | 连接配置支持 TLS 证书 | P1 |
| 3.4 | MONITOR 实时命令流 | WebSocket 推送 MONITOR 输出 | P1 |
| 3.5 | 批量操作（按 pattern 删除/导出/TTL） | 前端批量选择+后端批量执行 | P1 |
| 3.6 | Pub/Sub 订阅实时查看 | WebSocket 推送订阅消息 | P1 |
| 3.7 | Stream 类型编辑 | Stream 数据类型的读写操作 | P1 |
| 3.8 | INFO 统计图表 | Recharts 展示 Redis 统计信息 | P2 |
| 3.9 | 内存分析 | key 内存占用分析 | P2 |
| 3.10 | Redis 模块完整测试 | Docker 启动 Redis（单机/Sentinel/Cluster），覆盖所有操作 | P0 |

### 子 Agent 4：VFS / 资源管理器

| 序号 | 子任务 | 验收标准 | 优先级 |
|------|--------|----------|--------|
| 4.1 | K8s Pod 文件系统 Provider | kubectl cp/exec tar 实现文件读写 | P1 |
| 4.2 | UI 拖拽跨挂载点复制/移动 | 前端 drag-and-drop 交互 | P1 |
| 4.3 | 快速查找（⌘F 全路径搜索） | ⌘F 打开搜索框，实时过滤 | P1 |
| 4.4 | 日志文件实时 tail | 文件预览支持 tail -f 模式 | P2 |
| 4.5 | 右键「在终端中打开」 | 右键菜单→打开 Terminal app | P1 |
| 4.6 | 批量压缩/解压 | tar.gz/zip 管理 | P2 |
| 4.7 | 权限修改（chmod） | 文件属性面板可修改权限 | P2 |
| 4.8 | Watch 实时变更通知 | VFS Provider watch trait + 前端实时刷新 | P2 |
| 4.9 | VFS 模块完整测试 | Docker 启动 SFTP/S3(MinIO)/WebDAV/FTP，覆盖所有 Provider | P0 |

### 子 Agent 5：AI Agent 工作台

| 序号 | 子任务 | 验收标准 | 优先级 |
|------|--------|----------|--------|
| 5.1 | 平台 Tool 集（k8s_*/db_*/redis_*/vfs_*） | StubToolExecutor→真实执行器，注册业务工具 | P0 |
| 5.2 | open_window / notify / get_context 工具 | AI 可打开窗口/发送通知/获取上下文 | P0 |
| 5.3 | Markdown 渲染 & 代码高亮 | 消息气泡 Markdown 解析+代码高亮 | P0 |
| 5.4 | 危险操作「确认执行」模式 | RiskLevel::High 操作弹确认对话框 | P0 |
| 5.5 | 上下文注入（K8s YAML/SQL 结果/文件内容） | 一键投喂当前上下文给 AI | P1 |
| 5.6 | 语音输入（Web Speech API） | 语音按钮+语音识别 | P2 |
| 5.7 | 文件/截图粘贴（Vision 多模态） | 支持图片粘贴发送 | P2 |
| 5.8 | 全局快捷键唤起 AI | ⌘+Shift+A 打开 AI | P1 |
| 5.9 | AI Agent 模块完整测试 | Mock LLM Provider，测试工具路由/确认/会话/Markdown | P0 |

### 子 Agent 6：Shell & 窗口系统

| 序号 | 子任务 | 验收标准 | 优先级 |
|------|--------|----------|--------|
| 6.1 | 最小化动画（scale to Dock 位置） | 最小化时 framer-motion 缩放至 Dock | P1 |
| 6.2 | 应用内部状态序列化与恢复 | 各应用实现 appState 序列化/反序列化 | P1 |
| 6.3 | Dock 图标 badge | 活跃连接数/告警数显示 | P1 |
| 6.4 | 最小化窗口缩略图区域 | Dock 中间区域展示最小化窗口缩略图 | P2 |
| 6.5 | AI 图标动态状态 | idle/thinking/executing/error 四种状态 | P1 |
| 6.6 | Shell/窗口系统完整测试 | 窗口创建/最小化/最大化/恢复/z-index 全覆盖 | P0 |

### 子 Agent 7：系统服务（通知+设置+连接）

| 序号 | 子任务 | 验收标准 | 优先级 |
|------|--------|----------|--------|
| 7.1 | 长操作完成通知 | 文件传输/SQL 导出完成→通知中心 | P1 |
| 7.2 | AI Agent 执行结果通知 | AI 工具执行完成→通知 | P1 |
| 7.3 | 系统原生 Notification API | 浏览器 Notification API 集成 | P2 |
| 7.4 | 按严重程度过滤通知 | 通知中心支持 info/warning/error 筛选 | P2 |
| 7.5 | 快捷键自定义 UI | 设置中展示可自定义快捷键面板 | P1 |
| 7.6 | 强调色自定义 | 颜色选择器替换预设 8 色 | P1 |
| 7.7 | 配置导入导出 | 设置/连接批量导入导出 | P2 |
| 7.8 | 系统服务完整测试 | 通知发送/过滤/设置持久化/快捷键注册全覆盖 | P0 |

---

## 3. 原始需求与拆解表

| 序号 | 原始需求 | 子任务数 | 验收标准 | 状态 |
|------|----------|---------|----------|------|
| 1 | K8s 工作台功能补全 | 9 | 所有 P0/P1 功能可用 + 测试通过 | 未开始 |
| 2 | 数据库工作台功能补全 | 9 | Monaco SQL 编辑器 + 补全 + 导出 + 测试 | 未开始 |
| 3 | Redis 工作台功能补全 | 10 | Sentinel/Cluster/MONITOR/PubSub + 测试 | 未开始 |
| 4 | VFS 资源管理器功能补全 | 9 | K8s Provider + 拖拽 + 搜索 + 测试 | 未开始 |
| 5 | AI Agent 功能补全 | 9 | 真实工具集 + Markdown + 确认 + 测试 | 未开始 |
| 6 | Shell/窗口系统功能补全 | 6 | 动画 + badge + 缩略图 + 测试 | 未开始 |
| 7 | 系统服务功能补全 | 8 | 通知增强 + 设置增强 + 测试 | 未开始 |

---

## 4. 架构设计文档清单

| 文档 | 路径 | 内容 |
|------|------|------|
| 系统架构总览 | `docs/design/00-system-overview.md` | 五层架构、通信协议、数据流 |
| 内核架构 | `docs/design/01-kernel-architecture.md` | 窗口管理、应用注册、进程管理 |
| K8s 工作台 | `docs/design/02-k8s-workbench.md` | K8s 资源模型、日志/exec/port-forward |
| 数据库工作台 | `docs/design/03-database-workbench.md` | 连接池、SQL 编辑、结果管理 |
| Redis 工作台 | `docs/design/04-redis-workbench.md` | RESP 协议、多模式、监控 |
| VFS 资源管理器 | `docs/design/05-vfs-explorer.md` | Provider 抽象、传输引擎、UI 交互 |
| AI Agent 系统 | `docs/design/06-ai-agent.md` | Agent 引擎、Tool 注册、安全守卫 |
| Shell 组件 | `docs/design/07-shell-components.md` | Dock、TopBar、通知、CTX Menu |
| 通知系统 | `docs/design/08-notification-system.md` | 通知管道、原生 API、过滤机制 |
| 设置系统 | `docs/design/09-settings-system.md` | 主题、快捷键、导入导出 |
| 连接管理 | `docs/design/10-connection-management.md` | 统一连接模型、隧道、凭据 |
| 任务引擎 | `docs/design/11-task-engine.md` | 任务队列、进度追踪、通知集成 |
| 测试策略 | `docs/design/12-testing-strategy.md` | Docker 测试环境、覆盖标准 |

---

## 5. 测试要求

- **Rust 后端**：每个 crate 必须有集成测试，使用 Docker 启动真实服务
  - K8s：kind/k3d 集群
  - 数据库：PostgreSQL + MySQL Docker 容器
  - Redis：Redis 单机 + Sentinel + Cluster Docker 容器
  - VFS：SFTP + MinIO(S3) + WebDAV + FTP Docker 容器
  - AI：Mock HTTP Server 模拟 LLM API
- **前端**：每个 App 和 Shell 组件使用 Vitest + React Testing Library
  - 必须覆盖：状态管理、用户交互、API 调用、错误处理
  - 不能简单 mock：API 层使用 MSW (Mock Service Worker)

---

*创建时间：2026-04-03*
