# API Client 协议工作台 MQTTX 化重构 - PRD

> 版本：v1.0
> 更新时间：2026-04-22
> 目标：参考 MQTTX 的 MQTT / WebSocket 工作台信息架构，重做 API Client 协议页面的布局与交互，让“连接配置”退到次要位置，“消息调试”成为主舞台，同时修复配置持久化体验问题。
> 视觉主题：严格遵循 VentoOS 系统 Design Token，不单独定义品牌色。

---

## 1. 产品定位与改造目标

### 1.1 定位

API Client 的 MQTT / WebSocket 页面不是“协议配置表单”，而是“长时会话调试台”。用户只会偶尔编辑连接，大部分时间都在：

- 连接已有 profile
- 查看消息流
- 新增订阅 / 发送消息
- 在多个 profile 间切换复用

### 1.2 当前问题

现状存在以下结构性问题：

1. 配置表单长期占用大面积空间，导致真正高频使用的消息区和发送区被压缩。
2. 连接列表把删除动作直接暴露在默认状态下，噪音高，也容易误触。
3. MQTT 配置模型与真实协议不一致，缺少 `mqtt://` 和 `mqtts://`，Path 规则也不正确。
4. 连接 profile 的编辑与使用处于同一个页面层次，没有形成“编辑态 / 使用态”分离。
5. 持久化虽然有 store / appState 链路，但页面没有呈现出“配置已经存入 profile”的稳定感。

### 1.3 本轮核心目标

1. MQTT 工作台支持 `mqtt://`、`mqtts://`、`ws://`、`wss://` 四种协议，默认 `mqtt://`。
2. MQTT 的 Path 仅在 `ws://` / `wss://` 出现，且首次切换到该类协议时默认 `/mqtt`。
3. WebSocket / MQTT 都采用 MQTTX 风格的双态页面：编辑态、消息态。
4. 连接列表去掉默认删除按钮，修改/删除统一进入右键菜单。
5. 默认进入消息态，保证消息流、订阅区、发送区始终优先于配置表单。
6. 连接配置修改后继续走 store + window appState 持久化，不回退到局部组件状态。

---

## 2. 设计规范

### 2.1 主题说明

全部使用现有系统变量：

- `var(--vos-bg-primary)`
- `var(--vos-bg-secondary)`
- `var(--vos-bg-surface)`
- `var(--vos-text-primary)`
- `var(--vos-text-secondary)`
- `var(--vos-text-tertiary)`
- `var(--vos-border-subtle)`
- `var(--vos-accent-primary)`

不单独引入 MQTTX 的绿色主题，只借鉴其布局结构、密度和交互层次。

### 2.2 尺寸与密度

- 连接侧栏宽度：260px
- 页面顶部工具条高度：52px
- 消息态头部信息区高度：104px 到 156px，根据协议内容自适应
- 编辑态表单主容器最大宽度：960px
- 消息态主内容区：
  - 左辅助列：280px 到 320px
  - 右消息主舞台：剩余全部宽度
- 底部发送区固定可见，不能被上方表单挤压到需要滚动后才能操作

---

## 3. 总体布局架构

