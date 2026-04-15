# VentoOS K8s 应用 Lens UI 1:1 还原 — 任务拆解与执行计划

> 对应 PRD：[ventoos-k8s-lens-prd.md](./ventoos-k8s-lens-prd.md)

---

## 1. 需求拆解总览

| 序号 | 原始需求项 | 子任务数 | 依赖 | 优先级 |
|------|-----------|---------|------|--------|
| 1 | 全局布局与视觉系统搭建 | 4 | 无 | P0 |
| 2 | 集群连接管理（多集群 + Teleport） | 5 | 1 | P0 |
| 3 | 左侧导航树（Sidebar） | 3 | 2 | P0 |
| 4 | 顶部标签系统（Tab System） | 3 | 1 | P0 |
| 5 | 资源列表页框架（Toolbar + Table） | 4 | 1 | P0 |
| 6 | 右侧详情抽屉（Right Detail Drawer） | 4 | 5 | P0 |
| 7 | 底部操作面板（Bottom Panel） | 4 | 5 | P0 |
| 8 | Workloads 资源全量实现 | 6 | 5,6,7 | P1 |
| 9 | Config / Network / Storage / Access / CRD 资源实现 | 5 | 5,6,7 | P1 |
| 10 | 特殊交互（Logs / Shell / Port Forward / Metrics） | 5 | 6,7 | P1 |
| 11 | Helm / Events / Overview Dashboard | 3 | 5,6 | P2 |
| 12 | 全局搜索与 Command Palette | 2 | 3,4,5 | P2 |
| 13 | 性能优化与 Watch 机制 | 3 | 全部列表页 | P2 |
| 14 | 验收与文档 | 3 | 全部 | P0 |

---

## 2. 子任务详情

### 2.1 全局布局与视觉系统搭建

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 1.1 设计 Token 落地 | 梳理 K8s 应用所需的系统扩展 Token（状态色、层级背景），全部接入 VentoOS 统一主题，禁止写死色值 | `web/src/theme.ts` 或统一主题配置文件 | 主题扩展文档/PR | 所有颜色使用系统 CSS Variables 驱动 |
| 1.2 布局骨架组件 | 实现 Sidebar + TabBar + Toolbar + Main + RightDrawer + BottomPanel 六级布局 | `apps/k8s/layouts/` | `K8sLayout.tsx` 及子组件 | 各区域尺寸符合 PRD，支持抽屉/面板的显隐与尺寸调整 |
| 1.3 基础组件库 | 表格、Badge、树节点、图标按钮、下拉选择器、Tabs | `apps/k8s/components/` | 基础组件集合 | 布局结构参照 Lens，样式完全遵循 VentoOS 系统主题 |
| 1.4 K8s 应用注册 | 将 K8s 应用注册到 VentoOS 窗口系统 | `store/apps.ts`、窗口管理器 | 可在桌面/ Dock 打开 K8s 应用 | 窗口打开后显示全局布局骨架 |

### 2.2 集群连接管理（多集群 + Teleport）

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 2.1 Cluster Catalog UI | 集群目录页、卡片网格、Hotbar | `apps/k8s/pages/Catalog/` | `ClusterCatalog.tsx` | 1:1 还原 Lens Catalog 布局结构，支持收藏 |
| 2.2 添加集群弹窗 | kubeconfig 导入 / 手动输入 / Teleport 选择 | `apps/k8s/pages/Catalog/AddClusterModal.tsx` | 弹窗组件 | 三种来源的表单完整可用 |
| 2.3 Rust Core：原生 K8s 连接 | kubeconfig 解析、多 Session 管理、健康检查 | `native/crates/ventoos-k8s/` | API 接口 `/api/k8s/clusters` | 能导入本地 kubeconfig 并返回集群列表与状态 |
| 2.4 Rust Core：Teleport 集成 | `tsh login` 调用、集群发现、临时 kubeconfig 生成 | `native/crates/ventoos-connection/` 或 `ventoos-k8s/` | Teleport 接入 API | 能完成 Teleport 认证并列出可访问的 K8s 集群 |
| 2.5 集群状态与 Session 管理 Store | 多集群状态、Teleport 过期刷新、断线重连 | `apps/k8s/store/clusters.ts` | Zustand store | 支持 ≥3 集群并发，Teleport 过期前有提示条 |

