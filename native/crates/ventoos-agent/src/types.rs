use serde::{Deserialize, Serialize};

// ─── Provider Types ────────────────────────────────────────────────────────

/// Supported LLM provider type.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderType {
    /// OpenAI-compatible APIs (`OpenAI`, Azure, local proxies, etc.)
    OpenAi,
    /// Anthropic Claude API
    Anthropic,
    /// Local Ollama server
    Ollama,
    /// Custom endpoint with OpenAI-compatible protocol
    Custom,
}

/// LLM provider configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub provider_type: ProviderType,
    /// API key or token. Masked when returned to frontend.
    #[serde(default)]
    pub api_key: String,
    /// Base URL of the API (e.g. `https://api.openai.com/v1`).
    pub base_url: String,
    /// Default model to use (e.g. `gpt-4o`).
    pub default_model: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
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
    /// Return a copy with the API key masked for frontend display.
    #[must_use]
    pub fn masked(&self) -> Self {
        Self {
            api_key: mask_api_key(&self.api_key),
            ..self.clone()
        }
    }
}

// ─── Message Types ─────────────────────────────────────────────────────────

/// Message role in a conversation.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

/// A tool call made by the assistant.
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

/// Function call details within a tool call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    /// JSON-encoded arguments string.
    pub arguments: String,
}

/// A message in the agent conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub role: MessageRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// For tool-role messages: the ID of the tool call this responds to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// For tool-role messages: the tool name.
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

/// Risk level of a tool operation.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    /// Read-only operations.
    Low,
    /// Write operations with safeguards.
    Medium,
    /// Destructive operations requiring confirmation.
    High,
    /// System-critical operations.
    Critical,
}

/// Definition of a tool available to the agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    /// JSON Schema for tool parameters.
    pub parameters: serde_json::Value,
    pub risk_level: RiskLevel,
}

// ─── Stream Event Types ────────────────────────────────────────────────────

/// Events streamed from backend to frontend during agent execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    /// Incremental text content from the assistant.
    #[serde(rename = "content_delta")]
    ContentDelta { content: String },
    /// A tool call has been initiated.
    #[serde(rename = "tool_call_start")]
    ToolCallStart {
        id: String,
        name: String,
        arguments: String,
    },
    /// Tool execution result.
    #[serde(rename = "tool_result")]
    ToolResult {
        id: String,
        name: String,
        content: String,
        success: bool,
    },
    /// The full assistant message is complete.
    #[serde(rename = "message_complete")]
    MessageComplete { message: AgentMessage },
    /// An error occurred during agent execution.
    #[serde(rename = "error")]
    Error { message: String },
    /// Stream is finished.
    #[serde(rename = "done")]
    Done { session_id: String },
}

// ─── Session Types ─────────────────────────────────────────────────────────

/// A chat session with the agent.
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
    pub messages: Vec<AgentMessage>,
    pub created_at: String,
    pub updated_at: String,
}

// ─── Request / Response Types ──────────────────────────────────────────────

/// Request to start or continue a chat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    /// Existing session ID, or `None` to create a new session.
    pub session_id: Option<String>,
    /// User's message text.
    pub message: String,
    /// Override provider for this request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    /// Override model for this request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Override system prompt for this request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
}

/// Non-streaming chat response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub session_id: String,
    pub message: AgentMessage,
}

// ─── Agent Configuration ───────────────────────────────────────────────────

/// Global agent configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Default provider ID to use.
    pub default_provider_id: Option<String>,
    /// Default model to use.
    pub default_model: Option<String>,
    /// Default system prompt.
    pub default_system_prompt: String,
    /// Maximum agent loop iterations.
    #[serde(default = "default_max_iterations")]
    pub max_iterations: usize,
    /// Whether tools are enabled.
    #[serde(default = "default_true")]
    pub tools_enabled: bool,
}

fn default_max_iterations() -> usize {
    10
}

/// Default system prompt for the `VentoOS` SRE Assistant.
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
            default_system_prompt: DEFAULT_SYSTEM_PROMPT.to_string(),
            max_iterations: default_max_iterations(),
            tools_enabled: true,
        }
    }
}

// ─── Internal OpenAI API Types ─────────────────────────────────────────────

/// OpenAI-compatible chat completion request body.
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

/// Non-streaming response.
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

/// Streaming chunk.
#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiStreamChunk {
    pub choices: Vec<OpenAiStreamChoice>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiStreamChoice {
    pub delta: OpenAiStreamDelta,
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

/// API error response from `OpenAI`.
#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiErrorResponse {
    pub error: OpenAiErrorDetail,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiErrorDetail {
    pub message: String,
}

// ─── Error Type ────────────────────────────────────────────────────────────

/// Agent system errors.
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
    #[error("No provider configured")]
    NoProvider,
    #[error("Max iterations ({0}) reached")]
    MaxIterations(usize),
    #[error("{0}")]
    Other(String),
}

// ─── Conversion helpers ────────────────────────────────────────────────────

impl AgentMessage {
    /// Convert to `OpenAI` API message format.
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
    /// Convert from `OpenAI` API message to `AgentMessage`.
    pub(crate) fn to_agent_message(&self) -> AgentMessage {
        let role = match self.role.as_str() {
            "system" => MessageRole::System,
            "user" => MessageRole::User,
            "tool" => MessageRole::Tool,
            // "assistant" and any unknown role default to Assistant
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
    /// Convert to `OpenAI` function-calling tool format.
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
    fn test_provider_config_masked() {
        let cfg = ProviderConfig {
            id: "p1".into(),
            name: "Test".into(),
            provider_type: ProviderType::OpenAi,
            api_key: "sk-1234567890abcdef".into(),
            base_url: "https://api.openai.com/v1".into(),
            default_model: "gpt-4o".into(),
            enabled: true,
        };
        let masked = cfg.masked();
        assert_ne!(masked.api_key, cfg.api_key);
        assert!(masked.api_key.contains("..."));
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
        assert!(cfg.default_provider_id.is_none());
        assert_eq!(cfg.max_iterations, 10);
        assert!(cfg.tools_enabled);
        assert!(!cfg.default_system_prompt.is_empty());
    }

    #[test]
    fn test_stream_event_serialize() {
        let event = StreamEvent::ContentDelta {
            content: "hello".into(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("content_delta"));
        assert!(json.contains("hello"));
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
