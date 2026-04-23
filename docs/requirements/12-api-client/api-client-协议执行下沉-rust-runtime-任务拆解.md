# API Client 协议执行下沉 Rust Runtime - 任务拆解

> 基于 [api-client-prd.md](./api-client-prd.md) 与 [api-client-协议工作台-mqttx-layout-prd.md](./api-client-协议工作台-mqttx-layout-prd.md) 拆解
> 更新时间：2026-04-23

## 原始需求与拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 所有 API 请求、WebSocket、MQTT 都必须由 Rust 后端建立连接、发起请求和维护，不能在前端做 | 1.1 复核 API Client 现有协议执行边界<br>1.2 确认 HTTP 已在 Rust 后端代理，定位 WebSocket/MQTT 前端直连代码 | 能明确区分已满足与未满足部分，避免重复重构 HTTP | 已完成 |
| 2 | WebSocket 连接不能在前端建立 | 2.1 在 native `ventoos-api-client` 增加 WebSocket session runtime<br>2.2 提供 connect / poll / disconnect / send / clear logs 路由<br>2.3 前端 WebSocket 工作台改为只调用后端 session API | 工作台不再直接 `new WebSocket()`，连接、收发、日志维护全部走 Rust | 已完成 |
| 3 | MQTT 连接不能在前端建立 | 3.1 在 native `ventoos-api-client` 增加 MQTT session runtime<br>3.2 提供 connect / poll / disconnect / publish / subscriptions / clear logs 路由<br>3.3 前端 MQTT 工作台改为只调用后端 session API | 工作台不再直接 `mqtt.connect()`，四种 scheme `mqtt/mqtts/ws/wss` 都由 Rust transport 执行 | 已完成 |
| 4 | 前端仍需保持 MQTTX 风格交互与持久化体验 | 4.1 保留现有 store + appState 持久化模型<br>4.2 用后端 session snapshot 回填连接状态与日志<br>4.3 修复 Clear 日志被轮询覆盖的回归 | 页面布局、连接 profile、消息草稿与日志恢复逻辑不回退 | 已完成 |
| 5 | 需要验证与文档闭环 | 5.1 补充协议工作台回归测试约束后端 API 调用<br>5.2 执行前端测试、前端构建、native 测试、native clippy、native build<br>5.3 输出完成情况与验收报告 | 文档落地且验证结果可追踪 | 已完成 |

## 功能定位 → 影响层级 → 接口设计

| 功能定位 | 影响层级 | 接口设计 |
|---|---|---|
| API Client 协议执行下沉 Rust Runtime | Application Layer + Runtime Core | 前端协议工作台只保留 UI / store；Rust 新增 session runtime 与 `/api/api-client/proxy/websocket/sessions/**`、`/api/api-client/proxy/mqtt/sessions/**` 接口 |

## 涉及文件

- `native/crates/ventoos-api-client/src/models.rs`
- `native/crates/ventoos-api-client/src/protocol_runtime.rs`
- `native/crates/ventoos-api-client/src/routes.rs`
- `native/crates/ventoos-api-client/Cargo.toml`
- `native/Cargo.toml`
- `web/src/apps/api-client/api.ts`
- `web/src/apps/api-client/types.ts`
- `web/src/apps/api-client/components/WebSocketWorkbench.tsx`
- `web/src/apps/api-client/components/MqttWorkbench.tsx`
- `web/src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx`