### 2.3 左侧导航树（Sidebar）

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 3.1 集群树渲染 | 按来源分组的集群节点、展开态、状态指示条 | `apps/k8s/components/Sidebar/` | `ClusterTree.tsx` | 1:1 还原 PRD 第 5 章树结构，激活集群有系统主色竖条 |
| 3.2 资源导航树 | 每个集群下的 Workloads/Config/Network/Storage/Access/CRD 子树 | `apps/k8s/components/Sidebar/ResourceTree.tsx` | 资源导航树组件 | 分组可折叠，叶子节点点击打开资源列表 Tab |
| 3.3 Sidebar 交互 | 右键菜单、收藏、拖拽排序、与 Tab 双向同步 | `apps/k8s/components/Sidebar/` | 交互逻辑 | 中键新建 Tab、切换 Tab 时 Sidebar 自动定位 |

### 2.4 顶部标签系统（Tab System）

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 4.1 Tab Bar 组件 | 标签渲染、激活态、关闭按钮、拖拽排序 | `apps/k8s/components/TabBar/` | `K8sTabBar.tsx` | 布局与 Lens Tab Bar 一致，样式遵循 VentoOS 系统主题，支持拖拽 |
| 4.2 Tab 状态管理 | Tab 与 (cluster, namespace, resourceKind, resourceName) 的绑定 | `apps/k8s/store/tabs.ts` | Zustand store | 切换 Tab 不改变其他 Tab 上下文 |
| 4.3 Tab 右键菜单 | 关闭/关闭其他/关闭右侧/关闭全部 | `apps/k8s/components/TabBar/TabContextMenu.tsx` | 右键菜单组件 | 全部功能可用 |

### 2.5 资源列表页框架（Toolbar + Table）

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 5.1 Toolbar 组件 | 命名空间选择器、搜索框、操作按钮、批量操作条 | `apps/k8s/components/Toolbar/` | `ResourceToolbar.tsx` | 命名空间切换即时刷新，搜索实时过滤 |
| 5.2 通用表格组件 | 虚拟滚动表格、Checkbox、排序、列选择 | `apps/k8s/components/ResourceTable/` | `ResourceTable.tsx` | 行高 32px，表头固定，支持虚拟滚动 |
| 5.3 Rust Core：通用 K8s List API | 基于 GroupVersionResource 的通用列表接口、分页、标签过滤 | `native/crates/ventoos-k8s/` | `/api/k8s/:clusterId/resources/:gvk/list` | 能返回任意资源的列表 JSON |
| 5.4 列表页路由/渲染框架 | 根据资源类型渲染对应列与操作 | `apps/k8s/pages/ResourceList/` | `ResourceListPage.tsx` | 每种资源类型有独立的列定义配置 |

### 2.6 右侧详情抽屉（Right Detail Drawer）

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 6.1 Drawer 组件 | 右侧滑出抽屉、拖拽调整宽度、标题栏、Tabs | `apps/k8s/components/DetailDrawer/` | `DetailDrawer.tsx` | 宽度 45%，左侧边缘可拖拽 |
| 6.2 Summary / Properties Tab | 通用 K-V 属性展示、标签 badge、Annotations 展开 | `apps/k8s/components/DetailDrawer/tabs/SummaryTab.tsx` | 概览 Tab | 1:1 还原 Lens Properties 布局结构 |
| 6.3 Events / YAML Tab | 事件列表、只读 YAML（Monaco） | `apps/k8s/components/DetailDrawer/tabs/` | `EventsTab.tsx`, `YamlTab.tsx` | YAML 带语法高亮，Events 按时间倒序 |
| 6.4 资源特有 Tabs 扩展点 | Metrics、Pods、Logs、Shell、Conditions、History 等 | `apps/k8s/components/DetailDrawer/tabs/` | Tabs 注册机制 | 每种资源类型可配置显示哪些 Tabs |

