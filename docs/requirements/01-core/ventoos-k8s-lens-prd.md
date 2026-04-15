# VentoOS K8s 应用 — Lens UI 1:1 还原产品需求文档 (PRD)

> 版本：v1.0  
> 目标：以 OpenLens 为 UI 基准，1:1 还原页面布局、交互路径、信息架构与组件结构，同时原生支持 Teleport 后的 K8s 集群与多集群并行操作。视觉样式严格遵循 VentoOS 系统统一主题，不单独定义 K8s 专属配色。

---

## 1. 产品定位与核心目标

### 1.1 定位
VentoOS 内置的 Kubernetes 专业运维应用。它不是简化版控制台，而是面向 SRE / 平台工程师的完整集群管理器，参考 OpenLens 的桌面级交互深度进行 1:1 还原。

### 1.2 核心目标
- **结构还原度**：布局结构、组件层级、交互路径、信息架构与 Lens 1:1 还原；视觉样式（颜色、字体、图标）遵循 VentoOS 系统主题，不复制 Lens 配色。
- **功能覆盖度**：覆盖 Lens 全部核心资源管理与交互能力（列表、详情、YAML、日志、Shell、Metrics、关系导航）。
- **连接能力**：原生 kubeconfig 导入 + Teleport 代理集群双通道接入。
- **多集群并发**：左侧树同时挂载 N 个集群，每个集群有独立的命名空间上下文，支持多标签页并行浏览不同集群资源。

---

## 2. 设计规范（遵循 VentoOS 系统主题）

### 2.1 色彩体系
K8s 应用不定义独立配色，全部使用 VentoOS 系统 Design Token：
- 背景色：`var(--app-bg)`、`var(--surface-bg)`、`var(--panel-bg)`
- 文字色：`var(--text-primary)`、`var(--text-secondary)`、`var(--text-muted)`
- 边框与分割线：`var(--border-color)`
- 状态色：直接使用系统状态色（成功、警告、错误、进行中、信息）。
- 激活/高亮：当前集群指示条、链接、选中态使用系统主色 `var(--primary-color)`。

**禁止在 K8s 应用内写死任何十六进制色值。** 所有颜色必须映射到系统 CSS Variables。

### 2.2 字体与排版
- 字体族：使用 VentoOS 系统字体栈（由 `theme.ts` 或全局 CSS Variables 定义）。
- 基准字号：`13px`
- 树节点：`12px`，全大写 Section Title：`11px`，字重 600
- 表格内容：`13px`，表头 `12px` 次要色
- 代码/YAML：使用系统等宽字体变量 `var(--font-mono)`，`13px`

### 2.3 间距与尺寸
- 左侧 Sidebar 宽度：`220px`（可折叠至只显示图标 `48px`）
- 顶部 Tab Bar 高度：`35px`
- 工具栏（Toolbar）高度：`38px`
- 表格行高：`32px`
- 详情抽屉默认宽度：视口 `45%`，最小 `480px`，最大 `70%`，可拖拽调整
- 底部 Panel 默认高度：`50%`，最小 `200px`，可拖拽调整
- 树节点内边距：左 `12px`，上下 `4px`

---

## 3. 全局布局架构

### 3.1 布局层级（Z-Index 与结构）
整个 K8s 应用窗口内部分为 5 层：

```
┌─────────────────────────────────────────────────────────────┐
│  [Top Tab Bar]  标签页导航（集群名 + 资源类型）               │  h=35px
├──────────┬──────────────────────────────────────────────────┤
│          │  [Toolbar] 命名空间/搜索/操作按钮                 │  h=38px
│ Left     ├──────────────────────────────────────────────────┤
│ Sidebar  │                                                  │
│ (集群树)  │  [Main Content]                                  │
│          │   资源列表 / Dashboard / 空白态                   │
│ w=220px  │                                                  │
│          │                                                  │
│          │                                                  │
├──────────┴──────────────────────────────────────────────────┤
│  [Bottom Panel] YAML 编辑器 / 日志 / 终端（可折叠）           │  h=0~50%
└─────────────────────────────────────────────────────────────┘
                        ↑ 叠加 ↑
        [Right Detail Drawer] 资源详情抽屉（滑出）
```

### 3.2 状态同步规则
- **集群上下文**：每个 Tab 独立绑定 `(clusterId, namespace, resourceKind)`。
- **命名空间切换**：当前 Tab 的 Toolbar 中切换 `namespace`，仅影响该 Tab 的列表与后续打开的资源详情。
- **Sidebar 高亮**：Sidebar 中当前激活的集群/节点与当前激活 Tab 双向同步；切换 Tab 时 Sidebar 自动展开并定位到对应集群节点。

---

## 4. 集群管理（Cluster Catalog & Hotbar）

### 4.1 Cluster Catalog（集群目录页）
作为 K8s 应用的入口页面，当没有打开任何集群 Tab 时展示。

