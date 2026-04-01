use serde::{Deserialize, Serialize};

// ─── Shared defaults ───────────────────────────────────────────────────────

fn default_true() -> bool {
    true
}

fn default_max_iterations() -> usize {
    10
}

fn default_temperature() -> f32 {
    0.2
}

fn default_probe_timeout_ms() -> u64 {
    15_000
}

fn default_probe_prompt() -> String {
    "1+1=?".to_string()
}

fn default_probe_max_tokens() -> u32 {
    1
}

fn default_reasoning_mode() -> ReasoningMode {
    ReasoningMode::Off
}

fn default_channel_auto_route() -> bool {
    true
}

// ─── Provider Types ────────────────────────────────────────────────────────

/// High-level provider architecture category.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderType {
    Native,
    OpenAiCompatible,
}

/// Provider vendor / preset template.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProviderVendor {
    OpenAi,
    AzureOpenAi,
    Anthropic,
    Gemini,
    OpenRouter,
    Ollama,
    DeepSeek,
    SiliconFlow,
    Groq,
    Custom,
}

impl ProviderVendor {
    #[must_use]
    pub fn display_name(self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::AzureOpenAi => "Azure OpenAI",
            Self::Anthropic => "Anthropic",
            Self::Gemini => "Gemini",
            Self::OpenRouter => "OpenRouter",
            Self::Ollama => "Ollama",
            Self::DeepSeek => "DeepSeek",
            Self::SiliconFlow => "SiliconFlow",
            Self::Groq => "Groq",
            Self::Custom => "Custom Compatible",
        }
    }

    #[must_use]
    pub fn provider_type(self) -> ProviderType {
        match self {
            Self::OpenAi | Self::AzureOpenAi | Self::Anthropic | Self::Gemini => {
                ProviderType::Native
            }
            Self::OpenRouter
            | Self::Ollama
            | Self::DeepSeek
            | Self::SiliconFlow
            | Self::Groq
            | Self::Custom => ProviderType::OpenAiCompatible,
        }
    }

    #[must_use]
    pub fn default_base_url(self) -> &'static str {
        match self {
            Self::OpenAi => "https://api.openai.com/v1",
            Self::AzureOpenAi => "https://{resource-name}.openai.azure.com/openai/v1/",
            Self::Anthropic => "https://api.anthropic.com",
            Self::Gemini => "https://generativelanguage.googleapis.com/v1beta",
            Self::OpenRouter => "https://openrouter.ai/api/v1",
            Self::Ollama => "http://localhost:11434/v1/",
            Self::DeepSeek => "https://api.deepseek.com/v1",
            Self::SiliconFlow => "https://api.siliconflow.com/v1",
            Self::Groq => "https://api.groq.com/openai/v1",
            Self::Custom => "https://your-openai-compatible-endpoint/v1",
        }
    }

    #[must_use]
    pub fn default_model(self) -> &'static str {
        match self {
            Self::OpenAi | Self::AzureOpenAi | Self::Custom => "gpt-4o-mini",
            Self::Anthropic => "claude-3-5-sonnet-latest",
            Self::Gemini => "gemini-2.5-flash",
            Self::OpenRouter => "openai/gpt-4o-mini",
            Self::Ollama => "qwen3:latest",
            Self::DeepSeek => "deepseek-chat",
            Self::SiliconFlow => "Qwen/Qwen3-8B",
            Self::Groq => "llama-3.1-8b-instant",
        }
    }
}

/// Provider feature flags used by the UI/runtime to gate functionality.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderCapabilities {
    pub supports_streaming: bool,
    pub supports_tools: bool,
    pub supports_reasoning_control: bool,
    pub supports_connection_test: bool,
    pub supports_model_fetch: bool,
}

