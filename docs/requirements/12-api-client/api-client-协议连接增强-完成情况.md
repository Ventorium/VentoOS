# API Client 协议连接增强 - 完成情况

> 更新时间: 2026-04-22

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | MQTT 多连接配置列表 | 主 agent | 已完成 | 已通过 `protocol-connections.test.ts` 与 `store.test.ts` | 左侧支持新增、切换、删除多个 MQTT 连接预设，新增连接改为空白草稿 |
| 2 | MQTT 分离配置表单 | 主 agent | 已完成 | 已通过 `pnpm build` | Broker 表单拆分为地址、端口、Path、用户名、密码、Client ID、SSL/TLS、MQTT Version 等字段，connecting 时显示 loading 且可取消 |
| 3 | MQTT 多订阅与独立发布 Topic | 主 agent | 已完成 | 已通过 `protocol-connections.test.ts` 与 `pnpm build` | 支持多订阅列表、QoS、启停开关、独立发布 Topic 与 Payload 草稿 |
| 4 | WebSocket 多连接与分离地址配置 | 主 agent | 已完成 | 已通过 `protocol-connections.test.ts` 与 `pnpm build` | WebSocket 改为多连接预设，支持协议、地址、端口、Path、Subprotocols 分项配置，新增连接为空白草稿且 connecting 可取消 |
| 5 | 协议工作区可恢复状态延续 | 主 agent | 已完成 | 已通过 `store.test.ts` | 连接列表、选中连接、日志、订阅、发布草稿仍经 `window appState -> SQLite` 恢复 |
| 6 | 测试与仓库基线验证 | 主 agent | 已完成 | 已执行 | 前端 store 测试、组件测试、前端构建、`cargo clippy`、`cargo build` 均已执行 |

## 实现说明

- `web/src/apps/api-client/types.ts` 将 WebSocket / MQTT 从单对象状态升级为“活动连接 ID + 连接集合”模型。
- `web/src/apps/api-client/store.ts` 将新增连接的初始值改为空白草稿，同时保留协议连接 CRUD、MQTT 订阅 CRUD、兼容旧持久化快照的归一化逻辑，以及按连接写日志的动作。
- `web/src/apps/api-client/components/WebSocketWorkbench.tsx` 将头部动作改成 connect / cancel connect / disconnect 三态，并把连接预览和整体工作区视觉重新整理为更紧凑的编辑面板。
- `web/src/apps/api-client/components/MqttWorkbench.tsx` 将头部动作改成 connect / cancel connect / disconnect 三态，并把 broker 配置、订阅和发布区的页面层次重新梳理。
- `web/src/apps/api-client/components/ProtocolWorkbenchLayout.tsx` 重绘协议工作台共用的连接列表与区块卡片布局，修复连接项内部原生按钮白底导致的难看背景。
- `web/src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx` 补充组件级渲染测试，并顺带暴露并修复了连接卡片的嵌套 button 结构问题。
- `web/src/apps/api-client/utils/socket-connections.ts` 统一处理 WebSocket / MQTT broker URL 的拼装与 Path 规范化。
- `web/src/apps/api-client/__tests__/protocol-connections.test.ts` 与 `web/src/apps/api-client/__tests__/store.test.ts` 补充并更新多连接模型、持久化、MQTT 订阅的回归测试。

## 实际执行的验证命令

| 序号 | 命令 | 结果 | 备注 |
|---|---|---|---|
| 1 | `cd web && pnpm vitest run src/apps/api-client/__tests__/protocol-connections.test.ts` | 通过 | 验证多连接模型、旧快照迁移、MQTT 订阅与发布 Topic 独立性 |
| 2 | `cd web && pnpm vitest run src/apps/api-client/__tests__/protocol-connections.test.ts src/apps/api-client/__tests__/store.test.ts src/apps/api-client/components/__tests__/ProtocolWorkbenches.test.tsx` | 通过 | 覆盖持久化快照、兼容动作与协议工作台渲染结构 |
| 3 | `cd web && pnpm build` | 通过 | 验证空白新增连接、connecting 取消动作和新版连接侧栏在最终打包下正常工作 |
| 4 | `cd native && cargo clippy` | 通过 | 未发现 error；存在仓库既有 warning，未由本轮前端改动引入 |
| 5 | `cd native && cargo build` | 通过 | 退出码 0；存在仓库既有 warning，构建成功 |