**布局：**
- 顶部标题：`Kubernetes Clusters`
- 下方卡片网格：每个集群一张卡片。
- 卡片内容：
  - 左上角：集群来源图标（本地文件、Teleport、手动输入）
  - 中央：集群名称（大号字体）
  - 下方：版本、节点数、状态圆点
  - 右下角：星标（收藏）

**交互：**
- 单击卡片：在新 Tab 中打开该集群的 `Overview`。
- 右键卡片：`Open Settings`、`Disconnect`、`Remove`、`Copy kubeconfig path`。
- 收藏集群：在左侧 Sidebar 的 `Hotbar` 区域置顶显示。

### 4.2 Hotbar（左侧快速启动栏）
- 位于 Sidebar 最顶部（Home 按钮下方）。
- 显示 2~6 个收藏的集群小图标（正方形，带状态色点）。
- 点击图标直接打开对应集群 Overview Tab。

### 4.3 添加集群流程
**添加按钮**位于 Catalog 右上角 `+ Add Cluster`。

**弹窗（Modal）步骤：**
1. **选择来源**：
   - `Kubeconfig File`（拖拽或选择文件）
   - `From Teleport`（见第 13 章）
   - `Manual`（输入 API Server URL + Token/Cert）
2. **预览上下文**：如果是 kubeconfig 文件，列出文件中所有 `contexts`，用户可勾选要导入的集群。
3. **导入确认**：显示集群名称、Server 地址、来源，点击 `Add Cluster(s)`。

---

## 5. 左侧导航树（Sidebar Navigation Tree）

### 5.1 树结构 1:1 还原
Sidebar 采用树形导航，分组逻辑与 Lens 完全一致。

**顶部区：**
- `Home` 按钮：返回 Cluster Catalog。
- `Hotbar`：收藏的集群快捷入口（图标网格）。

**主体区：KUBERNETES CLUSTERS**
- 标题：大写灰色小字 `KUBERNETES CLUSTERS`
- 按来源分组（可折叠）：
  - `Local Kubeconfigs`
  - `Teleport`
  - `Custom`

每个分组下挂载具体集群节点。集群节点的展开态即该集群的资源导航树。

### 5.2 集群节点样式
- 左侧 `4px` 宽竖条：
  - 当前激活集群为系统主色 `var(--primary-color)`
  - 非激活集群透明
- 图标：小圆点，颜色表示集群连接状态（绿/黄/红/灰）
- 文字：集群名称，`13px`
- 右侧：在线节点数 / 总节点数（小字灰）

### 5.3 资源导航树节点（1:1 还原 Lens）
展开集群节点后，显示以下固定树结构。带 `[+]` 表示可展开分组，其余为叶子节点。

```
weconomy-aliyun [active]
├── Overview
├── Applications
├── Nodes
├── [+] Workloads
│   ├── Overview
│   ├── Pods
│   ├── Deployments
│   ├── Daemon Sets
│   ├── Stateful Sets
│   ├── Replica Sets
│   ├── Jobs
│   └── Cron Jobs
├── [+] Config
│   ├── Config Maps
│   ├── Secrets
│   ├── Resource Quotas
│   ├── Limit Ranges
│   ├── Horizontal Pod Autoscalers
│   ├── Pod Disruption Budgets
│   ├── Priority Classes
│   ├── Runtime Classes
│   ├── Leases
│   ├── Mutating Webhook Configurations
│   └── Validating Webhook Configurations
├── [+] Network
│   ├── Services
│   ├── Endpoint Slices
│   ├── Endpoints
│   ├── Ingresses
│   ├── Ingress Classes
│   ├── Network Policies
│   └── Port Forwarding
├── [+] Storage
│   ├── Persistent Volume Claims
│   ├── Persistent Volumes
│   └── Storage Classes
├── Namespaces
├── Events
├── Helm
│   └── Releases
├── [+] Access Control
│   ├── Service Accounts
│   ├── Cluster Roles
│   ├── Roles
│   ├── Cluster Role Bindings
│   └── Role Bindings
└── [+] Custom Resources
    ├── [按 Group 分组]
    │   └── [具体的 CRD 名称]
    └── [具体的 CRD 名称]
```

**树节点交互：**
- 单击叶子节点：在当前 Tab 打开对应资源列表页；若当前 Tab 是 `Overview` 或空，则复用；否则新建 Tab。
- 中键单击：强制新建 Tab。
- 分组节点：点击切换展开/折叠，不打开页面。
- 右键菜单：
  - `Disconnect`（断开该集群连接）
  - `Settings`（集群设置：命名空间偏好、Prometheus 地址、Teleport 会话刷新）
  - `Copy Cluster Name`
  - `Remove from Hotbar` / `Add to Hotbar`

---

## 6. 顶部标签系统（Tab System）