impl ProviderCapabilities {
    #[must_use]
    pub fn for_vendor(vendor: ProviderVendor) -> Self {
        match vendor {
            ProviderVendor::OpenAi
            | ProviderVendor::AzureOpenAi
            | ProviderVendor::OpenRouter
            | ProviderVendor::Ollama
            | ProviderVendor::DeepSeek
            | ProviderVendor::SiliconFlow
            | ProviderVendor::Groq
            | ProviderVendor::Custom => Self {
                supports_streaming: true,
                supports_tools: true,
                supports_reasoning_control: true,
                supports_connection_test: true,
                supports_model_fetch: false,
            },
            ProviderVendor::Anthropic | ProviderVendor::Gemini => Self {
                supports_streaming: true,
                supports_tools: false,
                supports_reasoning_control: true,
                supports_connection_test: true,
                supports_model_fetch: false,
            },
        }
    }
}

/// Catalog entry for built-in provider templates shown in the UI.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderTemplate {
    pub vendor: ProviderVendor,
    pub provider_type: ProviderType,
    pub name: String,
    pub base_url: String,
    pub default_model: String,
    pub requires_api_key: bool,
    pub capabilities: ProviderCapabilities,
}

#[must_use]
pub fn builtin_provider_templates() -> Vec<ProviderTemplate> {
    let vendors = [
        ProviderVendor::OpenAi,
        ProviderVendor::AzureOpenAi,
        ProviderVendor::Anthropic,
        ProviderVendor::Gemini,
        ProviderVendor::OpenRouter,
        ProviderVendor::Ollama,
        ProviderVendor::DeepSeek,
        ProviderVendor::SiliconFlow,
        ProviderVendor::Groq,
        ProviderVendor::Custom,
    ];

    vendors
        .into_iter()
        .map(|vendor| ProviderTemplate {
            vendor,
            provider_type: vendor.provider_type(),
            name: vendor.display_name().to_string(),
            base_url: vendor.default_base_url().to_string(),
            default_model: vendor.default_model().to_string(),
            requires_api_key: vendor != ProviderVendor::Ollama,
            capabilities: ProviderCapabilities::for_vendor(vendor),
        })
        .collect()
}

/// LLM provider configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub provider_type: ProviderType,
    pub vendor: ProviderVendor,
    /// API key or token. Masked when returned to frontend.
    #[serde(default)]
    pub api_key: String,
    /// Base URL of the API.
    pub base_url: String,
    /// Default model to use.
    pub default_model: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub capabilities: Option<ProviderCapabilities>,
}

/// Mask an API key for safe display, preserving first/last 4 characters.
pub fn mask_api_key(key: &str) -> String {
    if key.len() <= 8 {
        "****".to_string()
    } else {
        format!("{}...{}", &key[..4], &key[key.len() - 4..])
    }
}

impl ProviderConfig {
    /// Return a copy with vendor defaults applied when fields are empty.
    #[must_use]
    pub fn normalized(mut self) -> Self {
        self.provider_type = self.vendor.provider_type();
        if self.name.trim().is_empty() {
            self.name = self.vendor.display_name().to_string();
        }
        if self.base_url.trim().is_empty() {
            self.base_url = self.vendor.default_base_url().to_string();
        }
        if self.default_model.trim().is_empty() {
            self.default_model = self.vendor.default_model().to_string();
        }
        if self.capabilities.is_none() {
            self.capabilities = Some(ProviderCapabilities::for_vendor(self.vendor));
        }
        self
    }

    /// Return a copy with the API key masked for frontend display.
    #[must_use]
    pub fn masked(&self) -> Self {
        let mut cfg = self.clone();
        cfg.api_key = mask_api_key(&cfg.api_key);
        cfg
    }

