# AI Assistant 增强 - 任务拆解

## 原始需求

当前 VentoOS 中的 AI Assistant 实现不够完善，需要：

1. 扩展可接入的模型供应商，不能只停留在少量 provider。
2. 模型接入时必须提供测试能力。
3. 测试建议采用最小探针：关闭 think、问题 `1+1=?`、`maxTokens=1`。
4. 提供常用预设 agent：通用助手、编码助手、运维助手、网络助手。
5. 支持用户自定义 agent。
6. 自定义 agent 需要可配置：行为约束、工具配置、系统提示词等。
7. 前端 UI 要同步支持上述配置和测试流程。
8. 本次需求文档归档到 `docs/requirements/06-ai-assistant/`。
9. AI agent 底层要支持类似 openclaw 的 channel 机制，以便从外部聊天渠道控制 VentoOS 执行操作。
10. 第一阶段先接入 QQ、钉钉、飞书、企业微信、Telegram 这些常用聊天渠道。
11. 每个 channel 都要有对应的 Rust 实现方案，优先参考官方协议或主流 Rust 实现。
12. 页面上必须有 channel 配置入口。
13. 所有 channel 都能触发对话，默认用通用 agent 执行，也支持按用户对话自动选择 agent。
14. channel 中的对话必须能在 Web 端看到。

## 官方供应商地址确认

| 序号 | 供应商 | 类型 | 官方地址 | 备注 |
|---|---|---|---|---|
| 1 | OpenAI | 原生 | `https://api.openai.com/v1` | 官方标准入口 |
| 2 | Azure OpenAI | 原生 | `https://{resource-name}.openai.azure.com/openai/v1/` | 资源级地址 |
| 3 | Anthropic | 原生 | `https://api.anthropic.com` | 原生 Claude API |
| 4 | Gemini | 原生 | `https://generativelanguage.googleapis.com/v1beta` | 原生 Gemini API |
| 5 | OpenRouter | OpenAI-compatible | `https://openrouter.ai/api/v1` | 兼容入口 |
| 6 | Ollama | OpenAI-compatible | `http://localhost:11434/v1/` | 本地默认地址 |
| 7 | DeepSeek | OpenAI-compatible | `https://api.deepseek.com/v1` | 官方兼容入口 |
| 8 | SiliconFlow | OpenAI-compatible | `https://api.siliconflow.com/v1` | 兼容入口 |
| 9 | Groq | OpenAI-compatible | `https://api.groq.com/openai/v1` | 兼容入口 |
| 10 | Custom Compatible | OpenAI-compatible | 用户自定义 | 仅要求配置 `base_url` |

## Channel 接入参考

| 序号 | 渠道 | 官方接入能力 | Rust 参考实现 | 第一阶段策略 | 备注 |
|---|---|---|---|---|---|
| 1 | Telegram | Bot API（Webhook / Long Polling） | `teloxide/teloxide` | 优先 webhook，保留 polling 兜底 | 协议清晰，优先落地 |
| 2 | 飞书 | 开放平台机器人 + 事件订阅 | `chyroc/lark-rs` / `foxzool/openlark` | 走 callback + 签名校验 | 无官方 Rust SDK 时参考主流实现 |
| 3 | 钉钉 | 机器人 + Stream 模式 | `SpenserCai/dingtalk-stream-sdk-rs` | 优先 Stream 模式 | 对齐官方 Python Stream SDK 语义 |
| 4 | 企业微信 | 机器人回调 + 消息加解密 | `chang196700/wxwork-api` / `shenshouer/wecom-rs` | 走 callback + 加解密 | 必须在 Rust Core 完成签名/解密 |
| 5 | QQ | 官方机器人开放平台 | `YinMo19/botrs` 等 | 按官方 bot 设计 adapter | 第一阶段不纳入个人 QQ 协议 |

