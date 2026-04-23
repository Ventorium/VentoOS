# API Client 协议执行下沉 Rust Runtime - 完成情况

> 更新时间：2026-04-23

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 协议执行边界复核 | 主 agent | 已完成 | 已执行代码定位 | 确认 HTTP 已经走 Rust `/proxy/rest`，WebSocket 与 MQTT 仍在前端直连 |
| 2 | WebSocket session runtime 下沉 | 主 agent | 已完成 | `ProtocolWorkbenches.test.tsx`、`cargo test -p ventoos-api-client` 通过 | 新增 WebSocket connect / poll / disconnect / send / clear logs 后端接口 |
| 3 | MQTT session runtime 下沉 | 主 agent | 已完成 | `ProtocolWorkbenches.test.tsx`、`cargo test -p ventoos-api-client` 通过 | 新增 MQTT connect / poll / disconnect / publish / subscriptions / clear logs 后端接口，`mqtt/mqtts/ws/wss` 都由 Rust 执行 |
| 4 | 前端 workbench transport 替换 | 主 agent | 已完成 | `ProtocolWorkbenches.test.tsx`、`protocol-connections.test.ts`、`store.test.ts` 通过 | 删除前端 `new WebSocket()` 与 `mqtt.connect()` 直连，改成 session API + snapshot 轮询 |
| 5 | Clear 日志一致性修复 | 主 agent | 已完成 | 相关前端回归通过 | Clear 改为清理后端 session logs，避免被下一次轮询写回 |
| 6 | 文档与交付验证 | 主 agent | 已完成 | 已执行 | 更新 PRD 约束并补齐任务拆解 / 完成情况 / 验收报告 |

## 实现说明

- `native/crates/ventoos-api-client/src/protocol_runtime.rs` 新增协议 runtime：
  - WebSocket 使用 `tokio-tungstenite` 建立与维护 session。
  - MQTT 使用 `rumqttc` 建立与维护 session。
  - 两者统一维护 `ProtocolSessionSnapshot { session_id, connection_state, logs }`。
- `native/crates/ventoos-api-client/src/routes.rs` 新增两组协议接口：
  - `/api/api-client/proxy/websocket/sessions/**`
  - `/api/api-client/proxy/mqtt/sessions/**`
- `web/src/apps/api-client/components/WebSocketWorkbench.tsx` 改为：
  - connect 走 `connectWebSocketSession`
  - send 走 `sendWebSocketFrame`
  - disconnect 走 `disconnectWebSocketSession`
  - 日志和状态来自 `getWebSocketSession` 轮询快照
- `web/src/apps/api-client/components/MqttWorkbench.tsx` 改为：
  - connect 走 `connectMqttSession`
  - publish 走 `publishMqttMessage`
  - 订阅同步走 `syncMqttSubscriptions`
  - disconnect 走 `disconnectMqttSession`
  - 日志和状态来自 `getMqttSession` 轮询快照
- `web/src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx` 增加回归：
  - WebSocket connect 必须调用 native API，不再触发浏览器 `WebSocket`
  - MQTT connect 必须调用 native API，不再触发浏览器 `mqtt.connect`

## 实际执行的验证命令

| 序号 | 命令 | 结果 | 备注 |
|---|---|---|---|
| 1 | `cd web && pnpm vitest run src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx` | 通过 | 验证协议工作台 connect 行为已改为调用 native API |
| 2 | `cd web && pnpm vitest run src/apps/api-client/__tests__/protocol-connections.test.ts src/apps/api-client/__tests__/store.test.ts src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx` | 通过 | 验证持久化、协议连接模型、布局与新的后端执行链路 |
| 3 | `cd native && cargo test -p ventoos-api-client` | 通过 | 验证 API Client native crate 与 protocol runtime 单元测试 |
| 4 | `cd web && pnpm build` | 通过 | 前端打包成功 |
| 5 | `cd native && cargo clippy` | 通过 | 无 error；存在仓库既有 warning |
| 6 | `cd native && cargo build` | 通过 | 原生 workspace 编译成功；存在仓库既有 warning |