### 2.7 底部操作面板（Bottom Panel）

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 7.1 Bottom Panel 组件 | 底部面板、高度拖拽、Tab 栏 | `apps/k8s/components/BottomPanel/` | `BottomPanel.tsx` | 默认高度 50%，顶部可拖拽 |
| 7.2 YAML 编辑器页 | Monaco Editor、Save/Cancel/Diff、版本冲突检测 | `apps/k8s/components/BottomPanel/YamlEditorPanel.tsx` | YAML 编辑页 | 编辑后 Save 能提交到 Rust API |
| 7.3 日志查看器页 | xterm.js / 虚拟滚动日志、容器切换、Follow、搜索 | `apps/k8s/components/BottomPanel/LogsPanel.tsx` | 日志页 | 实时日志流正常，容器切换无刷新闪烁 |
| 7.4 Shell 终端页 | xterm.js、容器选择、断线重连 | `apps/k8s/components/BottomPanel/ShellPanel.tsx` | Shell 页 | 能在 Pod 中执行 `/bin/sh` |

### 2.8 Workloads 资源全量实现

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 8.1 Pods | 列表、详情（Logs/Shell/Metrics/Volumes/Env）、操作 | `apps/k8s/resources/pods/` | Pod 完整页面 | 右键 Logs/Shell 可用，状态颜色正确 |
| 8.2 Deployments | 列表、详情（Pods/Metrics/Conditions/History）、操作 | `apps/k8s/resources/deployments/` | Deployment 完整页面 | Scale/Restart/Update Image 可用 |
| 8.3 StatefulSets / DaemonSets / ReplicaSets | 列表与详情 | `apps/k8s/resources/workloads/` | 三种资源页 | 关联 Pods 列表正确展示 |
| 8.4 Jobs / CronJobs | 列表、详情、Rerun / Trigger 操作 | `apps/k8s/resources/workloads/` | Job/CronJob 页 | CronJob 可手动触发新 Job |
| 8.5 Nodes | 列表、详情、Cordon/Uncordon/Drain/Shell | `apps/k8s/resources/nodes/` | Node 完整页面 | Drain 弹窗带参数选项 |
| 8.6 Rust Core：Workload API | Pod logs/exec、Deployment scale/restart、Node drain | `native/crates/ventoos-k8s/` | 后端 API | 前端操作能正确调用并返回结果 |

### 2.9 Config / Network / Storage / Access / CRD 资源实现

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 9.1 Config 类 | ConfigMaps、Secrets、ResourceQuotas、LimitRanges、HPA、PDB、PriorityClasses、RuntimeClasses、Leases、Webhooks | `apps/k8s/resources/config/` | Config 全部资源页 | Secret Data 默认脱敏，可解码查看 |
| 9.2 Network 类 | Services、EndpointSlices、Endpoints、Ingresses、IngressClasses、NetworkPolicies、Port Forwarding 管理页 | `apps/k8s/resources/network/` | Network 全部资源页 | Service Port Forward 可用 |
| 9.3 Storage 类 | PVCs、PVs、StorageClasses | `apps/k8s/resources/storage/` | Storage 全部资源页 | PVC 详情展示绑定 Pod |
| 9.4 Access Control | ServiceAccounts、ClusterRoles、Roles、Bindings | `apps/k8s/resources/access/` | RBAC 全部资源页 | Rules 表格清晰展示 API/Verbs |
| 9.5 CRD / Custom Resources | CRD 列表、CR 实例通用列表与详情 | `apps/k8s/resources/crds/` | CRD 页面 | 动态加载 CRD 并渲染实例列表 |

### 2.10 特殊交互（Logs / Shell / Port Forward / Metrics）

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 10.1 日志流后端 | WebSocket 日志转发、多容器切换、Follow 控制 | `native/crates/ventoos-k8s/` | `/ws/k8s/:clusterId/logs` | WebSocket 能持续推送 Pod 日志 |
| 10.2 Shell 后端 | WebSocket Exec 会话、容器选择、会话保活 | `native/crates/ventoos-k8s/` | `/ws/k8s/:clusterId/exec` | 终端命令执行与返回正常 |
| 10.3 Port Forward 后端 | 本地端口转发、转发列表管理 | `native/crates/ventoos-k8s/` | `/api/k8s/:clusterId/portforwards` | 能从本地访问远程 Service |
| 10.4 Metrics 后端 | Prometheus 查询封装 | `native/crates/ventoos-k8s/` | `/api/k8s/:clusterId/metrics` | 返回 Pod/Node CPU Memory 时序数据 |
| 10.5 资源关系图 | Service→Endpoints→Pod、Deployment→RS→Pod 的小型关系导航 | `apps/k8s/components/ResourceGraph/` | 关系图组件 | 点击节点可跳转对应资源详情 |