### 6.1 Tab Bar 样式
- 高度 `35px`，背景 `bg-sidebar`，底部边框 `border-default`。
- 标签项：圆角顶部 `4px`，内边距 `8px 16px`。
- 激活态：背景使用系统激活背景色，底部 `2px` 系统主色线。
- 非激活态：背景透明，hover 时 `bg-hover`。

### 6.2 Tab 内容格式
- 格式：`<ResourceIcon> <ResourceType> - <ClusterName>`
- 示例：`🔒 Secrets - weconomy-aliyun`、`📦 Deployments - weconomy-aliyun`
- `Overview` 页：`🏠 Overview - weconomy-aliyun`
- 右侧：关闭按钮 `×`（hover 时显示）。

### 6.3 Tab 行为
- **新建 Tab**：从 Sidebar 中键点击、点击 `+` 按钮、或右键 `Open in new tab`。
- **复用 Tab**：从 Sidebar 左键点击已打开的同类型资源时，若目标集群+资源类型相同，则跳转到已有 Tab；不同则新建。
- **拖拽排序**：标签支持横向拖拽排序。
- **批量关闭**：右键 Tab 出现 `Close`、`Close Others`、`Close to the Right`、`Close All`。

---

## 7. 工具栏（Toolbar）

每个资源列表页顶部固定展示 Toolbar，高度 `38px`。

**从左到右的元素：**
1. **命名空间选择器（Namespace Selector）**
   - 下拉框，默认显示当前命名空间（如 `dev`）。
   - 下拉内容：按字母排序的命名空间列表 + `All namespaces`。
   - 选中项带系统主色高亮背景。
   - 选择后即时刷新列表。

2. **资源计数（Items Count）**
   - 文字：`19 items`、`16 items`。
   - 当有过滤时显示：`3 of 19 items`。

3. **搜索框（Search）**
   - 占位符：`Search <ResourceType>...`（如 `Search Secrets...`）
   - 宽度 `240px`，圆角 `4px`。
   - 支持实时模糊搜索（按 Name 过滤）。

4. **标签过滤（Label Selector）——可选**
   - `Aa ⬇` 按钮，点击后弹出 Label 键值对选择浮层。

5. **右侧操作区**
   - 刷新按钮（圆形箭头）
   - 设置/列选择按钮（齿轮）
   - 下载 CSV/JSON 按钮（向下箭头）
   - `+` 新建资源按钮（右上角系统主色按钮，hover 展开 `Create resource` / `Apply YAML`）

---

## 8. 资源列表页（Resource List）

### 8.1 表格结构通用规范
- 表头背景 `bg-sidebar`，文字 `text-muted`，字号 `12px`，左对齐。
- 表格行背景 `bg-panel`，hover `bg-hover`。
- 行高 `32px`，单元格内边距 `8px 12px`。
- 垂直分割线：`1px solid border-default`。

**通用列：**
| 列名 | 说明 |
|------|------|
| Checkbox | 首列，多选框，表头有全选 |
| Name | 资源名称，系统主色链接，左侧带资源类型小图标 |
| Namespace | 命名空间，系统主色链接 |
| Labels | 标签键值对，以彩色小 badge 展示，过多时截断并显示 `+n` |
| Age | 相对时间（如 `42d`, `5d1h`, `155d`）|
| Actions | 末尾固定列，更多操作 `⋯` |

**不同资源类型的特有列：**
- **Secrets**：`Type`（如 `kubernetes.io/tls`、`Opaque`）、`Keys`（data 键列表）
- **Deployments**：`Pods`（如 `1/1`、`0/0`）、`Replicas`、`Status`
- **ConfigMaps**：`Keys`
- **Services**：`Type`（ClusterIP/NodePort）、`Cluster IP`、`Ports`
- **Nodes**：`Role`、`Version`、`Ready`、`CPU`、`Memory`、`Disk`、`Pod Capacity`
- **Pods**：`Status`、`Restarts`、`Node`、`CPU`、`Memory`
- **PVC**：`Status`、`Storage Class`、`Capacity`、`Access Mode`
- **Ingresses**：`Hosts`、`Paths`
- **Events**：`Type`、`Reason`、`Source`、`Message`、`Count`、`Last Seen`

### 8.2 行交互
- **单击 Name**：打开该资源的 **右侧详情抽屉**（Right Drawer）。
- **双击行**：打开该资源的 **底部编辑面板**（Bottom Panel）并进入 YAML 编辑。
- **右键行**：上下文菜单
  - `Edit` → 打开底部 YAML 编辑
  - `Delete` → 弹出确认对话框
  - `Copy Name` / `Copy YAML`
  - 资源特有菜单：
    - Deployment：`Scale...`, `Restart`, `Update Image...`
    - Pod：`Logs`, `Shell`, `Delete`, `Copy Pod IP`
    - Node：`Cordon`, `Uncordon`, `Drain...`, `Shell`
    - Service：`Port Forward...`

