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
| 10 | 测试补齐 | 后端与前端至少补充关键单元测试 | 关键新行为具备测试 | 未开始 |
| 11 | 验收闭环 | 输出完成情况与验收报告 | 同级目录下生成文档并回填结果 | 未开始 |

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