### 2.11 Helm / Events / Overview Dashboard

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 11.1 Overview Dashboard | 集群总览卡片：Cluster、Nodes、Workloads、Network、Storage、Events | `apps/k8s/pages/Overview/` | `ClusterOverview.tsx` | 卡片布局与 Lens Overview 布局结构一致 |
| 11.2 Events 全局页 | 全局事件列表、级别过滤 | `apps/k8s/pages/Events/` | `EventsPage.tsx` | 支持 Warning/Normal 过滤 |
| 11.3 Helm Releases | Release 列表、详情（Values/Manifests/History）、Upgrade/Rollback/Uninstall | `apps/k8s/pages/Helm/` | Helm 页面 | 能查看 Chart Values 与 Manifest |

### 2.12 全局搜索与 Command Palette

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 12.1 Command Palette | 全局命令面板、集群切换、资源搜索、快捷操作 | `apps/k8s/components/CommandPalette/` | `CommandPalette.tsx` | 快捷键 `Ctrl+Shift+P` 可唤起 |
| 12.2 跨集群资源搜索 | 按名称搜索资源，结果聚合展示 | `apps/k8s/components/GlobalSearch/` | 搜索组件 | 点击结果打开对应资源详情 |

### 2.13 性能优化与 Watch 机制

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 13.1 WebSocket Watch 框架 | 资源变更实时推送、Tab 非激活降级 | `native/crates/ventoos-k8s/` + 前端 | Watch 服务 | 列表能实时反映资源变更 |
| 13.2 虚拟滚动与分页 | 大列表渲染优化 | `apps/k8s/components/ResourceTable/` | 虚拟滚动实现 | 1000+ 资源列表滚动流畅 |
| 13.3 数据缓存策略 | 列表缓存、YAML 静默刷新 | `apps/k8s/store/` | 缓存逻辑 | 切换 Tab 无白屏，YAML 过时提示可用 |

### 2.14 验收与文档

| 子任务 | 目标 | 范围 | 交付物 | 验收标准 |
|--------|------|------|--------|----------|
| 14.1 前端构建与测试 | 构建通过、组件测试补齐 | `web/` | 测试文件 | `pnpm build` 无错，核心组件有测试 |
| 14.2 Rust 构建与测试 | clippy 通过、单元测试补齐 | `native/crates/ventoos-k8s/` | 测试文件 | `cargo clippy` 通过，`cargo test` 通过 |
| 14.3 验收报告撰写 | 对照 PRD 逐项检查并输出文档 | `docs/requirements/01-core/` | 验收报告 Markdown | 包含完成表与截图验证 |

---

## 3. 依赖关系图

```
1.1 → 1.2 → 1.4
            ↓
        2.1, 2.2, 2.3, 2.4, 2.5
            ↓
        3.1, 3.2, 3.3 ←→ 4.1, 4.2, 4.3
            ↓
        5.1, 5.2, 5.3, 5.4
            ↓
        6.x, 7.x
            ↓
    8.x, 9.x, 10.x, 11.x, 12.x, 13.x
            ↓
        14.x
```

---

## 4. 风险与注意事项

1. **Monaco Editor 集成**：VentoOS 已有 Monaco 依赖，K8s 应用复用现有封装，不要重复打包。
2. **xterm.js 集成**：复用终端应用（`11-terminal`）的 xterm 封装，保持终端行为一致。
3. **Teleport 认证**：`tsh login` 可能触发浏览器 SSO 跳转，Rust Core 需要处理 CLI 交互式输出或采用证书导出方案。
4. **多集群 Watch 连接数**：过多 WebSocket 可能导致浏览器连接限制，必须实现连接池与降级策略。
5. **资源关系图**：第一阶段可用简化版列表关系替代复杂 SVG 图，但保留扩展接口。
