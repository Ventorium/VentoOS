# API Client 协议连接增强 - 任务拆解

> 更新时间: 2026-04-22

## 原始需求与拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | MQTT 模块要支持左侧多个连接，方便后续反复测试 | 1.1 将 MQTT 从单连接状态改为连接配置列表<br>1.2 支持新增、切换、编辑多个 MQTT 连接配置<br>1.3 新增连接时不再注入默认 broker 配置，改为空白连接草稿 | 左侧可维护多个 MQTT 连接配置，新增连接默认为空白草稿，切换后右侧显示对应配置和运行状态 | 已完成 |
| 2 | MQTT 的协议、地址、端口、用户名、密码、Client ID、SSL/TLS 等要分开配置，还要有更多配置项 | 2.1 将 broker URL 拆为协议 / Host / Port / Path<br>2.2 增加 SSL/TLS、MQTT Version、Connect Timeout、Keep Alive、Auto Reconnect、Reconnect Period、Clean Start 等高级配置<br>2.3 connecting 态提供 loading 与取消动作 | MQTT 连接表单从单个 URL 输入升级为可分项编辑的连接配置表单，连接中可见 loading 且可取消 | 已完成 |
| 3 | MQTT 连接后要可以添加订阅，也要能发送任意 topic | 3.1 支持多订阅列表和新增订阅<br>3.2 将发布 topic 与 payload 分离，topic 可随意修改 | 连接后可新增多个订阅并接收消息，发送区 topic 与 payload 均可编辑 | 已完成 |
| 4 | WebSocket 模块也要支持多个连接，协议、地址、端口分开配置 | 4.1 将 WebSocket 从单连接状态改为连接配置列表<br>4.2 将 endpoint 拆为协议 / Host / Port / Path / subprotocols<br>4.3 新增连接改为空白草稿，connecting 态支持 loading 和取消连接 | 左侧可维护多个 WebSocket 连接配置，新增连接默认为空白草稿，连接中有可取消的 loading 状态 | 已完成 |
| 5 | 协议工作区状态必须继续可恢复 | 5.1 连接列表、选中连接、消息日志、订阅、发布草稿继续接入 appState 持久化<br>5.2 刷新后恢复所选连接与连接意图 | MQTT / WebSocket 的连接配置和工作现场刷新后可恢复，不回退到页面内唯一状态源 | 已完成 |
| 6 | 本轮必须有测试与构建验证 | 6.1 先补 store 回归测试覆盖多连接与持久化模型<br>6.2 执行相关前端测试与前端构建，再执行 native 基线命令 | 新增测试通过，`cd web && pnpm build`、`cd native && cargo clippy && cargo build` 已执行 | 已完成 |

## 功能定位 → 影响层级 → 接口设计

| 功能定位 | 影响层级 | 接口设计 |
|---|---|---|
| API Client MQTT / WebSocket 协议连接管理增强 | Application Layer | `store.ts` 统一维护“协议连接配置列表 + 当前选中连接 + 运行态”，组件层负责空白草稿编辑、connecting/cancel 交互与更紧凑的连接卡片展示 |

## 实施范围

- `web/src/apps/api-client/types.ts`
- `web/src/apps/api-client/store.ts`
- `web/src/apps/api-client/index.tsx`
- `web/src/apps/api-client/components/WebSocketWorkbench.tsx`
- `web/src/apps/api-client/components/MqttWorkbench.tsx`
- `web/src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx`
- `web/src/apps/api-client/components/ProtocolWorkbenchLayout.tsx`
- `web/src/apps/api-client/utils/socket-connections.ts`
- `web/src/apps/api-client/__tests__/protocol-connections.test.ts`
- `web/src/apps/api-client/__tests__/store.test.ts`

## 约束

- 浏览器端 MQTT 仍基于 MQTT over WebSocket，不伪装成原生 TCP 直连
- 可恢复状态继续走 `window appState -> SQLite`，不新增仅存在于组件 `useState` 的业务状态
- 不重做 API Client 整体信息架构，只增强 MQTT / WebSocket 连接管理与工作区交互