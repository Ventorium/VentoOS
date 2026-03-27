# VentoOS - Kubernetes 模块设计

## 1. 模块定位

Kubernetes 应用是 VentoOS 第一阶段最核心的专业应用之一，目标是达到接近 Lens 的资源操作覆盖率，同时补强 Teleport 接入、跨模块联动、AI 可操作性和多窗口工作流。

它不是简单的 YAML 浏览器，而是围绕“集群连接、资源总览、对象关系、问题排查、资源变更、跨模块联动”设计的一体化控制台。

## 2. 连接模型

### 2.1 支持的连接来源

* 原生 kubeconfig 文件导入。
* 手动录入 API Server + Token / Cert 信息。
* Teleport 登录后派生 Kubernetes 会话。
* 从已有连接复制上下文生成新配置。

### 2.2 Teleport 与 K8s 的标准交互链路

这个流程必须在文档和实现上明确：

1. 用户在连接中心配置 Teleport Proxy、用户名、登录方式和可选集群范围。
2. Rust Core 调用 `tsh login` 或等价能力完成 Teleport 认证。
3. 获取当前用户可访问的 Kubernetes Cluster 列表与角色信息。
4. 用户在 UI 中选择目标 K8s Cluster。
5. Rust Core 生成临时 kubeconfig 文件或内存态 kubeconfig。
6. 该临时 kubeconfig 被注册为一个 `K8s Session`，附带过期时间、来源 Teleport Session、Cluster 标识。
7. K8s 应用使用这个 `K8s Session` 与 API Server 通信。
8. 会话过期或权限变化时，系统提示刷新或重新登录。

关键约束：

* 临时 kubeconfig 默认不长期保存。
* 用户可选择“保存为连接模板”，但不保存敏感短期令牌。
* Teleport 是认证与访问入口，K8s 模块仍然基于标准 Kubernetes 会话工作。

### 2.3 多集群管理

必须支持：

* 集群列表页。
* 按来源分组：原生 kubeconfig / Teleport。
* 收藏、搜索、标签。
* 最近使用。
* 集群健康状态。
* 多集群并行打开窗口。
* 统一命名空间切换。

## 3. 应用信息架构

推荐布局：

* 左侧：集群与命名空间上下文、资源类别导航。
* 中间：资源列表与筛选。
* 右侧：详情页签，例如概览、YAML、事件、日志、终端、关联资源、历史版本。

推荐一级导航：

* 总览
* Nodes
* Workloads
* Config
* Network
* Storage
* Access
* CRDs
* GitOps / ArgoCD
* Events

## 4. 核心能力范围

### 4.1 资源总览

至少包括：

* 集群基本信息：版本、节点数、命名空间数、资源总数。
* CPU / Memory / Pod 使用概览。
* 节点健康概览。
* 最近异常事件。
* 工作负载状态总览。
* 网络入口概览。
* 存储概览。
* 最近任务和告警。

### 4.2 节点管理

节点页至少支持：

* 查看节点列表、角色、版本、Ready 状态、Pod 数量。
* 查看 CPU、Memory、磁盘、Pod 使用率。
* 查看节点标签、污点、地址、运行时信息。
* 进入 Shell 或调试能力。
* `Cordon`
* `Uncordon`
* `Drain`
* `Edit`
* `Delete`
* 查看节点上的 Pod。
* 查看节点事件。

说明：

* 节点 Shell 可以通过 Debug Pod、Node Shell 插件或等价机制实现，但能力上要作为目标支持。
* `Drain` 必须支持参数，例如是否忽略 DaemonSet、是否删除 emptyDir 数据、超时时间。

### 4.3 YAML 编辑器

必须作为独立能力设计，而不是文本框附属功能。

要求：

* 支持查看原始 YAML。
* 支持编辑并提交。
* 支持语法高亮、格式化、Diff 预览。
* 支持只读模式与编辑模式。
* 支持从列表页、详情页、AI 结果中直接打开。
* 支持资源版本冲突检测。
* 支持失败时显示 API 错误。

### 4.4 Workloads 管理

必须覆盖：

* Deployments
* Pods
* DaemonSets
* StatefulSets
* ReplicaSets
* Jobs
* CronJobs

每类资源至少支持：

* 列表查看。
* 搜索、标签筛选、命名空间筛选。
* 详情查看。
* YAML 编辑。
* Describe / 事件查看。
* 删除。
* 查看关联 Pod。

补充能力：