### 3.1 统一布局骨架

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Connection Sidebar │                Protocol Workspace               │
├────────────────────┼─────────────────────────────────────────────────┤
│ 连接列表            │ 顶部工具条                                       │
│ 新建连接            ├─────────────────────────────────────────────────┤
│ 右键菜单            │ 编辑态：表单主导                                │
│                    │ 或                                              │
│                    │ 消息态：消息主舞台 + 底部发送区                  │
└────────────────────┴─────────────────────────────────────────────────┘
```

### 3.2 双态规则

每个协议工作台都存在两个明确页面状态：

1. 编辑态：用于创建新连接、修改连接参数。
2. 消息态：用于连接、查看消息、发送消息、维护订阅。

默认规则：

- 新建连接后直接进入编辑态。
- 选中已有连接默认进入消息态。
- 只有明确触发“编辑连接”时才进入编辑态。
- 编辑完成返回消息态后，配置区完全退出主舞台。

---

## 4. 连接侧栏

### 4.1 布局

```text
┌────────────────────────────┐
│ Connections          [+]   │
├────────────────────────────┤
│ • emqx-test@broker.emqx.io │
│ • ws feed @ socket.local   │
│ • staging broker           │
│ • ...                      │
└────────────────────────────┘
```

### 4.2 列表项规范

每条连接项只展示：

- 状态点（idle / connecting / connected）
- 主标题：优先 `name`，无则回退到 host 或 Untitled
- 次标题：压缩显示 host / protocol / port，不显示冗长说明段落

禁止内容：

- 默认可见的删除按钮
- 连接卡片里堆叠过多字段
- 大面积装饰性渐变或多段说明文案

### 4.3 交互

- 单击：切换当前连接，并进入消息态。
- 右键：弹出连接菜单。

连接右键菜单项：

- Edit connection
- Duplicate connection
- Delete connection

新增按钮行为：

- 点击新增后创建新连接 profile。
- MQTT 新连接默认协议为 `mqtt`，默认端口为 `1883`，其他字段为空。
- WebSocket 新连接延续当前空白 profile 逻辑，但进入编辑态。

---

## 5. MQTT 工作台

### 5.1 MQTT 编辑态

参考截图 1，编辑态只做连接 profile 编辑，不混入消息日志。

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Back                          Edit                         Connect ▼ │
├──────────────────────────────────────────────────────────────────────┤
│ General                                                      [Card] │
│ Name                                                           input │
│ Host      [mqtt://▼] [broker.emqx.io..............................] │
│ Port                                                           1883 │
│ Client ID                                               [regen icon] │
│ Path   仅在 ws/wss 时显示，默认 /mqtt                               │
│ Username                                                        ... │
│ Password                                                        ... │
│ SSL/TLS 仅在适用场景与 scheme 联动显示                              │
├──────────────────────────────────────────────────────────────────────┤
│ Advanced                                                     [Fold] │
│ MQTT Version / Connect Timeout / Keep Alive / Auto Reconnect ...   │
└──────────────────────────────────────────────────────────────────────┘
```

编辑态规则：

- 顶部左侧提供 Back，返回消息态。
- 顶部右侧保留 Connect 主动作，方便“边改边连”。
- General 默认展开，Advanced 默认折叠。
- 只有 `ws` / `wss` 显示 Path 字段。
- 当协议从 `mqtt/mqtts` 切到 `ws/wss` 且当前 Path 为空时，自动填入 `/mqtt`。

### 5.2 MQTT 消息态

参考截图 2，消息态以消息查看与发送为中心。

```text
┌──────────────────────────────────────────────────────────────────────┐
│ emqx-test                                            Connect / More │
├──────────────────────────────────────────────────────────────────────┤
│ Name         Client ID       Username                               │
│ Password     Keep Alive      Clean Start                            │
├───────────────────────┬──────────────────────────────────────────────┤
│ New Subscription      │ Message Stream                              │
│ 订阅列表              │ Received / Published / All                  │
│                       │ 消息气泡 / 日志流                           │
├───────────────────────┴──────────────────────────────────────────────┤
│ Payload Format / QoS / Retain / Topic                              │
│ Payload Editor                                                     │
│                                                          Publish   │
└──────────────────────────────────────────────────────────────────────┘
```

消息态规则：

- 顶部仅展示最常用的少量连接摘要字段，配置不展开成长表单。
- 左列固定为订阅管理区。
- 右列为消息主舞台，顶部过滤标签，底部固定发送区。
- 发送区始终可见，不能因为上方内容变长而被压出首屏。
- More 菜单可放“进入编辑态”，但连接修改/删除的主要入口仍是左侧右键菜单。

### 5.3 MQTT 协议规则

支持的 scheme：

- `mqtt`
- `mqtts`
- `ws`
- `wss`

默认值规则：

- 新连接默认 scheme：`mqtt`
- 默认端口：
  - `mqtt` → `1883`
  - `mqtts` → `8883`
  - `ws` → `8083`
  - `wss` → `8084`
- Path 仅在 `ws` / `wss` 出现
- Path 默认值：`/mqtt`

运行时约束：

- MQTT 与 WebSocket 的实际连接、断开、重连、收发消息、订阅维护全部由 Rust 后端 session runtime 执行，前端只负责 profile 编辑、消息展示与草稿输入。
- MQTT 四种 scheme `mqtt / mqtts / ws / wss` 都要走 Rust 后端 transport，不允许再在前端保留浏览器直连 fallback。
- 协议工作台消息日志需要以前后端统一 session snapshot 为准，前端局部清理动作必须同步到后端 session 状态。

## 8. 协议执行架构补充

### 8.1 责任边界

