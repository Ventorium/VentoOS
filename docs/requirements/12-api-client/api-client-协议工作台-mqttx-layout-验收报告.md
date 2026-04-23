# API Client 协议工作台 MQTTX 化重构 - 验收报告

> 更新时间：2026-04-22

## 验收核查表

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|---|---|---|---|---|---|
| 1 | MQTT 支持 `mqtt/mqtts/ws/wss` | 是否支持四种 scheme，且默认 `mqtt://` | 通过 | 无 | MQTT 新连接默认 `mqtt:1883`，并具备四种 scheme 配置能力 |
| 2 | MQTT Path 规则 | 是否仅在 `ws/wss` 显示 Path，且默认 `/mqtt` | 通过 | 无 | 编辑态仅在 `ws/wss` 渲染 Path，切换到 WebSocket transport 时自动补 `/mqtt` |
| 3 | 配置修改可保存 | 修改配置后切换连接、切换视图、刷新恢复是否正常 | 通过 | 无 | store snapshot 与组件回归测试已覆盖 |
| 4 | 连接列表不要默认删除按钮 | 连接列表默认是否隐藏删除按钮，修改/删除是否走右键菜单 | 通过 | 无 | 侧栏默认只显示连接项本身，Edit / Duplicate / Delete 改为右键菜单 |
| 5 | MQTT 页面参考 MQTTX 重构 | 是否拆成编辑态与消息态，且消息区优先 | 通过 | 无 | 编辑态承载配置；消息态承载订阅、消息流与底部发送区 |
| 6 | WebSocket 页面同样改造 | 是否拆成编辑态与消息态，且默认优先消息态 | 通过 | 无 | WebSocket 页面已同步切换为消息优先结构 |
| 7 | 测试与构建验证 | 前端测试、前端构建、native clippy/build 是否已执行 | 通过 | 无 | 相关命令全部执行通过；native 仅有既有 warning |
| 8 | Raw MQTT 运行时限制是否显式处理 | `mqtt/mqtts` 在当前浏览器 runtime 下是否避免 silent failure | 通过 | 后续若需要真实 raw MQTT 直连，需补 native transport | 当前实现会明确写入系统日志提示限制，不再伪装成已连接 |

## 验收结论

- 本轮协议工作台已经按 PRD 完成 MQTTX 化布局改造。
- MQTT 与 WebSocket 都已切换为“连接侧栏 + 编辑态 / 消息态”结构，消息发送与消息流成为默认主舞台。
- 连接列表默认不再暴露删除按钮，连接修改/复制/删除统一收敛到右键菜单。
- 协议配置修改继续经由 store + `window appState -> SQLite` 持久化恢复。
- 当前浏览器 runtime 下，MQTT `mqtt/mqtts` 仍不具备真实原生传输能力；实现已改为显式提示限制，不再 silent failure。若后续要真正打通 raw MQTT，需要补一层 native transport。