* Deployment：扩缩容、滚动重启、镜像更新、历史版本查看。
* Pod：日志、实时日志流、Shell/Exec、文件拷贝、重建、删除。
* StatefulSet：副本调整、PVC 关联查看。
* DaemonSet：滚动更新状态查看。
* Job / CronJob：手动触发、查看最近执行记录。

### 4.5 配置类资源管理

必须覆盖：

* ConfigMaps
* Secrets

要求：

* 支持列表、详情、YAML 编辑、创建、删除。
* ConfigMap 支持文本预览。
* Secret 默认脱敏显示，允许按权限显式查看解码结果。
* 支持查看被哪些 Workload 引用。

### 4.6 网络类资源管理

必须覆盖：

* Services
* Ingress
* IngressClasses
* Port Forward

要求：

* Service 支持展示 Selector、Endpoints、Ports、关联 Pod。
* Ingress 支持展示 Host、Path、Backend、TLS。
* Port Forward 支持创建、查看、终止、复用与转存为临时连接。
* 网络资源详情中应提供“打开数据库 / 打开 Redis / 打开浏览器”的联动入口。

### 4.7 存储类资源管理

必须覆盖：

* PersistentVolumes
* PersistentVolumeClaims
* StorageClasses

要求：

* 查看容量、状态、访问模式、回收策略。
* 查看 PVC 与 Pod / StatefulSet 的绑定关系。
* 支持 YAML 编辑与删除。

### 4.8 其它核心资源

必须覆盖：

* Namespaces
* Helm Releases

说明：

* Namespace 至少支持概览、资源统计、标签注解、删除、资源使用情况。
* Helm 至少支持列表、Values 查看、History、Upgrade / Rollback 的架构预留；第一阶段最低要求是读取和基础操作入口。

### 4.9 权限类资源管理

必须覆盖：

* ServiceAccounts
* ClusterRoles
* Roles
* ClusterRoleBindings
* RoleBindings

要求：

* 支持查看资源详情、规则与绑定关系。
* 支持 YAML 编辑。
* 支持关系导航，例如某个 ServiceAccount 被哪些 Workload 使用。

### 4.10 CRD 资源管理

要求：

* 展示 CRD 列表和基础元数据。
* 支持查看某个 CRD 下的实例资源。
* 支持通用列表与详情页。
* 支持 YAML 编辑。
* 支持因 CRD 动态渲染资源视图。

### 4.11 ArgoCD 资源管理

第一阶段需要覆盖常见对象：

* Applications
* ApplicationSets
* Projects

至少支持：

* 列表与状态查看。
* 健康状态、同步状态查看。
* 打开 YAML。
* 打开相关 Workload / Namespace。

## 5. 交互能力要求

### 5.1 日志

* 查看当前日志。
* 实时流式日志。
* 多容器切换。
* 搜索、下载、复制。
* 错误高亮。

### 5.2 Shell / Exec

* 对 Pod 执行命令。
* 支持容器选择。
* 支持独立终端窗口。
* 会话断开可提示重连。

### 5.3 资源关系导航

从任意资源出发，应该能快速跳转到相关资源，例如：

* Service -> Endpoints -> Pod
* Deployment -> ReplicaSet -> Pod
* Pod -> Node / PVC / ConfigMap / Secret
* PVC -> PV / StatefulSet

## 6. 多集群与多窗口能力

* 支持同时打开多个集群窗口。
* 支持在不同窗口固定不同命名空间上下文。
* 支持跨窗口复制 YAML、复制资源名称、拖拽资源链接到任务或 AI 面板。
* 支持多集群资源搜索入口。

## 7. AI 联动

K8s 模块应至少向 AI 暴露以下能力：

* 查询集群和命名空间。
* 查询资源状态。
* 获取日志、事件、YAML。
* 执行扩缩容、重启、删除等变更操作。
* 创建临时 Port Forward。
* 从 K8s 服务打开数据库 / Redis。

## 8. 性能要求

* 列表页支持分页与虚拟滚动。
* Watch 对高频资源应可配置。
* YAML 与日志流采用按需加载。
* 多集群并行时要限制后台 watch 总量。

## 9. 安全要求

* 所有写操作需明确确认或进入任务系统。
* 删除、Drain、权限修改属于高风险操作。
* 临时 kubeconfig、端口映射要自动回收。

## 10. 非目标

第一阶段不要求完全覆盖 kubectl 全部资源与动作，但文档中列出的资源域与基本操作必须可用。
