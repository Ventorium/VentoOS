# VentoOS AI Agent 需求拆解

> 来源：gpt.md（主）、gemini.md（补充）、ventoos-ai.md（核心定位）

## R1: Provider 系统（LLM 提供者抽象）

| 子需求 | 描述 |
|--------|------|
| R1.1 | Provider 类型定义（OpenAI / Anthropic / Ollama / Custom） |
| R1.2 | Provider 配置（ID、名称、API Key、Base URL、模型、启用状态） |
| R1.3 | Provider trait（chat / chat_stream 两种调用方式） |
| R1.4 | OpenAI 兼容 Provider 实现（覆盖 OpenAI、Azure、Ollama 等 OpenAI 兼容 API） |
| R1.5 | Provider 管理（CRUD） |
| R1.6 | API Key 安全：返回前端时脱敏，不以明文暴露 |

## R2: Tool 系统（工具抽象）

| 子需求 | 描述 |
|--------|------|
| R2.1 | ToolDefinition 类型（名称、描述、参数 JSON Schema、风险等级） |
| R2.2 | ToolExecutor trait（可注入的工具执行接口） |
| R2.3 | Tool 注册表（注册、查询、列表） |
| R2.4 | 内置工具定义：read、write、edit、bash（4 个原子工具） |
| R2.5 | Tool 执行框架（参数校验 → Guard 检查 → 执行 → 返回结果） |

## R3: Guard 系统（安全围栏 / Harness）

| 子需求 | 描述 |
|--------|------|
| R3.1 | Guard trait 定义 |
| R3.2 | PathGuard：文件路径黑名单（/etc/shadow 等敏感路径禁止访问） |
| R3.3 | CommandGuard：bash 命令危险模式检测（rm -rf /、mkfs 等） |
| R3.4 | Guard 链执行（多个 Guard 串联） |

## R4: Agent 循环（ReAct 核心执行引擎）

| 子需求 | 描述 |
|--------|------|
| R4.1 | ReAct 循环：消息 → LLM → Tool 调用 → 结果 → LLM → … → 最终回复 |
| R4.2 | 流式输出支持（SSE） |
| R4.3 | Tool 调用与结果处理（调用 guard、执行 tool、生成结果消息） |
| R4.4 | 最大迭代限制（防止无限循环） |
| R4.5 | 错误恢复（LLM 返回异常、Tool 执行失败等场景） |

## R5: 会话管理

| 子需求 | 描述 |
|--------|------|
| R5.1 | 增强会话模型（System Prompt、Provider ID、Model 绑定） |
| R5.2 | 消息模型增强（支持 tool_calls、tool_call_id、name 字段） |
| R5.3 | 会话 CRUD（创建/查询/删除/列表） |
| R5.4 | 会话标题自动生成 |

## R6: System Prompt

| 子需求 | 描述 |
|--------|------|
| R6.1 | 默认 System Prompt（VentoOS SRE Assistant 定位） |
| R6.2 | 可自定义 System Prompt（按会话覆盖或全局配置） |
| R6.3 | 上下文注入（当前环境信息注入 prompt） |

## R7: 后端 API 路由

| 子需求 | 描述 |
|--------|------|
| R7.1 | Provider 管理 API（CRUD） |
| R7.2 | SSE 流式聊天 API（POST /api/agent/chat/stream） |
| R7.3 | Tool 列表 API（GET /api/agent/tools） |
| R7.4 | 增强会话管理 API |
| R7.5 | 全局配置管理 API |

## R8: 前端类型更新

| 子需求 | 描述 |
|--------|------|
| R8.1 | Provider 相关类型 |
| R8.2 | Tool 相关类型 |
| R8.3 | 流式事件类型（StreamEvent） |
| R8.4 | 增强消息类型（支持 tool_calls） |

## R9: 前端 API 客户端更新

| 子需求 | 描述 |
|--------|------|
| R9.1 | SSE 流式请求支持（fetch + ReadableStream） |
| R9.2 | Provider CRUD API |
| R9.3 | Tool 列表 API |

## R10: 前端 AI Assistant UI 增强

| 子需求 | 描述 |
|--------|------|
| R10.1 | 流式消息展示（逐字显示） |
| R10.2 | Tool 调用可视化（显示工具名、参数、结果） |
| R10.3 | Provider / 模型设置面板 |
| R10.4 | System Prompt 编辑 |

