# API Client 协议执行下沉 Rust Runtime - 验收报告

> 更新时间：2026-04-23

## 验收核查表

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|---|---|---|---|---|---|
| 1 | 所有 API 请求、WebSocket、MQTT 都应由 Rust 后端建立连接与维护 | 是否确认 HTTP、WebSocket、MQTT 的执行边界 | 通过 | 无 | HTTP 已由 Rust 代理；WebSocket/MQTT 本轮已迁移到 Rust session runtime |
| 2 | WebSocket 不能在前端建立连接 | WebSocket 工作台是否不再直接 `new WebSocket()` | 通过 | 无 | 组件测试已约束 connect 必须调用 native API |
| 3 | MQTT 不能在前端建立连接 | MQTT 工作台是否不再直接 `mqtt.connect()` | 通过 | 无 | 组件测试已约束 connect 必须调用 native API |
| 4 | MQTT 四种 scheme 要真实可执行 | `mqtt/mqtts/ws/wss` 是否都走 Rust transport | 通过 | 无 | native MQTT runtime 已基于 `rumqttc` 处理四种 transport |
| 5 | 页面结构与持久化不能退化 | MQTTX 风格双态布局、profile、草稿、日志恢复是否保留 | 通过 | 无 | 本轮仅替换 transport 执行层，未回退布局与 store 持久化模型 |
| 6 | 日志清理动作要前后端一致 | Clear 日志后是否不会被下一次轮询恢复 | 通过 | 无 | 新增 clear-logs session API，并在前端按钮接入 |
| 7 | 验证与构建 | 前端测试、前端构建、native 测试、native clippy、native build 是否已执行 | 通过 | 无 | 相关命令均执行通过；clippy/build 只有仓库既有 warning |

## 验收结论

- API Client 现已满足“HTTP / WebSocket / MQTT 协议执行由 Rust 后端建立、发起与维护”的要求。
- 前端协议工作台不再承担网络 transport 职责，只保留 profile 编辑、页面布局、草稿输入、状态展示与 session snapshot 同步。
- WebSocket 与 MQTT 的运行态现在统一由 Rust session runtime 驱动，满足你提出的“不能在前端做”约束。
- 本轮没有改动 HTTP UI 交互模型，因为它原本已经走 Rust `/proxy/rest` 代理链路。