### 8.3 批量操作栏
当勾选多行时，Toolbar 下方滑出批量操作条（黄色背景条）：
- 左侧：`<n> items selected`
- 右侧：`Delete selected`（红色按钮）、`Copy names`。

---

## 9. 右侧详情抽屉（Right Detail Drawer）

### 9.1 抽屉触发方式
- 从列表单击 Name、从关系图点击节点、从 AI 结果点击资源链接。
- 从屏幕右侧滑出，覆盖主内容区的一部分，不关闭列表页。
- 宽度默认 `45%`，左侧边缘有 `4px` 宽的可拖拽条，鼠标变为 `ew-resize`。

### 9.2 抽屉标题栏
- 高度 `45px`，背景 `bg-panel`，底部边框 `border-default`。
- 左侧：`资源类型图标 + 资源类型: 资源名`（如 `Deployment: elephanta-app`）
- 右侧操作按钮组（图标按钮，间距 `8px`）：
  - `复制名称`（文档图标）
  - `刷新`（圆形箭头）
  - `编辑`（铅笔）→ 打开底部 YAML 编辑
  - `删除`（垃圾桶，红色 hover）
  - `更多`（⋯）→ 资源特有操作菜单
  - `关闭`（X）

### 9.3 Tabs 结构
抽屉内容区采用 Tabs 导航，不同资源类型显示的 Tabs 不同。

**通用 Tabs（所有资源）：**
- `Overview` / `Summary`：关键元数据、标签、注解、状态、关联资源入口。
- `YAML`：只读 YAML 展示（可点击编辑按钮切换为底部编辑面板）。
- `Events`：与该资源相关的 K8s Events 列表。

**Workload 特有 Tabs：**
- `Pods`：关联 Pod 列表（Deployment/RS/StatefulSet/DaemonSet/Job）。
- `Metrics`：CPU/Memory 使用折线图（Prometheus）。
- `Replicas`：副本历史或状态。
- `Conditions`：如 Available、Progressing。
- `History`（Deployment/StatefulSet/DaemonSet）：滚动更新历史、Revision 对比。

**Pod 特有 Tabs：**
- `Logs`：日志查看器（容器选择下拉框、实时流开关、搜索框）。
- `Shell`：终端（容器选择下拉框、`/bin/sh` 执行）。
- `Metrics`：CPU/Memory 折线图。
- `Volumes`：挂载卷详情。
- `Env`：环境变量表格（自动解码 SecretKeyRef）。

**Service 特有 Tabs：**
- `Endpoints`：Endpoints 子集列表。
- `Port Forwarding`：当前活动端口转发列表 + 新建。

**Node 特有 Tabs：**
- `Pods`：运行在该节点上的 Pod 列表。
- `Metrics`：节点级 CPU/Memory/Disk/Network 图表。
- `Conditions`：Node Conditions。
- `Images`：节点上缓存的镜像列表。
- `Taints` / `Labels`

**Secret 特有 Tabs：**
- `Data`：键值对表格，值默认 `••••••••`，点击眼睛图标 Base64 解码显示。

### 9.4 详情页内容布局规范
以 **Deployment 详情**为例（参考截图第二张）：

#### 9.4.1 Metrics Tab
- 顶部时间范围选择器：`1h` | `6h` | `24h` | `7d` | `Custom`。
- 图表区域：显示 `CPU Usage` 和 `Memory Usage` 两张折线图。
- 图表风格：使用系统主题背景色与网格线，多色曲线（每个 Pod 一条线，带图例）。
- 无数据时：显示 `Displaying metrics from Prometheus` + loading spinner 或 `No metrics available` 提示。

#### 9.4.2 Properties / Overview Tab
- 采用 Key-Value 垂直列表，两列布局（左侧 Key 灰色，右侧 Value 白色）。
- 示例字段：
  - `Created`：`42d 6h 48m ago (2026年3月03日 GMT+8 10:41:30)`
  - `Name`：`elephanta-app`（可复制）
  - `Namespace`：`dev`（系统主色链接，点击切换命名空间）
  - `Labels`：`app=elephanta-app`（badge 样式）
  - `Annotations`：`3 Annotations`（可点击展开）
  - `Replicas`：`1 desired, 1 updated, 1 total, 1 available, 0 unavailable`
  - `Selector`：`app=elephanta-app`
  - `Strategy Type`：`RollingUpdate`
  - `Status`：`Running`（绿色 badge）
  - `Conditions`：
    - `Available` 绿色 badge
    - `Progressing` 系统信息色 badge
- `Events` 区块：列表展示最近事件，`No events found` 时显示空态。

---

## 10. 底部操作面板（Bottom Panel）

