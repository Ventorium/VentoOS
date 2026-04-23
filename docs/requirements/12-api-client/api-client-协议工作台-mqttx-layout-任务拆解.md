# API Client 协议工作台 MQTTX 化重构 - 任务拆解

> 基于 [api-client-协议工作台-mqttx-layout-prd.md](./api-client-协议工作台-mqttx-layout-prd.md) 拆解
> 更新时间：2026-04-22

## 原始需求与拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | MQTT 要支持 `mqtt:// mqtts:// ws:// wss://`，默认 `mqtt://` | 1.1 扩展 MQTT scheme 类型与 URL 构造规则<br>1.2 增加 scheme 默认端口映射<br>1.3 仅在 `ws/wss` 下显示 Path，默认 `/mqtt` | MQTT 新连接默认 `mqtt:1883`，scheme 切换后端口/Path 行为符合 PRD；raw `mqtt/mqtts` 在浏览器 runtime 下会明确提示当前限制，不再静默失败 | 已完成 |
| 2 | 配置修改后要保存 | 2.1 补充 store 回归测试覆盖 MQTT / WebSocket 配置快照<br>2.2 修正任何会覆盖连接配置的页面状态逻辑<br>2.3 确认 appState snapshot / hydrate 与新字段兼容 | 修改配置后切换连接、切换视图、刷新后仍可恢复 | 已完成 |
| 3 | connections 不要默认显示删除，修改/删除通过右键操作 | 3.1 重做连接侧栏列表项结构<br>3.2 接入右键菜单并移除默认删除按钮<br>3.3 支持 Edit / Duplicate / Delete 连接动作 | 默认列表无删除按钮，右键可编辑/复制/删除 | 已完成 |
| 4 | MQTT 页面按 MQTTX 重新设计 | 4.1 增加 MQTT 编辑态<br>4.2 增加 MQTT 消息态<br>4.3 压缩顶部摘要信息，固定底部发送区<br>4.4 订阅区独立为左辅助列 | 编辑态与消息态分离，消息区与发送区成为主舞台 | 已完成 |
| 5 | WebSocket 页面也按同样思路改 | 5.1 增加 WebSocket 编辑态<br>5.2 增加 WebSocket 消息态<br>5.3 主舞台改为消息流 + 底部发送区 | WebSocket 不再长期展示大表单，默认进入消息态 | 已完成 |
| 6 | 本轮需要文档与验证闭环 | 6.1 更新 PRD/任务拆解/完成情况/验收报告<br>6.2 运行协议工作台相关测试与构建验证 | 文档齐全，相关测试与构建通过 | 已完成 |

## 实施范围

- `web/src/apps/api-client/types.ts`
- `web/src/apps/api-client/store.ts`
- `web/src/apps/api-client/utils/socket-connections.ts`
- `web/src/apps/api-client/components/ProtocolWorkbenchLayout.tsx`
- `web/src/apps/api-client/components/MqttWorkbench.tsx`
- `web/src/apps/api-client/components/WebSocketWorkbench.tsx`
- `web/src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx`
- `web/src/apps/api-client/__tests__/protocol-connections.test.ts`
- `docs/requirements/12-api-client/api-client-协议工作台-mqttx-layout-prd.md`
- `docs/requirements/12-api-client/api-client-协议工作台-mqttx-layout-完成情况.md`
- `docs/requirements/12-api-client/api-client-协议工作台-mqttx-layout-验收报告.md`

## 约束

- MQTT `mqtt/mqtts` 原生传输能力若无法在当前浏览器链路直接打通，必须显式暴露运行时限制，不能伪装为可用。
- 业务配置状态继续走 store + appState 持久化；编辑态是否展开可留在组件局部状态。
- 改造重点是信息架构与交互层级，不做与本轮无关的 API Client 全局重构。