## R11: 单元测试

| 子需求 | 描述 |
|--------|------|
| R11.1 | SSE 解析器测试 |
| R11.2 | Tool 系统测试（定义、注册、查询） |
| R11.3 | Guard 测试（路径、命令） |
| R11.4 | Session 管理测试 |
| R11.5 | Agent 循环测试（Mock Provider） |
| R11.6 | Manager 集成测试 |

## R12: Channel 底层抽象（外部聊天渠道）

| 子需求 | 描述 |
|--------|------|
| R12.1 | 定义 `ChannelKind`、`ChannelConfig`、`ChannelIdentity`、`ChannelEvent`、`ChannelConversationBinding` 统一模型 |
| R12.2 | 定义 `ChannelAdapter` trait，统一 inbound verify / normalize / outbound send 接口 |
| R12.3 | Channel 事件统一映射到 Agent Session，不允许各渠道绕过 Runtime 直接执行业务逻辑 |
| R12.4 | 支持渠道线程与 VentoOS 会话双向绑定，可恢复历史会话 |
| R12.5 | Channel 对话、工具调用、错误、agent 路由结果必须可审计、可回放 |

## R13: 首批 Channel 接入

| 子需求 | 描述 |
|--------|------|
| R13.1 | 接入 QQ 官方机器人 channel，第一阶段不把个人 QQ 非官方协议纳入验收 |
| R13.2 | 接入钉钉 channel，支持机器人消息进入 VentoOS |
| R13.3 | 接入飞书 channel，支持事件订阅 / 回调消息 |
| R13.4 | 接入企业微信 channel，支持回调消息与签名/加解密 |
| R13.5 | 接入 Telegram channel，支持 webhook，必要时支持 long polling |
| R13.6 | 所有首批 channel 都能触发对话，并默认由通用 agent 执行 |

## R14: Agent 路由与会话投影

| 子需求 | 描述 |
|--------|------|
| R14.1 | Channel 对话默认绑定通用 agent |
| R14.2 | 支持基于意图、命令、上下文的自动 agent 选择 |
| R14.3 | 自动路由必须记录原因、目标 agent、切换时间，供 Web 端展示 |
| R14.4 | 渠道会话与 Web 会话互相可见，Web 端可查看外部消息、回复、工具调用和执行状态 |
| R14.5 | 风险操作在 channel 中同样要经过统一确认策略，不得绕过 Guard / Harness |

## R15: Channel 后端 API

| 子需求 | 描述 |
|--------|------|
| R15.1 | Channel 配置 CRUD API（启停、凭据、回调参数、路由策略） |
| R15.2 | Channel 连接测试 / 回调校验 API |
| R15.3 | Channel 对话列表与消息明细 API |
| R15.4 | Channel 事件回放 / 审计 API |
| R15.5 | Channel 运行状态 API（最近错误、最后心跳、最后成功发送时间） |

## R16: 前端 Channel 管理与可视化

| 子需求 | 描述 |
|--------|------|
| R16.1 | AI Assistant 页面提供 Channel 配置入口，不新增普通路由 |
| R16.2 | 可配置每个 channel 的凭据、回调地址、启用状态、默认 agent、自动路由策略 |
| R16.3 | 可查看每个 channel 的连接测试结果与最近错误 |
| R16.4 | 可查看 channel 会话列表、消息详情、agent 路由信息、工具调用轨迹 |
| R16.5 | 可从 Web 端手动接管 / 继续某个 channel 会话 |

## R17: Channel 测试与验收

| 子需求 | 描述 |
|--------|------|
| R17.1 | 各 channel adapter 至少具备签名校验/事件解析/消息发送单元测试 |
| R17.2 | Channel 会话绑定与 agent 路由具备集成测试 |
| R17.3 | Web 端 Channel 配置、会话查看、路由展示具备关键测试 |
| R17.4 | `cd web && pnpm build`、`cd native && cargo clippy`、`cd native && cargo build` 作为基础验收命令 |
| R17.5 | 验收以“页面可配置 + 所有 channel 可触发对话 + Web 可见对话 + 可默认/自动选 agent”为最低通过线 |