### 10.1 面板触发方式
- 从详情抽屉点击 `Edit`。
- 从列表行右键 `Edit` 或双击行。
- 从列表点击 `Logs` / `Shell`。
- 从顶部工具栏点击 `Apply YAML`。

### 10.2 面板结构
- 顶部抓手条（drag handle），高度 `24px`，中央有 `⋮⋮` 图标，可上下拖拽调整高度。
- Tab 栏：与浏览器标签类似，展示当前打开的面板页。
  - 示例：`Secret: elephanta-secrets`、`Secret: elephanta-gateway-secrets`
  - Tab 可关闭。
  - `+` 按钮可新建空白 YAML 编辑页。

### 10.3 YAML 编辑器页
- 顶部信息条：
  - `Editing kubernetes Secret <name> in namespace <ns>`（系统主色链接高亮 name 和 ns）
- 编辑器：Monaco Editor。
  - 主题：使用 VentoOS 系统 Monaco 主题。
  - 功能：语法高亮、错误提示、行号、代码折叠、Minimap（右侧小地图）。
- 底部操作栏：
  - 左侧：`Save`（系统主色按钮）、`Cancel`、`Diff`（与当前集群中资源做 Diff）。
  - 右侧：显示当前光标行列、`UTF-8`、语言模式 `YAML`。

### 10.4 日志查看器页
- 顶部控制栏：
  - 容器选择器（多容器 Pod）
  - `Follow` 开关（实时滚动）
  - `Show Timestamps` 开关
  - `Search` 输入框
  - `Download` / `Copy` 按钮
  - `Clear` 按钮
- 日志区：
  - xterm.js 或自定义虚拟滚动列表。
  - 错误关键字高亮（红色）。
  - 自动换行开关。

### 10.5 Shell / Exec 页
- 顶部控制栏：容器选择器、Shell 类型（`/bin/sh`、`/bin/bash`、`/bin/zsh`）。
- 终端区：xterm.js，全黑色背景，字体等宽 `13px`。
- 会话断开时，终端内显示红色提示 `Connection closed. Press Enter to reconnect.`

---

## 11. 各资源类型页面详细规范

以下按 Sidebar 树结构逐条定义每种资源的列表页与详情页能力。

### 11.1 Overview（集群总览）
**布局：** Dashboard 网格卡片。
- 第一行：
  - `Cluster` 卡片：版本、API Server、节点数、命名空间数、Pod 数。
  - `Nodes` 卡片：环形图展示 Ready / NotReady / Unknown 比例。
- 第二行：
  - `Workloads` 卡片：Deployments / StatefulSets / DaemonSets / Jobs / Pods 总数与异常数。
  - `Network` 卡片：Services / Ingresses 数量。
  - `Storage` 卡片：PVC / PV 数量与绑定状态。
- 第三行：
  - `Events` 卡片：最近 10 条 Warning / Error 事件。
  - `Metrics` 卡片：集群级 CPU / Memory 使用折线图（1h）。

### 11.2 Nodes
**列表列：** Checkbox, Name, Role, Version, Ready, CPU, Memory, Disk, Pod Capacity, Age, Actions。
**详情 Tabs：** Summary, Pods, Metrics, Conditions, Images, Taints, YAML, Events。
**操作：** Cordon, Uncordon, Drain, Edit, Delete, Shell。

### 11.3 Workloads

#### 11.3.1 Pods
**列表列：** Checkbox, Name, Namespace, Node, Status, Restarts, CPU, Memory, Age, Actions。
**状态颜色：** Running=绿, Pending=黄, Failed=红, Succeeded=蓝灰, Unknown=灰。
**详情 Tabs：** Summary, Logs, Shell, Metrics, Volumes, Env, YAML, Events。

#### 11.3.2 Deployments
**列表列：** Checkbox, Name, Namespace, Pods, Replicas, Status, Age, Actions。
**详情 Tabs：** Summary, Pods, Metrics, Conditions, History, YAML, Events。
**操作：** Scale, Restart, Update Image, Rollout/Rollback, Edit, Delete。

#### 11.3.3 Daemon Sets
**列表列：** Checkbox, Name, Namespace, Pods, Desired, Ready, Age, Actions。
**详情 Tabs：** Summary, Pods, Metrics, Conditions, YAML, Events。

#### 11.3.4 Stateful Sets
**列表列：** Checkbox, Name, Namespace, Pods, Replicas, Service, Age, Actions。
**详情 Tabs：** Summary, Pods, Metrics, Volumes, Conditions, YAML, Events。

#### 11.3.5 Replica Sets
**列表列：** Checkbox, Name, Namespace, Pods, Replicas, Age, Actions。

#### 11.3.6 Jobs
**列表列：** Checkbox, Name, Namespace, Completions, Duration, Age, Actions。
**详情 Tabs：** Summary, Pods, Conditions, YAML, Events。
**操作：** Rerun（基于现有 Job 创建新 Job）。