    #[must_use]
    pub fn capabilities(&self) -> ProviderCapabilities {
        self.capabilities
            .clone()
            .unwrap_or_else(|| ProviderCapabilities::for_vendor(self.vendor))
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningMode {
    Off,
    Low,
    Medium,
    High,
}

/// Probe request for testing a provider connection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderProbeRequest {
    pub provider: ProviderConfig,
    #[serde(default = "default_probe_prompt")]
    pub prompt: String,
    #[serde(default = "default_probe_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_probe_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_reasoning_mode")]
    pub reasoning_mode: ReasoningMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderProbeResult {
    pub success: bool,
    pub provider_name: String,
    pub provider_vendor: ProviderVendor,
    pub model: String,
    pub latency_ms: u128,
    pub status_code: Option<u16>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_preview: Option<String>,
}

// ─── Channel Types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ChannelKind {
    Qq,
    DingTalk,
    Feishu,
    WeCom,
    Telegram,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChannelConfig {
    pub id: String,
    pub name: String,
    pub kind: ChannelKind,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub default_agent_profile_id: Option<String>,
    #[serde(default = "default_channel_auto_route")]
    pub auto_route_agent: bool,
    #[serde(default)]
    pub webhook_url: Option<String>,
    #[serde(default)]
    pub bot_user_id: Option<String>,
    #[serde(default)]
    pub credentials: serde_json::Value,
}

impl ChannelConfig {
    #[must_use]
    pub fn new(id: String, name: String, kind: ChannelKind) -> Self {
        Self {
            id,
            name,
            kind,
            enabled: true,
            default_agent_profile_id: None,
            auto_route_agent: true,
            webhook_url: None,
            bot_user_id: None,
            credentials: serde_json::Value::Object(serde_json::Map::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelIdentity {
    pub channel_id: String,
    pub kind: ChannelKind,
    pub external_user_id: String,
    pub external_conversation_id: String,
    #[serde(default)]
    pub external_thread_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelConversationBinding {
    pub channel_id: String,
    pub kind: ChannelKind,
    pub external_conversation_id: String,
    #[serde(default)]
    pub external_thread_id: Option<String>,
    pub external_user_id: String,
    pub session_id: String,
    #[serde(default)]
    pub agent_profile_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl ChannelConversationBinding {
    #[must_use]
    pub fn new(
        channel_id: String,
        kind: ChannelKind,
        external_conversation_id: String,
        external_thread_id: Option<String>,
        external_user_id: String,
        session_id: String,
        agent_profile_id: Option<String>,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            channel_id,
            kind,
            external_conversation_id,
            external_thread_id,
            external_user_id,
            session_id,
            agent_profile_id,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    #[must_use]
    pub fn key(&self) -> String {
        Self::lookup_key(
            &self.channel_id,
            self.kind,
            &self.external_conversation_id,
            self.external_thread_id.as_deref(),
        )
    }

    #[must_use]
    pub fn lookup_key(
        channel_id: &str,
        kind: ChannelKind,
        external_conversation_id: &str,
        external_thread_id: Option<&str>,
    ) -> String {
        let thread = external_thread_id.unwrap_or("-");
        format!("{channel_id}::{kind:?}::{external_conversation_id}::{thread}")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelMessageEvent {
    pub channel_id: String,
    pub kind: ChannelKind,
    pub external_message_id: String,
    pub external_conversation_id: String,
    #[serde(default)]
    pub external_thread_id: Option<String>,
    pub sender: ChannelIdentity,
    pub content: String,
    pub occurred_at: String,
}

// ─── Agent Profile Types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentPresetKind {
    GeneralAssistant,
    CodingAssistant,
    OpsAssistant,
    NetworkAssistant,
    Custom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentToolPolicyMode {
    All,
    AllowList,
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentBehaviorConfig {
    #[serde(default = "default_true")]
    pub require_impact_for_destructive: bool,
    #[serde(default)]
    pub read_only_mode: bool,
    #[serde(default)]
    pub concise_output: bool,
    #[serde(default)]
    pub extra_rules: Vec<String>,
}

impl Default for AgentBehaviorConfig {
    fn default() -> Self {
        Self {
            require_impact_for_destructive: true,
            read_only_mode: false,
            concise_output: true,
            extra_rules: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentToolConfig {
    pub mode: AgentToolPolicyMode,
    #[serde(default)]
    pub enabled_tools: Vec<String>,
    #[serde(default = "default_true")]
    pub allow_bash: bool,
}

impl Default for AgentToolConfig {
    fn default() -> Self {
        Self {
            mode: AgentToolPolicyMode::All,
            enabled_tools: vec!["read".into(), "write".into(), "edit".into(), "bash".into()],
            allow_bash: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub preset_kind: AgentPresetKind,
    #[serde(default)]
    pub is_builtin: bool,
    pub system_prompt: String,
    #[serde(default)]
    pub behavior: AgentBehaviorConfig,
    #[serde(default)]
    pub tool_config: AgentToolConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_probe_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_reasoning_mode")]
    pub reasoning_mode: ReasoningMode,
}

impl AgentProfile {
    #[must_use]
    pub fn effective_system_prompt(&self) -> String {
        let mut lines = vec![self.system_prompt.clone()];
        if self.behavior.require_impact_for_destructive {
            lines.push("For destructive actions, explain impact before proceeding.".into());
        }
        if self.behavior.read_only_mode {
            lines.push("Operate in read-only mode unless the user explicitly authorizes writes.".into());
        }
        if self.behavior.concise_output {
            lines.push("Keep responses concise and action-oriented.".into());
        }
        if !self.tool_config.allow_bash {
            lines.push("Do not use bash under this profile.".into());
        }
        if !self.behavior.extra_rules.is_empty() {
            lines.extend(self.behavior.extra_rules.iter().cloned());
        }
        lines.join("\n")
    }
}

#[must_use]
pub fn builtin_agent_profiles() -> Vec<AgentProfile> {
    vec![
        AgentProfile {
            id: "general-assistant".into(),
            name: "通用助手".into(),
            description: "适合通用问答、系统导航和轻量操作建议。".into(),
            preset_kind: AgentPresetKind::GeneralAssistant,
            is_builtin: true,
            system_prompt: "You are VentoOS General Assistant. Help the user navigate the system, answer questions clearly, and only use tools when necessary.".into(),
            behavior: AgentBehaviorConfig::default(),
            tool_config: AgentToolConfig::default(),
            default_provider_id: None,
            default_model: None,
            temperature: 0.2,
            max_tokens: 2048,
            reasoning_mode: ReasoningMode::Off,
        },
        AgentProfile {
            id: "coding-assistant".into(),
            name: "编码助手".into(),
            description: "适合代码分析、改动建议、文件编辑与开发协作。".into(),
            preset_kind: AgentPresetKind::CodingAssistant,
            is_builtin: true,
            system_prompt: "You are VentoOS Coding Assistant. Prefer minimal, safe code changes, explain impact clearly, and keep technical output precise.".into(),
            behavior: AgentBehaviorConfig::default(),
            tool_config: AgentToolConfig::default(),
            default_provider_id: None,
            default_model: None,
            temperature: 0.1,
            max_tokens: 4096,
            reasoning_mode: ReasoningMode::Low,
        },
        AgentProfile {
            id: "ops-assistant".into(),
            name: "运维助手".into(),
            description: "适合 K8s、数据库、Redis、日志、部署与排障场景。".into(),
            preset_kind: AgentPresetKind::OpsAssistant,
            is_builtin: true,
            system_prompt: "You are VentoOS Ops Assistant. Focus on infrastructure operations, explain risks before writes, and prioritize safe operational guidance.".into(),
            behavior: AgentBehaviorConfig::default(),
            tool_config: AgentToolConfig::default(),
            default_provider_id: None,
            default_model: None,
            temperature: 0.1,
            max_tokens: 4096,
            reasoning_mode: ReasoningMode::Low,
        },
        AgentProfile {
            id: "network-assistant".into(),
            name: "网络助手".into(),
            description: "适合网络诊断、DNS、连通性、端口与链路分析。".into(),
            preset_kind: AgentPresetKind::NetworkAssistant,
            is_builtin: true,
            system_prompt: "You are VentoOS Network Assistant. Specialize in connectivity, DNS, routing, ports, ingress, egress, and network diagnostics.".into(),
            behavior: AgentBehaviorConfig::default(),
            tool_config: AgentToolConfig::default(),
            default_provider_id: None,
            default_model: None,
            temperature: 0.1,
            max_tokens: 3072,
            reasoning_mode: ReasoningMode::Low,
        },
    ]
}

// ─── Message Types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type", default = "default_function_type")]
    pub call_type: String,
    pub function: FunctionCall,
}

fn default_function_type() -> String {
    "function".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub role: MessageRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl AgentMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: MessageRole::System,
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: MessageRole::User,
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: MessageRole::Assistant,
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    pub fn tool_result(
        tool_call_id: impl Into<String>,
        name: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        Self {
            role: MessageRole::Tool,
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: Some(tool_call_id.into()),
            name: Some(name.into()),
        }
    }
}

// ─── Tool Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub risk_level: RiskLevel,
}

// ─── Stream Event Types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    #[serde(rename = "content_delta")]
    ContentDelta { content: String },
    #[serde(rename = "tool_call_start")]
    ToolCallStart {
        id: String,
        name: String,
        arguments: String,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        id: String,
        name: String,
        content: String,
        success: bool,
    },
    #[serde(rename = "message_complete")]
    MessageComplete { message: AgentMessage },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "done")]
    Done { session_id: String },
}

// ─── Session / Request Types ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_binding: Option<ChannelConversationBinding>,
    pub messages: Vec<AgentMessage>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub session_id: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub session_id: String,
    pub message: AgentMessage,
}

// ─── Agent Configuration ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub default_provider_id: Option<String>,
    pub default_model: Option<String>,
    pub default_agent_profile_id: Option<String>,
    pub default_system_prompt: String,
    #[serde(default = "default_max_iterations")]
    pub max_iterations: usize,
    #[serde(default = "default_true")]
    pub tools_enabled: bool,
}

pub const DEFAULT_SYSTEM_PROMPT: &str = "\
You are VentoOS SRE Assistant, an AI assistant integrated into VentoOS — \
a browser-based operating system for infrastructure management.

You have access to tools for:
- Reading files (read)
- Writing files (write)
- Editing files (edit)
- Executing shell commands (bash)

Rules:
- Only use the provided tools when needed.
- For any destructive action, describe the impact first and ask for confirmation.
- Prefer minimal changes.
- Be concise and direct.

Your goal is to help users with efficient DevOps operations including \
Kubernetes management, database administration, Redis operations, and file management.";

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            default_provider_id: None,
            default_model: None,
            default_agent_profile_id: Some("general-assistant".into()),
            default_system_prompt: DEFAULT_SYSTEM_PROMPT.to_string(),
            max_iterations: default_max_iterations(),
            tools_enabled: true,
        }
    }
}

// ─── Internal OpenAI API Types ─────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub(crate) struct OpenAiRequest {
    pub model: String,
    pub messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<OpenAiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<OpenAiReasoningConfig>,
    pub stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct OpenAiMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct OpenAiTool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: OpenAiFunction,
}

#[derive(Debug, Serialize)]
pub(crate) struct OpenAiFunction {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub(crate) struct OpenAiReasoningConfig {
    pub effort: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiResponse {
    pub choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiChoice {
    pub message: OpenAiMessage,
    #[allow(dead_code)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiStreamChunk {
    pub choices: Vec<OpenAiStreamChoice>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiStreamChoice {
    pub delta: OpenAiStreamDelta,
    #[allow(dead_code)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub(crate) struct OpenAiStreamDelta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub tool_calls: Option<Vec<StreamToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct StreamToolCallDelta {
    pub index: usize,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub function: Option<StreamFunctionDelta>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct StreamFunctionDelta {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiErrorResponse {
    pub error: OpenAiErrorDetail,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiErrorDetail {
    pub message: String,
}

// ─── Error Type ────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error("Provider error: {0}")]
    Provider(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Guard rejected: {0}")]
    GuardRejected(String),
    #[error("Tool execution failed ({tool_name}): {message}")]
    ToolFailed { tool_name: String, message: String },
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    #[error("Provider not found: {0}")]
    ProviderNotFound(String),
    #[error("Agent profile not found: {0}")]
    AgentProfileNotFound(String),
    #[error("No provider configured")]
    NoProvider,
    #[error("Channel error ({channel}): {detail}")]
    ChannelError { channel: String, detail: String },
    #[error("Config error: {0}")]
    ConfigError(String),
    #[error("Max iterations ({0}) reached")]
    MaxIterations(usize),
    #[error("{0}")]
    Other(String),
}

// ─── Conversion helpers ────────────────────────────────────────────────────

impl AgentMessage {
    pub(crate) fn to_openai(&self) -> OpenAiMessage {
        OpenAiMessage {
            role: match self.role {
                MessageRole::System => "system".to_string(),
                MessageRole::User => "user".to_string(),
                MessageRole::Assistant => "assistant".to_string(),
                MessageRole::Tool => "tool".to_string(),
            },
            content: self.content.clone(),
            tool_calls: self.tool_calls.clone(),
            tool_call_id: self.tool_call_id.clone(),
            name: self.name.clone(),
        }
    }
}

impl OpenAiMessage {
    pub(crate) fn to_agent_message(&self) -> AgentMessage {
        let role = match self.role.as_str() {
            "system" => MessageRole::System,
            "user" => MessageRole::User,
            "tool" => MessageRole::Tool,
            _ => MessageRole::Assistant,
        };
        AgentMessage {
            role,
            content: self.content.clone(),
            tool_calls: self.tool_calls.clone(),
            tool_call_id: self.tool_call_id.clone(),
            name: self.name.clone(),
        }
    }
}

impl ToolDefinition {
    pub(crate) fn to_openai_tool(&self) -> OpenAiTool {
        OpenAiTool {
            tool_type: "function".to_string(),
            function: OpenAiFunction {
                name: self.name.clone(),
                description: self.description.clone(),
                parameters: self.parameters.clone(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_api_key_short() {
        assert_eq!(mask_api_key("abc"), "****");
        assert_eq!(mask_api_key("12345678"), "****");
    }

    #[test]
    fn test_mask_api_key_long() {
        let masked = mask_api_key("sk-abc123def456ghi789");
        assert!(masked.starts_with("sk-a"));
        assert!(masked.ends_with("i789"));
        assert!(masked.contains("..."));
    }

    #[test]
    fn test_provider_config_normalized_uses_vendor_defaults() {
        let cfg = ProviderConfig {
            id: "p1".into(),
            name: String::new(),
            provider_type: ProviderType::Native,
            vendor: ProviderVendor::Groq,
            api_key: String::new(),
            base_url: String::new(),
            default_model: String::new(),
            enabled: true,
            capabilities: None,
        }
        .normalized();

        assert_eq!(cfg.provider_type, ProviderType::OpenAiCompatible);
        assert_eq!(cfg.name, "Groq");
        assert_eq!(cfg.base_url, "https://api.groq.com/openai/v1");
        assert!(cfg.capabilities.is_some());
    }

    #[test]
    fn test_builtin_provider_templates_count() {
        let templates = builtin_provider_templates();
        assert_eq!(templates.len(), 10);
        assert!(templates.iter().any(|t| t.vendor == ProviderVendor::Gemini));
        assert!(templates.iter().any(|t| t.vendor == ProviderVendor::Custom));
    }

    #[test]
    fn test_provider_config_masked() {
        let cfg = ProviderConfig {
            id: "p1".into(),
            name: "Test".into(),
            provider_type: ProviderType::Native,
            vendor: ProviderVendor::OpenAi,
            api_key: "sk-1234567890abcdef".into(),
            base_url: "https://api.openai.com/v1".into(),
            default_model: "gpt-4o".into(),
            enabled: true,
            capabilities: None,
        };
        let masked = cfg.masked();
        assert_ne!(masked.api_key, cfg.api_key);
        assert!(masked.api_key.contains("..."));
    }

    #[test]
    fn test_builtin_agent_profiles() {
        let profiles = builtin_agent_profiles();
        assert_eq!(profiles.len(), 4);
        assert!(profiles.iter().all(|p| p.is_builtin));
        assert!(profiles.iter().any(|p| p.preset_kind == AgentPresetKind::CodingAssistant));
    }

    #[test]
    fn test_agent_profile_effective_prompt_includes_constraints() {
        let profile = AgentProfile {
            id: "custom".into(),
            name: "Custom".into(),
            description: "desc".into(),
            preset_kind: AgentPresetKind::Custom,
            is_builtin: false,
            system_prompt: "Base prompt".into(),
            behavior: AgentBehaviorConfig {
                require_impact_for_destructive: true,
                read_only_mode: true,
                concise_output: true,
                extra_rules: vec!["Always cite assumptions.".into()],
            },
            tool_config: AgentToolConfig {
                mode: AgentToolPolicyMode::AllowList,
                enabled_tools: vec!["read".into()],
                allow_bash: false,
            },
            default_provider_id: None,
            default_model: None,
            temperature: 0.2,
            max_tokens: 512,
            reasoning_mode: ReasoningMode::Off,
        };

        let prompt = profile.effective_system_prompt();
        assert!(prompt.contains("Base prompt"));
        assert!(prompt.contains("read-only mode"));
        assert!(prompt.contains("Do not use bash"));
        assert!(prompt.contains("Always cite assumptions."));
    }

    #[test]
    fn test_agent_message_constructors() {
        let sys = AgentMessage::system("hello");
        assert_eq!(sys.role, MessageRole::System);
        assert_eq!(sys.content.as_deref(), Some("hello"));

        let usr = AgentMessage::user("test");
        assert_eq!(usr.role, MessageRole::User);

        let asst = AgentMessage::assistant("reply");
        assert_eq!(asst.role, MessageRole::Assistant);

        let tool = AgentMessage::tool_result("call_1", "read", "file content");
        assert_eq!(tool.role, MessageRole::Tool);
        assert_eq!(tool.tool_call_id.as_deref(), Some("call_1"));
        assert_eq!(tool.name.as_deref(), Some("read"));
    }

    #[test]
    fn test_agent_message_to_openai_roundtrip() {
        let msg = AgentMessage::user("hello world");
        let oai = msg.to_openai();
        assert_eq!(oai.role, "user");
        assert_eq!(oai.content.as_deref(), Some("hello world"));

        let back = oai.to_agent_message();
        assert_eq!(back.role, MessageRole::User);
        assert_eq!(back.content.as_deref(), Some("hello world"));
    }

    #[test]
    fn test_default_agent_config() {
        let cfg = AgentConfig::default();
        assert_eq!(cfg.default_agent_profile_id.as_deref(), Some("general-assistant"));
        assert_eq!(cfg.max_iterations, 10);
        assert!(cfg.tools_enabled);
        assert!(!cfg.default_system_prompt.is_empty());
    }

    #[test]
    fn test_stream_event_serialize() {
        let event = StreamEvent::ContentDelta {
            content: "hello".into(),
        };
        let json = serde_json::to_string(&event).expect("stream event should serialize");
        assert!(json.contains("content_delta"));
        assert!(json.contains("hello"));
    }

    #[test]
    fn test_channel_config_defaults() {
        let config = ChannelConfig::new(
            "channel-1".into(),
            "Telegram".into(),
            ChannelKind::Telegram,
        );

        assert!(config.enabled);
        assert!(config.auto_route_agent);
        assert_eq!(config.kind, ChannelKind::Telegram);
        assert_eq!(config.credentials, serde_json::json!({}));
    }

    #[test]
    fn test_channel_binding_key_uses_thread_when_present() {
        let binding = ChannelConversationBinding::new(
            "channel-telegram".into(),
            ChannelKind::Telegram,
            "chat-42".into(),
            Some("thread-7".into()),
            "user-9".into(),
            "session-1".into(),
            None,
        );

        assert_eq!(
            binding.key(),
            ChannelConversationBinding::lookup_key(
                "channel-telegram",
                ChannelKind::Telegram,
                "chat-42",
                Some("thread-7"),
            )
        );
    }

    #[test]
    fn test_tool_definition_to_openai() {
        let tool = ToolDefinition {
            name: "read".into(),
            description: "Read a file".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }),
            risk_level: RiskLevel::Low,
        };
        let oai = tool.to_openai_tool();
        assert_eq!(oai.tool_type, "function");
        assert_eq!(oai.function.name, "read");
    }
}
