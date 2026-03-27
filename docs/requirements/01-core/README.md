# VentoOS Core Requirements

本目录用于定义 VentoOS 第一阶段核心需求、架构边界、系统交互模型与专题能力设计。

VentoOS 的定位不是“带几个运维页面的 Web 项目”，而是一个运行在本机、通过浏览器承载交互的 WebOS。它以 React + Rust 为基础，提供接近 macOS 的桌面体验，把 Kubernetes、数据库、Redis、资源管理、AI Agent 统一为一套可编排、可恢复、可审计的本地操作系统。

## 阅读顺序

1. [原始需求描述](./原始需求描述.md)
2. [产品总体描述（PRD）](./ventoos-prd.md)
3. [架构设计](./ventoos-architecture.md)
4. [系统设计](./ventoos-system-design.md)
5. [UI / UX 设计](./ventoos-ui.md)
6. [AI & Agent 设计](./ventoos-ai.md)

## 专题能力文档

1. [Kubernetes 模块设计](./ventoos-k8s.md)
2. [数据库模块设计](./ventoos-database.md)
3. [Redis 模块设计](./ventoos-redis.md)
4. [VFS / 资源管理设计](./ventoos-vfs.md)
5. [服务直连与跨模块联动设计](./ventoos-service-connectivity.md)

## 总体描述

VentoOS 第一阶段重点解决的是“运维工具碎片化”和“AI 无法真正操作系统能力”两个问题：

* 对用户来说，K8s、数据库、Redis、远程文件、AI 助手不再是分散工具，而是桌面上的独立应用与统一任务系统。
* 对系统来说，所有能力都必须先沉淀为 Rust Core 可调用的系统能力，再向 UI 和 Agent 暴露，避免前端直连外部资源造成性能、安全与一致性问题。
* 对交互来说，每个模块都是应用，每个应用至少打开一个窗口，窗口具备类 macOS 的交通灯、动效、毛玻璃、状态恢复和全局调度能力。
* 对连接来说，Kubernetes 必须支持原生 kubeconfig 与 Teleport 登录链路；数据库和 Redis 既要支持独立连接，也要支持从 K8s 服务、Pod、端口映射、Service/Ingress 元信息中快速生成连接。
* 对 AI 来说，前期直接复用本机成熟 Agent 引擎，例如 Claude Code、Codex、OpenCode，由 VentoOS 负责统一调度、上下文注入、Tool/Skill 注册、权限确认、任务观察与结果回写。

## 第一阶段必须交付的产品结果

* 可运行的 WebOS Shell：桌面、Dock、窗口系统、通知中心、任务中心、AI 入口全部可用。
* Kubernetes 应用：至少覆盖资源总览、节点、工作负载、配置、网络、存储、权限、CRD、ArgoCD、多集群与 YAML 编辑。
* 数据库应用：至少覆盖 PostgreSQL、MySQL、SQLite 的连接管理、分组、隧道、对象浏览、DDL/DML、导入导出、ER 图、SQL 多标签查询。
* Redis 应用：至少覆盖连接管理、数据库切换、Key 浏览、数据编辑、命令执行、监控与批量操作。
* 资源管理器应用：基于统一 VFS 屏蔽本地、SSH/SFTP、FTP、SMB、S3 与网盘差异，提供 Finder 风格操作。
* AI 助手应用：可以在对话中驱动系统已注册能力，执行可审计、可确认、可恢复的系统任务。

## 核心设计约束

* 本地优先：凭据、缓存、索引、历史任务默认保存在本机。
* 性能优先：所有高频 I/O、协议适配、连接池、文件传输、端口转发、日志流式处理均在 Rust Core 完成。
* 统一抽象：连接、资源、任务、通知、窗口、挂载点、Agent Tool 必须有统一模型。
* 安全默认：高风险写操作必须确认，敏感凭据不能直达前端明文。
* 可扩展：第一阶段不做插件市场，但所有适配器、应用、Agent Engine 都必须为后续插件化预留接口。