#### 11.3.7 Cron Jobs
**列表列：** Checkbox, Name, Namespace, Schedule, Suspend, Last Schedule, Age, Actions。
**详情 Tabs：** Summary, Jobs（关联 Job 列表）, YAML, Events。
**操作：** Trigger（立即创建新 Job）。

### 11.4 Config

#### 11.4.1 ConfigMaps
**列表列：** Checkbox, Name, Namespace, Keys, Age, Actions。
**详情 Tabs：** Summary, Data（键值表格）, YAML, Events。

#### 11.4.2 Secrets
**列表列：** Checkbox, Name, Namespace, Type, Keys, Age, Actions。
**详情 Tabs：** Summary, Data（脱敏/解码）, YAML, Events。

#### 11.4.3 Resource Quotas
**列表列：** Checkbox, Name, Namespace, Age, Actions。
**详情 Tabs：** Summary, Used / Hard 表格, YAML, Events。

#### 11.4.4 Limit Ranges
**列表列：** Checkbox, Name, Namespace, Age, Actions。

#### 11.4.5 Horizontal Pod Autoscalers
**列表列：** Checkbox, Name, Namespace, Reference, Targets, Min Pods, Max Pods, Replicas, Age, Actions。

#### 11.4.6 Pod Disruption Budgets
**列表列：** Checkbox, Name, Namespace, Min Available, Max Unavailable, Allowed Disruptions, Age, Actions。

#### 11.4.7 Priority Classes
**列表列：** Checkbox, Name, Value, Global Default, Age, Actions。

#### 11.4.8 Runtime Classes
**列表列：** Checkbox, Name, Handler, Age, Actions。

#### 11.4.9 Leases
**列表列：** Checkbox, Name, Namespace, Holder, Age, Actions。

#### 11.4.10 Webhook Configurations
**列表列：** Checkbox, Name, Webhooks, Age, Actions。

### 11.5 Network

#### 11.5.1 Services
**列表列：** Checkbox, Name, Namespace, Type, Cluster IP, Ports, External IP, Selector, Age, Actions。
**详情 Tabs：** Summary, Endpoints, Port Forwarding, Pods（通过 Selector 匹配）, YAML, Events。

#### 11.5.2 Endpoint Slices
**列表列：** Checkbox, Name, Namespace, Address Type, Ports, Endpoints, Age, Actions。

#### 11.5.3 Endpoints
**列表列：** Checkbox, Name, Namespace, Endpoints, Age, Actions。

#### 11.5.4 Ingresses
**列表列：** Checkbox, Name, Namespace, Hosts, Paths, Age, Actions。
**详情 Tabs：** Summary, Rules 表格, TLS 表格, YAML, Events。

#### 11.5.5 Ingress Classes
**列表列：** Checkbox, Name, Controller, Age, Actions。

#### 11.5.6 Network Policies
**列表列：** Checkbox, Name, Namespace, Pod Selector, Age, Actions。

#### 11.5.7 Port Forwarding
这是一个特殊的“管理页”，不是 K8s 资源列表。
**列表列：** Checkbox, Name（本地端口）, Namespace, Pod/Service, Local Port, Remote Port, Protocol, Status, Actions。
**操作：** Stop, Edit（修改端口）, Open in Browser。

### 11.6 Storage

#### 11.6.1 Persistent Volume Claims
**列表列：** Checkbox, Name, Namespace, Status, Storage Class, Capacity, Access Mode, Volume, Age, Actions。
**详情 Tabs：** Summary, Pod（使用此 PVC 的 Pod）, YAML, Events。

#### 11.6.2 Persistent Volumes
**列表列：** Checkbox, Name, Capacity, Access Mode, Reclaim Policy, Status, Claim, Storage Class, Age, Actions。

#### 11.6.3 Storage Classes
**列表列：** Checkbox, Name, Provisioner, Reclaim Policy, Volume Binding Mode, Age, Actions。

### 11.7 Namespaces
**列表列：** Checkbox, Name, Status, Age, Actions。
**详情 Tabs：** Summary, Resource Quotas, Limits, YAML, Events。
**操作：** Set as default（切换全局默认命名空间）。

### 11.8 Events
**全局 Events 列表页。**
**列表列：** Checkbox, Type, Reason, Object, Message, Namespace, Source, Count, Age, Actions。
**过滤：** 按 Warning / Normal / 涉及对象类型过滤。

### 11.9 Helm Releases
**列表列：** Checkbox, Name, Namespace, Chart, Revision, Status, Updated, Actions。
**详情 Tabs：** Summary, Values（默认 values 与当前 values 合并视图）, Manifests（渲染后的 YAML 列表）, History（版本历史）, Notes。
**操作：** Upgrade, Rollback, Uninstall。

### 11.10 Access Control