- HTTP：继续走 `/api/api-client/proxy/rest`，由 Rust 后端代理发送。
- WebSocket：走 `/api/api-client/proxy/websocket/sessions/**`，由 Rust 后端建立与维护会话。
- MQTT：走 `/api/api-client/proxy/mqtt/sessions/**`，由 Rust 后端建立与维护会话。

### 8.2 前端职责

- 维护连接 profile、草稿、过滤器、选中连接、页面布局。
- 通过 session API 请求连接、断开、发送、发布、订阅同步、日志清空。
- 轮询 session snapshot，同步连接状态与消息日志，不在浏览器直接 `new WebSocket()` 或 `mqtt.connect()`。

### 8.3 后端职责

- 为每个协议连接 profile 建立独立 session。
- 维护连接状态 `idle / connecting / connected`。
- 维护日志快照，向前端返回统一 session snapshot。
- 负责 MQTT 订阅同步、消息发布、自动重连、协议 transport 细节。


---

## 6. WebSocket 工作台

### 6.1 WebSocket 编辑态

WebSocket 同样采用编辑态，但字段更少：

- Name
- Scheme (`ws` / `wss`)
- Host
- Port
- Path
- Subprotocols
- Connect Timeout
- Auto Reconnect
- Reconnect Delay

布局复用 MQTT 编辑态顶部结构：

- Back
- 标题 Edit
- 右侧 Connect / Cancel connect / Disconnect

### 6.2 WebSocket 消息态

WebSocket 消息态取消大表单，只保留：

- 顶部连接摘要（name / endpoint / protocols / state）
- 主消息流
- 底部固定发送区

不需要 MQTT 的订阅左列，因此消息主舞台可以直接占满宽度。

```text
┌──────────────────────────────────────────────────────────────────────┐
│ notifications-gateway                                 Connect / More │
├──────────────────────────────────────────────────────────────────────┤
│ Endpoint / Subprotocols / Timeout / Reconnect 摘要                  │
├──────────────────────────────────────────────────────────────────────┤
│ Frame Stream                                                        │
│ System / Received / Sent / All                                      │
│ 日志主舞台                                                          │
├──────────────────────────────────────────────────────────────────────┤
│ Payload Editor                                             Send     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. 持久化与状态规则

### 7.1 必须持久化的业务状态

- MQTT / WebSocket 连接列表
- 当前选中连接 ID
- 每个连接的配置字段
- 每个连接的消息草稿
- MQTT 的订阅列表
- 每个连接的日志
- 当前协议视图

### 7.2 可以停留在页面内的临时 UI 状态

- 当前是否处于编辑态
- 当前日志筛选标签
- 临时展开/折叠状态
- 右键菜单是否打开

### 7.3 保存体验约束

- 字段修改即写入 store。
- store snapshot 继续通过 `window appState -> SQLite` 同步。
- 切换连接、切换协议视图、关闭窗口后重新打开，已编辑的连接 profile 不能丢。

---

## 8. 空态、加载态、错误态

### 8.1 空态

- 没有连接时，右侧只显示“创建连接”引导。
- 没有订阅时，左列显示空态按钮“New Subscription”。
- 没有消息时，消息主舞台显示轻量空态，不使用大插图。

### 8.2 加载态

- `connecting` 时，主按钮进入 loading 态并可点击取消。
- 连接列表项状态点同步变为 connecting。

### 8.3 错误态

- 连接失败写入系统日志。
- 不使用 modal 打断；错误在消息流中可追溯。

---

## 9. 验收标准

| 序号 | 验收项 | 标准 |
|---|---|---|
| 1 | MQTT 协议支持 | MQTT 配置支持 `mqtt/mqtts/ws/wss` 四种 scheme，默认 `mqtt` |
| 2 | MQTT Path 规则 | 仅 `ws/wss` 显示 Path，默认 `/mqtt` |
| 3 | 右键连接操作 | 连接列表默认无删除按钮，编辑/删除至少可通过右键触发 |
| 4 | 双态布局 | MQTT / WebSocket 均存在编辑态与消息态，默认优先消息态 |
| 5 | 消息主舞台优先 | 发送区在消息态首屏固定可见，不再被大配置表单挤压 |
| 6 | 配置持久化 | 修改连接配置后，切换连接/视图/刷新后仍可恢复 |
| 7 | 回归验证 | 相关组件测试、store 测试、前端构建通过 |
