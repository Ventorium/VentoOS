# VentoOS - 系统设计

## 1. 系统核心对象模型

VentoOS 第一阶段必须围绕以下系统级对象统一建模：

* `Connection`：外部资源连接定义，如 K8s、Teleport、DB、Redis、SSH、S3。
* `Session`：某次登录、认证、租约、临时隧道或端口映射的有效会话。
* `Resource`：可浏览与操作的对象，如 Pod、Table、Redis Key、File、Service。
* `Mount`：VFS 中的挂载点定义。
* `Window`：WebOS 窗口实例。
* `Task`：异步执行单元。
* `Notification`：全局通知。
* `ToolCall`：AI 对系统能力的单次调用记录。

这些对象之间必须可关联，例如某个 `Task` 由某个 `ToolCall` 触发，作用于某个 `Resource`，依赖某个 `Session`，最后在某个 `Window` 中展示结果。

## 2. 核心模块

### 2.1 窗口管理系统

能力要求：

* 多窗口、多实例、多应用并行。
* 拖拽、缩放、最小化、最大化、关闭。
* 类 macOS 交通灯与窗口动效。
* Z-Index 层级、聚焦与激活态管理。
* 窗口停靠、居中、恢复、工作区切换。
* 刷新后恢复窗口、标签页、资源路径、表单草稿与滚动位置。

建议状态结构：

* `WindowState`
* `WorkspaceState`
* `DesktopLayoutState`
* `AppSessionState`

### 2.2 连接管理系统

职责：

* 保存连接配置与分组。
* 管理连接健康状态。
* 生成临时会话与租约。
* 统一暴露连接测试、重连、过期、刷新能力。

需要支持的连接类型：

* Kubernetes
* Teleport
* PostgreSQL
* MySQL
* SQLite
* Redis / Sentinel / Cluster
* SSH / SFTP
* FTP
* SMB
* S3
* 网盘类 Provider

### 2.3 Kubernetes 子系统

子模块：

* Cluster Manager
* Context Manager
* Teleport Session Provider
* Resource Explorer
* Workload Manager
* Node Manager
* YAML Editor
* Log Viewer
* Exec Terminal
* Port Forward Manager

关键要求：

* 同时支持原生 kubeconfig 和 Teleport 驱动的临时 kubeconfig。
* 支持多集群、多上下文、多命名空间切换。
* 资源 watch 与轮询组合，确保性能与实时性平衡。

### 2.4 数据库子系统

子模块：

* Connection Group Manager
* Tunnel Manager
* Query Workspace
* Schema Explorer
* Table Maintenance
* Import / Export Service
* ER Diagram Exporter

关键要求：

* 支持连接分组、收藏、搜索与测试。
* 支持多数据库切换、对象浏览、DDL 与 DML。
* 支持多标签 SQL 工作区和结果导出。

### 2.5 Redis 子系统

子模块：

* Connection Group Manager
* Database Selector
* Key Explorer
* Value Viewer / Editor
* Command Runner
* Monitor / Slowlog / PubSub Viewer
* Bulk Action Engine

关键要求：

* 对大 Key 空间必须支持扫描、过滤和懒加载。
* 复杂值编辑必须区分字符串、Hash、List、Set、ZSet、JSON、Stream 等类型。

### 2.6 VFS 系统

子模块：

* Mount Registry
* Path Resolver
* Metadata Indexer
* File / Directory Operation API
* Transfer Engine
* Conflict Resolver
* Preview Service

目标：

* 抹平不同底层协议的目录、文件与权限差异。
* 提供 Finder 风格统一操作。
* 支持跨挂载点传输与后台任务。

### 2.7 Agent 子系统

子模块：

* Agent Engine Adapter
* Tool Registry
* Skill Registry
* Context Builder
* Permission Guard
* Task Planner
* Result Renderer

目标：

* 接入本机现有 Agent 引擎。
* 将系统能力暴露为 Tool。
* 用统一任务模型承接 Agent 执行链。

### 2.8 任务系统

能力要求：

* 异步任务。
* 可取消、可重试、可追踪。
* 支持依赖关系和子任务。
* 支持流式日志、进度、状态切换。
* 对部分操作支持补偿或回滚。

任务类型示例：

* 登录与凭据刷新
* K8s 资源读取与变更
* 数据库导入导出
* Redis 批量清理
* 文件复制 / 上传 / 下载
* Agent 任务执行

### 2.9 通知与事件系统

必须提供：

* 全局通知中心。
* 任务完成 / 失败通知。
* 高风险确认通知。
* 后台任务进度提醒。
* 与浏览器原生通知联动。

## 3. 关键状态机

### 3.1 连接状态机

`draft -> testing -> available -> expired -> reconnecting -> available`

异常状态：

`auth_failed`
`network_error`
`permission_denied`
`resource_not_found`

### 3.2 任务状态机

`queued -> running -> waiting_confirmation -> running -> success`

失败链路：

`queued -> running -> failed`
`queued -> running -> cancelled`
`queued -> running -> partial_success`

### 3.3 窗口状态机

`created -> opening -> active -> blurred -> minimized -> restored -> closing -> closed`

## 4. 典型数据流

### 4.1 用户手动操作

用户操作 ->
WebOS Shell 捕获事件 ->
应用层生成命令 ->
Rust Core 执行 ->
任务系统记录 ->
外部资源返回结果 ->
资源缓存更新 ->
窗口局部刷新 ->
通知中心回写

### 4.2 AI 触发操作

用户输入 ->
Agent 解析意图 ->
Context Builder 注入当前窗口与资源上下文 ->
Tool Registry 选择工具 ->
Permission Guard 检查风险 ->
Task Engine 执行 ->
结果流回 AI 与 UI

## 5. 持久化设计

### 5.1 前端

* 桌面布局
* 窗口尺寸和位置
* 标签页状态
* 草稿和非敏感偏好

### 5.2 Rust Core

* 连接定义与分组
* 会话元数据
* 任务历史
* 资源缓存
* AI 对话摘要
* 审计日志

## 6. 安全设计

* Token、密码、私钥不以明文进入前端。
* 临时文件必须有生命周期和清理策略。
* 所有删除、批量写入、权限变更、集群级操作都必须确认。
* Agent 不允许绕过 Tool Registry 直连系统能力。

## 7. 可观测性设计

系统必须内置最基础的可观测能力：

* Core 日志
* Task 日志
* 外部连接错误日志
* Agent Tool 调用链路日志
* 用户操作审计日志

## 8. 扩展性设计

* Adapter 模式：协议适配器、Agent 适配器、资源识别器、挂载适配器统一注册。
* Capability Registry：所有系统能力统一注册，并支持权限声明、参数声明、风险声明。
* App Contract：应用通过统一接口接收资源、任务、通知与上下文。
