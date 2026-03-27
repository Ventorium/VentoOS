# VentoOS - 架构设计

## 1. 总体架构

VentoOS 采用“浏览器桌面壳 + 本地 Rust Core + 外部资源适配层”的三层架构，但在实现上更准确地说是五个协同子系统：

* WebOS Shell：桌面、窗口、应用容器、全局任务、全局通知、AI 入口。
* Application Layer：K8s、数据库、Redis、资源管理器、AI 助手等应用。
* System Capability Layer：连接、资源、任务、VFS、通知、会话、搜索、端口转发、终端等系统级能力。
* Runtime Core（Rust）：高性能 I/O、协议适配、任务执行、安全隔离、状态持久化。
* External Providers：Kubernetes、Teleport、数据库、Redis、文件协议、Agent 引擎。

## 2. 设计原则

* 前端不直接访问外部资源。
* 一切能力都先沉淀为 Rust Core 的系统能力，再向应用和 AI 暴露。
* 高吞吐与高频协议交互必须下沉到 Rust。
* UI 与 AI 调用同一套能力接口，避免双轨实现。
* 状态模型统一，窗口状态、连接状态、任务状态、资源状态必须可关联。

## 3. 分层设计

### 3.1 WebOS Shell（React）

职责：

* 桌面背景、顶部菜单栏、底部 Dock、窗口管理器、通知中心、任务中心。
* 应用启动、窗口生命周期、焦点管理、工作区管理、状态恢复。
* 全局命令面板、AI 对话入口、跨应用联动入口。

技术建议：

* React
* TypeScript
* Zustand 或等价轻量状态层
* Framer Motion 或 Motion One 用于桌面动效
* TailwindCSS 或 CSS Variables + 原子类方案
* WebSocket + HTTP 组合通信

### 3.2 Application Layer

应用不是“页面分组”，而是系统内的独立功能单元。每个应用至少支持：

* 作为独立窗口打开。
* 从其他应用上下文联动打开。
* 与任务中心、通知中心、AI 助手联动。
* 保存自己的窗口级与文档级状态。

第一阶段应用：

* Kubernetes App
* Database App
* Redis App
* Explorer App
* AI Assistant App

### 3.3 System Capability Layer

这是 VentoOS 的真正核心边界，负责把各种异构系统抽象成统一能力。

核心模块：

* Connection Manager：统一管理 kubeconfig、Teleport、DB、Redis、SSH、FTP、SMB、S3、网盘等连接。
* Session Manager：维护登录状态、租约、token 刷新、临时凭据与窗口上下文。
* Resource Graph：把集群、服务、数据库实例、Redis 实例、文件挂载点、任务等组织成可导航关系图。
* VFS Engine：统一路径、节点元数据、文件/目录操作、传输、挂载、缓存。
* Port Forward / Tunnel Service：管理 K8s 端口映射、SSH 隧道、HTTP 隧道、临时代理。
* Task Engine：异步任务、流式进度、取消、重试、回滚、审计。
* Notification Center：任务结果、风险提醒、异常告警、Agent 请求确认。
* Tool Registry：向 AI 暴露可调用 Tool，并执行权限审查、参数校验和结果回写。

### 3.4 Runtime Core（Rust）

Rust Core 负责所有需要高可靠、高性能和安全边界的工作：

* 协议适配器与连接池。
* 资源同步、watch、流式日志、终端会话。
* 端口转发、隧道、临时文件、Kubeconfig 生成与隔离。
* VFS 抽象与大文件传输。
* 本地数据库存储、索引、缓存和凭据管理。
* Agent Engine 进程管理与 Tool 执行。

建议内部子模块：

* `core.connection`
* `core.k8s`
* `core.db`
* `core.redis`
* `core.vfs`
* `core.tasks`
* `core.notifications`
* `core.agent`
* `core.security`
* `core.persistence`

### 3.5 External Providers

* Kubernetes API Server
* Teleport CLI / SDK / Web 登录能力
* PostgreSQL / MySQL / SQLite
* Redis / Sentinel / Cluster
* SSH/SFTP / FTP / SMB / S3 / 网盘 SDK
* Claude Code / Codex / OpenCode 等本地 Agent 引擎

## 4. 关键交互链路

### 4.1 UI 到核心层

* 前端通过 WebSocket 订阅任务流、日志流、资源 watch 和 Agent 流式输出。
* 前端通过 HTTP 或 RPC 风格接口发起显式操作请求。
* 对于长任务，前端只持有任务 ID 和局部状态，不直接持有底层连接。

### 4.2 Teleport 到 K8s

标准链路必须明确为：

1. 用户在连接中心选择 Teleport 集群或 Proxy。
2. Rust Core 调用 `tsh login` 或等价能力完成认证。
3. 用户在已登录上下文中选择可访问的 Kubernetes 集群/资源。
4. Rust Core 生成临时 kubeconfig 文件或内存 kubeconfig 会话。
5. K8s App 和相关 Tool 使用该临时 kubeconfig 与目标集群交互。
6. 会话过期时由 Session Manager 负责刷新、重建或提示重新登录。

这意味着 Teleport 不是直接“代替 Kubernetes 模块”，而是 Kubernetes 连接能力的一种上游认证与访问提供者。

### 4.3 K8s 到 DB / Redis

系统不要求用户手动执行 `port-forward` 再创建连接，而是支持以下统一链路：

1. 用户在 Service / Pod / Ingress / Workload 上触发“打开数据库”或“打开 Redis”。
2. Resource Graph 根据标签、容器端口、环境变量、注解、Service 名称与已知模板识别目标类型。
3. Rust Core 自动建立所需中间链路，例如端口转发、Pod 代理、临时 tunnel、Service DNS 解析。
4. 生成临时连接配置并注入 Database App 或 Redis App。
5. 用户可选择“仅本次会话使用”或“保存为连接”。

## 5. 状态与持久化架构

### 5.1 前端持久化

适合保存：

* 窗口布局、最近打开应用、主题、壁纸、快捷入口、草稿。
* 非敏感 UI 状态。

建议存储：

* IndexedDB
* LocalStorage 仅保存极小型偏好设置

### 5.2 Rust Core 持久化

适合保存：

* 连接元数据
* 任务历史
* 资源缓存索引
* AI 会话摘要
* 本地搜索索引

建议存储：

* SQLite
* 系统安全存储用于凭据密文或密钥材料

## 6. 安全架构

* 凭据明文不进入前端。
* 高风险操作需要显式确认。
* 临时 kubeconfig、临时 tunnel、端口转发要有生命周期控制与自动清理。
* 所有 Tool 调用必须有调用者、上下文、参数、结果和审计记录。
* AI Engine 不可直接越过 Tool Registry 操作系统能力。

## 7. 性能架构要求

* K8s 资源 watch、日志流、终端流、文件传输必须是流式架构。
* 列表型资源必须支持分页、虚拟滚动、增量加载、条件刷新。
* 数据库对象树、Redis Key 树、VFS 目录树必须支持惰性展开。
* 大任务需要后台执行，不阻塞 UI 主线程。

## 8. 扩展架构

第一阶段不做插件市场，但架构上必须支持未来扩展：

* Adapter 插件：新增协议、文件系统、外部资源类型。
* App 插件：新增系统应用。
* Agent Engine 插件：新增本地或远程模型执行器。
* Tool / Skill 插件：新增 AI 可调用的系统能力集。
