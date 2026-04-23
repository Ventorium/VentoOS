# API Client 协议工作台 MQTTX 化重构 - 完成情况

> 更新时间：2026-04-22

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | MQTT scheme 与默认值重构 | 主 agent | 已完成 | `protocol-connections.test.ts` 通过 | MQTT 新连接默认 `mqtt:1883`，支持 `mqtt/mqtts/ws/wss`，`ws/wss` 才显示 Path |
| 2 | 连接配置持久化回归 | 主 agent | 已完成 | `protocol-connections.test.ts`、`store.test.ts` 通过 | 新增 MQTT transport snapshot 用例，并修正协议页面 cleanup 对连接状态的覆盖行为 |
| 3 | 连接侧栏与右键菜单 | 主 agent | 已完成 | `ProtocolWorkbenches.test.tsx` 通过 | 侧栏改成简洁列表，移除默认删除按钮，连接操作改为右键菜单 |
| 4 | MQTT 编辑态 / 消息态双态布局 | 主 agent | 已完成 | `ProtocolWorkbenches.test.tsx`、`pnpm build` 通过 | 编辑态参考 MQTTX 表单页，消息态把订阅区、消息流、发送区作为主舞台 |
| 5 | WebSocket 编辑态 / 消息态双态布局 | 主 agent | 已完成 | `ProtocolWorkbenches.test.tsx`、`pnpm build` 通过 | 消息态不再长期展示大表单，发送区固定在底部 |
| 6 | 文档与仓库级验证 | 主 agent | 已完成 | 已执行 | PRD/拆解/完成/验收文档已落地，前端与 native 基线均已执行 |

## 实现说明

- `web/src/apps/api-client/types.ts` 将 MQTT scheme 扩展为 `mqtt / mqtts / ws / wss`。
- `web/src/apps/api-client/store.ts` 调整 MQTT 默认值、端口映射与 endpoint 归一化规则，同时保留协议配置进入 appState snapshot 的链路。
- `web/src/apps/api-client/utils/socket-connections.ts` 改为仅在 MQTT `ws/wss` 模式下拼接 Path。
- `web/src/apps/api-client/components/ProtocolWorkbenchLayout.tsx` 重做连接侧栏，改为简洁列表 + 右键菜单入口，不再内联显示删除操作。
- `web/src/apps/api-client/components/MqttWorkbench.tsx` 重写为 MQTTX 风格双态页面：
  - 编辑态承载连接 profile 配置。
  - 消息态承载订阅、消息流、底部发送区。
  - `mqtt/mqtts` 在当前浏览器 runtime 下会明确写入系统日志提示原生传输限制，不再静默失败。
- `web/src/apps/api-client/components/WebSocketWorkbench.tsx` 同步改成编辑态 / 消息态，消息流和发送区成为主舞台。
- `web/src/apps/api-client/__tests__/protocol-connections.test.ts` 与 `web/src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx` 补充了 MQTT 默认 transport、持久化快照、右键菜单与双态布局回归测试。

## 实际执行的验证命令

| 序号 | 命令 | 结果 | 备注 |
|---|---|---|---|
| 1 | `cd web && pnpm vitest run src/apps/api-client/__tests__/protocol-connections.test.ts src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx` | 通过 | 验证 MQTT 默认 transport、右键菜单、双态布局与 connecting 取消动作 |
| 2 | `cd web && pnpm vitest run src/apps/api-client/__tests__/protocol-connections.test.ts src/apps/api-client/__tests__/store.test.ts src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx` | 通过 | 覆盖 appState snapshot、store 持久化与协议工作台渲染结构 |
| 3 | `cd web && pnpm build` | 通过 | 前端完整打包成功 |
| 4 | `cd native && cargo clippy` | 通过 | 无 error；存在仓库既有 warning |
| 5 | `cd native && cargo build` | 通过 | 退出码 0；存在仓库既有 warning |