#### 11.10.1 Service Accounts
**列表列：** Checkbox, Name, Namespace, Secrets, Age, Actions。
**详情 Tabs：** Summary, Secrets（关联 Secret 列表）, YAML, Events。

#### 11.10.2 ClusterRoles / Roles
**列表列：** Checkbox, Name, Age, Actions。
**详情 Tabs：** Summary, Rules（API Groups / Resources / Verbs 表格）, YAML, Events。

#### 11.10.3 ClusterRoleBindings / RoleBindings
**列表列：** Checkbox, Name, Role, Subjects, Age, Actions。
**详情 Tabs：** Summary, RoleRef, Subjects 表格, YAML, Events。

### 11.11 Custom Resources
**CRD 列表页：**
**列表列：** Checkbox, Name, Group, Version, Scope, Age, Actions。
**详情 Tabs：** Summary, Versions, YAML, Events。

**CR 实例列表页（点击某个 CRD 后）：**
- 布局与普通资源列表完全一致。
- 列：Checkbox, Name, Namespace（若 namespaced）, Age, Actions。
- 详情 Tabs：Summary, YAML, Events（通用）。
- 对于某些常见 CRD（如 ArgoCD Application），可追加特定 Tab（如 `Resource Tree`）。

---

## 12. 特殊交互详细规范

### 12.1 日志流（Logs）
**入口：** Pod 列表右键 `Logs`、Pod 详情 Tab `Logs`、Deployment 详情中点击 Pod 的 `Logs`。
**底部面板布局：**
- 顶部控制栏：
  - 容器下拉框（所有容器 + init 容器）
  - `Previous` 开关（查看上次退出的容器日志）
  - `Follow` 开关（自动滚动到底部）
  - `Show timestamps` 开关
  - `Wrap lines` 开关
  - 搜索框（高亮匹配行）
  - `Download` / `Copy` / `Clear`
- 内容区：
  - 虚拟滚动列表，每行前面带时间戳（可选）。
  - 错误/异常关键字红色高亮。
  - 如果日志量大，显示 `Loading...` 或流式追加。

### 12.2 Shell / Exec
**入口：** Pod 列表右键 `Shell`、Pod 详情 Tab `Shell`、Node 列表右键 `Shell`。
**底部面板布局：**
- 顶部控制栏：
  - 容器下拉框
  - Shell 命令输入框（默认 `/bin/sh`，可改为 `/bin/bash`）
  - `Reconnect` 按钮
- 内容区：
  - xterm.js 终端，背景使用系统终端背景色 `var(--terminal-bg)`。
  - 字体 `JetBrains Mono 13px`。
  - 光标闪烁。
  - 断开连接时终端内显示红色文字提示，按 Enter 重连。

### 12.3 Port Forward（端口转发）
**入口：** Service/Pod 列表右键 `Port Forward`、Service 详情 Tab `Port Forwarding`。
**弹窗：**
- `Local Port` 输入框（自动填充远程端口）
- `Remote Port` 输入框（从 Service spec.ports 中选择）
- `Protocol` 显示 TCP/UDP
- `Open in Browser` 复选框
- 按钮：`Start Port Forward`

**管理页：** Network > Port Forwarding
- 展示所有活动转发。
- 每行操作：`Open`（浏览器打开 localhost:port）、`Stop`、`Copy URL`。

### 12.4 Metrics（Prometheus 集成）
**数据来源：** 集群设置中配置的 Prometheus 地址（默认 `http://prometheus:9090`）。
**图表规格：**
- 使用统一的时序图组件（如 ECharts / uPlot）。
- 使用系统主题色，网格线取 `var(--border-color)`。
- 时间范围：1h / 6h / 24h / 7d / Custom。
- 折线带 Tooltip（精确值 + 时间）。
- Pod 级别 Metrics 用不同颜色区分不同 Pod，带可点击图例（点击隐藏/显示）。

### 12.5 资源关系导航（Resource Map）
在 Deployment/Service/PVC 等详情页中，Summary Tab 下方显示一张小型关系图：
- 节点：当前资源 + 上下游资源（图标化）。
- 边：OwnerReference、Selector、VolumeClaim 等关系。
- 点击图中节点：打开该资源的右侧详情抽屉。
- 样式：节点为圆角卡片，背景与边框使用系统主题变量，带状态色边框。

---

## 13. Teleport 后 K8s 集群支持

### 13.1 接入流程（UI 层）
在 Cluster Catalog 点击 `+ Add Cluster` → 选择 `From Teleport`。

**Step 1：Teleport 连接配置**
- Proxy 地址输入框（如 `teleport.example.com:443`）
- 用户名
- 认证方式：`Password + OTP`、`Hardware Key`、`SSO`
- 可选：集群过滤器（正则或列表）

