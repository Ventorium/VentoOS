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