## 需求拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 扩展模型供应商 | 建立双层 provider 架构：原生 provider + OpenAI-compatible provider | 支持首批 10 类供应商配置 | 未开始 |
| 2 | 地址需要确认 | 内置官方地址模板与供应商元信息 | UI 能直接选择模板，地址默认正确 | 未开始 |
| 3 | 接入要能测试 | 增加 provider probe API 与前端测试按钮 | 每个 provider 可执行测试并返回结果 | 未开始 |
| 4 | 最小探针测试 | 后端实现统一测试请求：最小 prompt、最小 token、禁用 reasoning 优先 | 测试逻辑有单元测试覆盖 | 未开始 |
| 5 | 提供预设 agent | 增加 4 个预设 agent | UI 可见并可选用 | 未开始 |
| 6 | 用户自定义 agent | 增加 agent profile CRUD | 可创建、编辑、删除、复制自定义 agent | 未开始 |
| 7 | 配置行为约束 / 工具 / 提示词 | AgentProfile 支持行为约束、系统提示词、工具配置、模型配置 | 后端可存取，前端可编辑 | 未开始 |
| 8 | UI 同步 | AI Assistant 设置页升级为 Provider / Agent / Runtime 三块 | 用户可完成 provider 配置、测试、agent 选择与编辑 | 未开始 |
| 9 | 会话绑定 agent | ChatRequest / Session 支持绑定 agent profile | 新会话可指定 agent，历史会话可显示 agent | 未开始 |
| 10 | 测试补齐 | 后端与前端至少补充关键单元测试 | 关键新行为具备测试 | 进行中 |
| 11 | 验收闭环 | 输出完成情况与验收报告 | 同级目录下生成文档并回填结果 | 未开始 |
| 12 | Channel 底层抽象 | 建立统一 `ChannelAdapter`、`ChannelEvent`、`ChannelConfig`、`ChannelConversationBinding` 模型 | Rust Core 可统一接入外部渠道，不把逻辑散落到 UI | 进行中 |
| 13 | 首批 5 个 channel 接入 | 实现 QQ / 钉钉 / 飞书 / 企业微信 / Telegram adapter | 所有渠道可接入并触发对话 | 未开始 |
| 14 | 默认与自动 agent 路由 | channel 消息默认走通用 agent，并支持按意图自动选择 agent | 可见默认路由和自动切换结果 | 未开始 |
| 15 | Channel Web 可观测 | Web 端可看到 channel 配置、会话、消息、工具调用、错误 | 页面上有配置区和会话观察区 | 未开始 |
| 16 | 渠道安全与审计 | 外部渠道触发的动作统一走 Guard / Harness / Confirm | 高风险操作不能绕过确认链 | 未开始 |
| 17 | 渠道级验证 | 各 adapter 有单测/集测，页面与基础构建命令通过 | 满足页面可配置、渠道可对话、Web 可见的最低验收线 | 进行中 |

## 实现分块

### T1 后端模型升级

* 扩展 `ProviderConfig`、`AgentConfig`、`ChatSession`、`ChatRequest`
* 新增 `ProviderVendor`、`ProviderKind`、`ProviderCapabilities`
* 新增 `AgentProfile`、`AgentPresetKind`、`AgentBehaviorConfig`、`AgentToolPolicy`

### T2 Provider 与 Probe 系统

* 原生 provider：OpenAI / Azure OpenAI / Anthropic / Gemini
* 兼容 provider：OpenRouter / Ollama / DeepSeek / SiliconFlow / Groq / Custom
* 新增测试接口与测试结果结构

### T3 Agent Profile 系统

* 默认预设 agent 注入
* 自定义 agent CRUD
* 会话默认绑定 agent
* agent 生成最终 system prompt

### T4 前端 UI 升级

* Provider 列表、模板、测试
* Agent 列表、预设展示、自定义编辑
* 聊天区 agent 选择和运行态展示

### T5 测试与验收

* Rust 单元测试
* 前端关键工具函数测试
* 构建 / lint / 测试验证
* 文档回填

### T6 Channel Runtime

* 建立 `ChannelAdapter` trait 与统一事件模型
* 打通外部 channel 消息到 Agent Session 的绑定
* 打通 channel 回复发送与 Web 投影

### T7 首批渠道适配器

* Telegram webhook / polling adapter
* 飞书 callback adapter
* 钉钉 Stream adapter
* 企业微信 callback adapter
* QQ 官方 bot adapter

### T8 Channel UI 与审计

* Channel 配置页
* Channel 会话列表与详情
* agent 路由信息、工具调用、错误态可视化
* 高风险操作确认记录展示