**Step 2：认证与发现**
- Rust Core 调用 `tsh login` 或 gRPC/REST API 完成认证。
- UI 显示认证进度（Spinner + 日志）。
- 认证成功后，展示 `Available Kubernetes Clusters` 列表。

**Step 3：选择集群并导入**
- 用户勾选要导入的 K8s Cluster。
- 系统为每个集群生成内存态 kubeconfig（不持久化 Token）。
- 导入完成后，这些集群出现在 Sidebar 的 `Teleport` 分组下。

### 13.2 Teleport 会话管理
- **会话有效期**：与 Teleport 证书有效期同步（默认 12h）。
- **过期提醒**：会话过期前 30min，Toolbar 出现黄色警告条：`Teleport session for <cluster> expires in <time>. [Refresh]`。
- **刷新流程**：点击 Refresh 重新触发 `tsh login`（若配置了 SSO，可能跳转浏览器）。
- **断开连接**：集群节点右键 `Disconnect` 会同时清理本地 kubeconfig 缓存。

### 13.3 视觉区分
- Teleport 来源的集群在 Catalog 卡片和 Sidebar 树节点上显示 Teleport 小图标（🔒 或 Teleport logo）。
- Tooltip 悬停显示 `Via Teleport: <proxy>`。

---

## 14. 全局搜索与快捷操作

### 14.1 Command Palette（全局命令面板）
快捷键：`Ctrl+Shift+P`（Mac `Cmd+Shift+P`）。
- 顶部模糊搜索框。
- 分类结果：
  - `Clusters`：快速切换集群。
  - `Resources`：在当前集群搜索资源名（跨所有类型）。
  - `Actions`：如 `Create Deployment`、`Apply YAML`、`Port Forward`。
  - `Settings`：如 `Open Cluster Settings`、`Toggle Theme`。

### 14.2 跨集群资源搜索
在顶部搜索框输入资源名，结果展示：
- 集群名
- 资源类型图标 + 名称 + 命名空间
- 点击后在新 Tab 打开对应资源详情。

---

## 15. 性能与数据要求

### 15.1 列表性能
- 资源列表使用虚拟滚动（Virtual List），单次渲染不超过 50 行 DOM。
- 默认分页：前端不主动分页，后端通过 `limit/continue` 对大列表（>500）自动分页。
- 表头固定，内容区滚动。

### 15.2 Watch 与实时更新
- 每个打开的资源列表页默认建立一条 WebSocket Watch 连接。
- 当 Tab 非激活超过 30s，自动降级为轮询（5s）。
- 多集群场景下，总并发 Watch 连接数上限为 20，超出时优先断开非激活集群的 Watch。

### 15.3 数据缓存
- 最近访问的 5 个资源列表在内存中缓存，切换 Tab 时优先展示缓存并标记 `Updating...`。
- YAML 编辑器打开时，优先使用缓存的 Object，后台静默拉取最新版本并提示 `Resource updated. Reload?`。

---

## 16. 验收标准

### 16.1 视觉还原
- [ ] 布局结构（Sidebar + Tab Bar + Toolbar + List + Right Drawer + Bottom Panel）与 Lens 1:1 对应。
- [ ] 视觉样式（颜色、字体、图标、边框）严格遵循 VentoOS 系统主题，不引入 K8s 专属硬编码色值。
- [ ] 左侧导航树节点结构、图标、分组名称与 Lens 1:1 对应。
- [ ] 表格列宽、行高、hover 态与 Lens 布局一致，样式由系统主题变量驱动。

### 16.2 功能覆盖
- [ ] 支持多集群同时连接，Sidebar 可挂载 ≥3 个集群。
- [ ] 支持 Teleport 代理集群的完整接入流程（登录 → 发现 → 导入 → 会话刷新）。
- [ ] 覆盖本 PRD 第 11 章列出的全部资源类型的列表与详情页。
- [ ] Deployment/Pod/Node/Service 的核心操作（Scale/Restart/Logs/Shell/Port Forward/Cordon/Drain）可用。
- [ ] YAML 编辑器支持查看、编辑、Diff、保存。
- [ ] 日志流支持实时 Follow、容器切换、搜索、下载。
- [ ] Shell 支持容器选择、断线重连。

### 16.3 交互质量
- [ ] Tab 系统支持新建、关闭、拖拽排序、右键批量关闭。
- [ ] 右侧详情抽屉可拖拽调整宽度，底部面板可拖拽调整高度。
- [ ] 资源关系导航（Service→Endpoints→Pod、Deployment→ReplicaSet→Pod）可点击跳转。
- [ ] 命名空间切换即时生效，不影响其他 Tab。

### 16.4 工程标准
- [ ] `cd web && pnpm build` 无错误。
- [ ] 新增前端组件有对应的 Vitest / React Testing Library 测试。
- [ ] Rust Core 的 K8s API 封装有单元测试覆盖。
- [ ] `cd native && cargo clippy` 通过。
