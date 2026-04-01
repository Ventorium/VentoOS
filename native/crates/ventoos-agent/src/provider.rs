//! LLM Provider clients — native vendors and OpenAI-compatible vendors.

use std::time::{Duration, Instant};

use reqwest::{Client, RequestBuilder, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_stream::StreamExt;
use tracing::debug;

use crate::types::{
    AgentError, AgentMessage, FunctionCall, OpenAiErrorResponse, OpenAiReasoningConfig,
    OpenAiRequest, OpenAiResponse, OpenAiStreamChunk, ProviderConfig, ProviderProbeRequest,
    ProviderProbeResult, ProviderType, ProviderVendor, ReasoningMode, StreamEvent,
    StreamToolCallDelta, ToolCall, ToolDefinition,
};

/// Runtime provider client.
pub enum ProviderClient {
    OpenAi(OpenAiCompatibleProvider),
    Anthropic(AnthropicProvider),
    Gemini(GeminiProvider),
}

impl ProviderClient {
    #[must_use]
    pub fn new(config: ProviderConfig) -> Self {
        match config.vendor {
            ProviderVendor::Anthropic => Self::Anthropic(AnthropicProvider::new(config)),
            ProviderVendor::Gemini => Self::Gemini(GeminiProvider::new(config)),
            _ => Self::OpenAi(OpenAiCompatibleProvider::new(config)),
        }
    }

    pub async fn chat(
        &self,
        messages: &[AgentMessage],
        tools: &[ToolDefinition],
        model: Option<&str>,
    ) -> Result<AgentMessage, AgentError> {
        match self {
            Self::OpenAi(provider) => provider.chat(messages, tools, model).await,
            Self::Anthropic(provider) => provider.chat(messages, model).await,
            Self::Gemini(provider) => provider.chat(messages, model).await,
        }
    }

    pub async fn chat_stream(
        &self,
        messages: &[AgentMessage],
        tools: &[ToolDefinition],
        model: Option<&str>,
        tx: &mpsc::Sender<StreamEvent>,
    ) -> Result<AgentMessage, AgentError> {
        match self {
            Self::OpenAi(provider) => provider.chat_stream(messages, tools, model, tx).await,
            Self::Anthropic(provider) => provider.chat_stream(messages, model, tx).await,
            Self::Gemini(provider) => provider.chat_stream(messages, model, tx).await,
        }
    }

    pub async fn probe(
        &self,
        request: &ProviderProbeRequest,
    ) -> Result<ProviderProbeResult, AgentError> {
        match self {
            Self::OpenAi(provider) => provider.probe(request).await,
            Self::Anthropic(provider) => provider.probe(request).await,
            Self::Gemini(provider) => provider.probe(request).await,
        }
    }
}

// ─── OpenAI-compatible Provider ────────────────────────────────────────────

pub struct OpenAiCompatibleProvider {
    client: Client,
    config: ProviderConfig,
}

impl OpenAiCompatibleProvider {
    pub fn new(config: ProviderConfig) -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");
        Self { client, config }
    }

    pub async fn chat(
        &self,
        messages: &[AgentMessage],
        tools: &[ToolDefinition],
        model: Option<&str>,
    ) -> Result<AgentMessage, AgentError> {
        let body = Self::build_request(messages, tools, model.unwrap_or(&self.config.default_model), false);
        let response = self
            .request_builder(self.chat_url())
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            return Err(parse_openai_error(status, response).await);
        }

        let data: OpenAiResponse = response.json().await?;
        let choice = data
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| AgentError::Provider("Empty response from API".into()))?;

        Ok(choice.message.to_agent_message())
    }

    pub async fn chat_stream(
        &self,
        messages: &[AgentMessage],
        tools: &[ToolDefinition],
        model: Option<&str>,
        tx: &mpsc::Sender<StreamEvent>,
    ) -> Result<AgentMessage, AgentError> {
        let body = Self::build_request(messages, tools, model.unwrap_or(&self.config.default_model), true);
        let response = self
            .request_builder(self.chat_url())
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            return Err(parse_openai_error(status, response).await);
        }

        let mut parser = SseParser::new();
        let mut accumulator = StreamAccumulator::new();
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let bytes = chunk?;
            let events = parser.feed(&bytes);

            for data in events {
                if data == "[DONE]" {
                    break;
                }

                match serde_json::from_str::<OpenAiStreamChunk>(&data) {
                    Ok(chunk) => {
                        for choice in &chunk.choices {
                            if let Some(content) = &choice.delta.content
                                && !content.is_empty()
                            {
                                accumulator.push_content(content);
                                let _ = tx
                                    .send(StreamEvent::ContentDelta {
                                        content: content.clone(),
                                    })
                                    .await;
                            }

                            if let Some(tool_calls) = &choice.delta.tool_calls {
                                for tc_delta in tool_calls {
                                    accumulator.push_tool_call_delta(tc_delta);
                                }
                            }
                        }
                    }
                    Err(error) => debug!("Failed to parse stream chunk: {error}, data: {data}"),
                }
            }
        }

        Ok(accumulator.into_message())
    }

    pub async fn probe(
        &self,
        request: &ProviderProbeRequest,
    ) -> Result<ProviderProbeResult, AgentError> {
        let start = Instant::now();
        let body = Self::build_probe_request(
            &request.prompt,
            &request.provider.default_model,
            request.max_tokens,
            request.reasoning_mode,
        );
        let response = self
            .request_builder(self.chat_url())
            .timeout(Duration::from_millis(request.timeout_ms))
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let latency = start.elapsed().as_millis();

        if !status.is_success() {
            let error = parse_openai_error(status, response).await;
            return Ok(ProviderProbeResult {
                success: false,
                provider_name: self.config.name.clone(),
                provider_vendor: self.config.vendor,
                model: self.config.default_model.clone(),
                latency_ms: latency,
                status_code: Some(status.as_u16()),
                message: error.to_string(),
                response_preview: None,
            });
        }

        let data: OpenAiResponse = response.json().await?;
        let preview = data
            .choices
            .first()
            .and_then(|choice| choice.message.content.clone());

        Ok(ProviderProbeResult {
            success: true,
            provider_name: self.config.name.clone(),
            provider_vendor: self.config.vendor,
            model: self.config.default_model.clone(),
            latency_ms: latency,
            status_code: Some(status.as_u16()),
            message: "Provider probe succeeded".into(),
            response_preview: preview,
        })
    }

    fn chat_url(&self) -> String {
        format!("{}/chat/completions", self.config.base_url.trim_end_matches('/'))
    }

    fn request_builder(&self, url: String) -> RequestBuilder {
        let builder = self.client.post(url);
        match self.config.vendor {
            ProviderVendor::AzureOpenAi => builder.header("api-key", &self.config.api_key),
            ProviderVendor::OpenRouter => builder
                .header("Authorization", format!("Bearer {}", self.config.api_key))
                .header("HTTP-Referer", "https://ventoos.local")
                .header("X-Title", "VentoOS"),
            ProviderVendor::Ollama if self.config.api_key.is_empty() => builder,
            _ => builder.header("Authorization", format!("Bearer {}", self.config.api_key)),
        }
    }

    fn build_request(
        messages: &[AgentMessage],
        tools: &[ToolDefinition],
        model: &str,
        stream: bool,
    ) -> OpenAiRequest {
        let oai_messages: Vec<_> = messages.iter().map(AgentMessage::to_openai).collect();
        let oai_tools = if tools.is_empty() {
            None
        } else {
            Some(tools.iter().map(ToolDefinition::to_openai_tool).collect())
        };

        OpenAiRequest {
            model: model.to_string(),
            messages: oai_messages,
            tools: oai_tools,
            temperature: Some(0.2),
            max_tokens: None,
            reasoning: Some(OpenAiReasoningConfig {
                effort: "low".to_string(),
            }),
            stream,
        }
    }

    fn build_probe_request(
        prompt: &str,
        model: &str,
        max_tokens: u32,
        reasoning_mode: ReasoningMode,
    ) -> OpenAiRequest {
        OpenAiRequest {
            model: model.to_string(),
            messages: vec![AgentMessage::user(prompt).to_openai()],
            tools: None,
            temperature: Some(0.0),
            max_tokens: Some(max_tokens),
            reasoning: Some(OpenAiReasoningConfig {
                effort: match reasoning_mode {
                    ReasoningMode::Off | ReasoningMode::Low => "low".into(),
                    ReasoningMode::Medium => "medium".into(),
                    ReasoningMode::High => "high".into(),
                },
            }),
            stream: false,
        }
    }
}

// ─── Anthropic Provider ────────────────────────────────────────────────────

pub struct AnthropicProvider {
    client: Client,
    config: ProviderConfig,
}

impl AnthropicProvider {
    pub fn new(config: ProviderConfig) -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");
        Self { client, config }
    }

    pub async fn chat(
        &self,
        messages: &[AgentMessage],
        model: Option<&str>,
    ) -> Result<AgentMessage, AgentError> {
        let body = self.build_request(messages, model.unwrap_or(&self.config.default_model), 1024);
        let response = self
            .request_builder()
            .json(&body)
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(AgentError::Provider(response.text().await.unwrap_or_default()));
        }

        let data: AnthropicResponse = response.json().await?;
        Ok(AgentMessage::assistant(extract_anthropic_text(&data.content)))
    }

    pub async fn chat_stream(
        &self,
        messages: &[AgentMessage],
        model: Option<&str>,
        tx: &mpsc::Sender<StreamEvent>,
    ) -> Result<AgentMessage, AgentError> {
        let message = self.chat(messages, model).await?;
        if let Some(content) = &message.content {
            let _ = tx
                .send(StreamEvent::ContentDelta {
                    content: content.clone(),
                })
                .await;
        }
        Ok(message)
    }

    pub async fn probe(
        &self,
        request: &ProviderProbeRequest,
    ) -> Result<ProviderProbeResult, AgentError> {
        let start = Instant::now();
        let body = AnthropicRequest {
            model: self.config.default_model.clone(),
            max_tokens: request.max_tokens,
            system: Some("Return the shortest possible answer.".into()),
            messages: vec![AnthropicInputMessage {
                role: "user".into(),
                content: request.prompt.clone(),
            }],
        };
        let response = self
            .request_builder()
            .timeout(Duration::from_millis(request.timeout_ms))
            .json(&body)
            .send()
            .await?;
        let status = response.status();
        let latency = start.elapsed().as_millis();

        if !status.is_success() {
            return Ok(ProviderProbeResult {
                success: false,
                provider_name: self.config.name.clone(),
                provider_vendor: self.config.vendor,
                model: self.config.default_model.clone(),
                latency_ms: latency,
                status_code: Some(status.as_u16()),
                message: response.text().await.unwrap_or_default(),
                response_preview: None,
            });
        }

        let data: AnthropicResponse = response.json().await?;
        Ok(ProviderProbeResult {
            success: true,
            provider_name: self.config.name.clone(),
            provider_vendor: self.config.vendor,
            model: self.config.default_model.clone(),
            latency_ms: latency,
            status_code: Some(status.as_u16()),
            message: "Provider probe succeeded".into(),
            response_preview: Some(extract_anthropic_text(&data.content)),
        })
    }

    fn build_request(
        &self,
        messages: &[AgentMessage],
        model: &str,
        max_tokens: u32,
    ) -> AnthropicRequest {
        let mut system_lines = Vec::new();
        let mut anthropic_messages = Vec::new();

        for message in messages {
            match message.role {
                crate::types::MessageRole::System => {
                    if let Some(content) = &message.content {
                        system_lines.push(content.clone());
                    }
                }
                crate::types::MessageRole::User => anthropic_messages.push(AnthropicInputMessage {
                    role: "user".into(),
                    content: message.content.clone().unwrap_or_default(),
                }),
                crate::types::MessageRole::Assistant => {
                    anthropic_messages.push(AnthropicInputMessage {
                        role: "assistant".into(),
                        content: message.content.clone().unwrap_or_default(),
                    });
                }
                crate::types::MessageRole::Tool => {}
            }
        }

        AnthropicRequest {
            model: model.to_string(),
            max_tokens,
            system: (!system_lines.is_empty()).then(|| system_lines.join("\n")),
            messages: anthropic_messages,
        }
    }

    fn request_builder(&self) -> RequestBuilder {
        let url = format!("{}/v1/messages", self.config.base_url.trim_end_matches('/'));
        self.client
            .post(url)
            .header("x-api-key", &self.config.api_key)
            .header("anthropic-version", "2023-06-01")
    }
}

// ─── Gemini Provider ───────────────────────────────────────────────────────

pub struct GeminiProvider {
    client: Client,
    config: ProviderConfig,
}

impl GeminiProvider {
    pub fn new(config: ProviderConfig) -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");
        Self { client, config }
    }

    pub async fn chat(
        &self,
        messages: &[AgentMessage],
        model: Option<&str>,
    ) -> Result<AgentMessage, AgentError> {
        let body = self.build_request(messages);
        let response = self
            .request_builder(model.unwrap_or(&self.config.default_model))
            .json(&body)
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(AgentError::Provider(response.text().await.unwrap_or_default()));
        }

        let data: GeminiResponse = response.json().await?;
        Ok(AgentMessage::assistant(extract_gemini_text(&data)))
    }

    pub async fn chat_stream(
        &self,
        messages: &[AgentMessage],
        model: Option<&str>,
        tx: &mpsc::Sender<StreamEvent>,
    ) -> Result<AgentMessage, AgentError> {
        let message = self.chat(messages, model).await?;
        if let Some(content) = &message.content {
            let _ = tx
                .send(StreamEvent::ContentDelta {
                    content: content.clone(),
                })
                .await;
        }
        Ok(message)
    }

    pub async fn probe(
        &self,
        request: &ProviderProbeRequest,
    ) -> Result<ProviderProbeResult, AgentError> {
        let start = Instant::now();
        let body = GeminiRequest {
            contents: vec![GeminiContent {
                role: "user".into(),
                parts: vec![GeminiPart {
                    text: request.prompt.clone(),
                }],
            }],
            system_instruction: Some(GeminiContent {
                role: "system".into(),
                parts: vec![GeminiPart {
                    text: "Return the shortest possible answer.".into(),
                }],
            }),
            generation_config: Some(GeminiGenerationConfig {
                temperature: Some(0.0),
                max_output_tokens: Some(request.max_tokens),
            }),
        };

        let response = self
            .request_builder(&self.config.default_model)
            .timeout(Duration::from_millis(request.timeout_ms))
            .json(&body)
            .send()
            .await?;
        let status = response.status();
        let latency = start.elapsed().as_millis();

        if !status.is_success() {
            return Ok(ProviderProbeResult {
                success: false,
                provider_name: self.config.name.clone(),
                provider_vendor: self.config.vendor,
                model: self.config.default_model.clone(),
                latency_ms: latency,
                status_code: Some(status.as_u16()),
                message: response.text().await.unwrap_or_default(),
                response_preview: None,
            });
        }

        let data: GeminiResponse = response.json().await?;
        Ok(ProviderProbeResult {
            success: true,
            provider_name: self.config.name.clone(),
            provider_vendor: self.config.vendor,
            model: self.config.default_model.clone(),
            latency_ms: latency,
            status_code: Some(status.as_u16()),
            message: "Provider probe succeeded".into(),
            response_preview: Some(extract_gemini_text(&data)),
        })
    }

    fn build_request(&self, messages: &[AgentMessage]) -> GeminiRequest {
        let mut contents = Vec::new();
        let mut system_lines = Vec::new();

        for message in messages {
            match message.role {
                crate::types::MessageRole::System => {
                    if let Some(content) = &message.content {
                        system_lines.push(content.clone());
                    }
                }
                crate::types::MessageRole::User => contents.push(GeminiContent {
                    role: "user".into(),
                    parts: vec![GeminiPart {
                        text: message.content.clone().unwrap_or_default(),
                    }],
                }),
                crate::types::MessageRole::Assistant => contents.push(GeminiContent {
                    role: "model".into(),
                    parts: vec![GeminiPart {
                        text: message.content.clone().unwrap_or_default(),
                    }],
                }),
                crate::types::MessageRole::Tool => {}
            }
        }

        GeminiRequest {
            contents,
            system_instruction: (!system_lines.is_empty()).then(|| GeminiContent {
                role: "system".into(),
                parts: vec![GeminiPart {
                    text: system_lines.join("\n"),
                }],
            }),
            generation_config: Some(GeminiGenerationConfig {
                temperature: Some(0.2),
                max_output_tokens: Some(2048),
            }),
        }
    }

    fn request_builder(&self, model: &str) -> RequestBuilder {
        let base = self.config.base_url.trim_end_matches('/');
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            base, model, self.config.api_key
        );
        self.client.post(url)
    }
}

// ─── SSE Parser ────────────────────────────────────────────────────────────

struct SseParser {
    buffer: String,
}

impl SseParser {
    fn new() -> Self {
        Self {
            buffer: String::new(),
        }
    }

    fn feed(&mut self, data: &[u8]) -> Vec<String> {
        self.buffer.push_str(&String::from_utf8_lossy(data));
        let mut events = Vec::new();

        while let Some(pos) = self.buffer.find('\n') {
            let line: String = self.buffer.drain(..=pos).collect();
            let line = line.trim();

            if line.is_empty() {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ").or_else(|| line.strip_prefix("data:")) {
                let data = data.trim();
                if !data.is_empty() {
                    events.push(data.to_string());
                }
            }
        }

        events
    }
}

struct StreamAccumulator {
    content: String,
    tool_calls: Vec<ToolCallBuilder>,
}

struct ToolCallBuilder {
    id: String,
    name: String,
    arguments: String,
}

impl StreamAccumulator {
    fn new() -> Self {
        Self {
            content: String::new(),
            tool_calls: Vec::new(),
        }
    }

    fn push_content(&mut self, s: &str) {
        self.content.push_str(s);
    }

    fn push_tool_call_delta(&mut self, delta: &StreamToolCallDelta) {
        while self.tool_calls.len() <= delta.index {
            self.tool_calls.push(ToolCallBuilder {
                id: String::new(),
                name: String::new(),
                arguments: String::new(),
            });
        }

        let builder = &mut self.tool_calls[delta.index];

        if let Some(id) = &delta.id {
            builder.id.clone_from(id);
        }
        if let Some(func) = &delta.function {
            if let Some(name) = &func.name {
                builder.name.clone_from(name);
            }
            if let Some(args) = &func.arguments {
                builder.arguments.push_str(args);
            }
        }
    }

    fn into_message(self) -> AgentMessage {
        let tool_calls = if self.tool_calls.is_empty() {
            None
        } else {
            Some(
                self.tool_calls
                    .into_iter()
                    .map(|builder| ToolCall {
                        id: builder.id,
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name: builder.name,
                            arguments: builder.arguments,
                        },
                    })
                    .collect(),
            )
        };

        AgentMessage {
            role: crate::types::MessageRole::Assistant,
            content: (!self.content.is_empty()).then_some(self.content),
            tool_calls,
            tool_call_id: None,
            name: None,
        }
    }
}

// ─── Helpers / Native payloads ─────────────────────────────────────────────

async fn parse_openai_error(status: StatusCode, response: reqwest::Response) -> AgentError {
    let text = response.text().await.unwrap_or_default();
    if let Ok(err) = serde_json::from_str::<OpenAiErrorResponse>(&text) {
        return AgentError::Provider(format!("API error ({}): {}", status, err.error.message));
    }
    AgentError::Provider(format!("API error ({status}): {text}"))
}

fn extract_anthropic_text(content: &[AnthropicContentBlock]) -> String {
    content
        .iter()
        .filter_map(|block| block.text.clone())
        .collect::<Vec<_>>()
        .join("")
}

fn extract_gemini_text(response: &GeminiResponse) -> String {
    response
        .candidates
        .first()
        .map(|candidate| {
            candidate
                .content
                .parts
                .iter()
                .map(|part| part.text.as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<AnthropicInputMessage>,
}

#[derive(Debug, Serialize)]
struct AnthropicInputMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    _block_type: String,
    #[serde(default)]
    text: Option<String>,
}

#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "systemInstruction")]
    system_instruction: Option<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "generationConfig")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Serialize)]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "maxOutputTokens")]
    max_output_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ProviderCapabilities, ProviderVendor};

    fn compatible_provider(vendor: ProviderVendor, base_url: &str) -> ProviderConfig {
        ProviderConfig {
            id: "provider".into(),
            name: vendor.display_name().into(),
            provider_type: vendor.provider_type(),
            vendor,
            api_key: "test-key".into(),
            base_url: base_url.into(),
            default_model: vendor.default_model().into(),
            enabled: true,
            capabilities: Some(ProviderCapabilities::for_vendor(vendor)),
        }
    }

    #[test]
    fn test_sse_parser_single_line() {
        let mut parser = SseParser::new();
        let events = parser.feed(b"data: {\"content\":\"hello\"}\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0], "{\"content\":\"hello\"}");
    }

    #[test]
    fn test_sse_parser_multiple_lines() {
        let mut parser = SseParser::new();
        let events = parser.feed(b"data: {\"a\":1}\ndata: {\"b\":2}\n");
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn test_sse_parser_partial_then_complete() {
        let mut parser = SseParser::new();
        let events = parser.feed(b"data: {\"par");
        assert!(events.is_empty());
        let events = parser.feed(b"tial\":true}\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0], "{\"partial\":true}");
    }

    #[test]
    fn test_sse_parser_done() {
        let mut parser = SseParser::new();
        let events = parser.feed(b"data: [DONE]\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0], "[DONE]");
    }

    #[test]
    fn test_sse_parser_ignores_empty_lines() {
        let mut parser = SseParser::new();
        let events = parser.feed(b"\n\ndata: test\n\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0], "test");
    }

    #[test]
    fn test_stream_accumulator_content() {
        let mut acc = StreamAccumulator::new();
        acc.push_content("Hello");
        acc.push_content(" world");
        let msg = acc.into_message();
        assert_eq!(msg.content.as_deref(), Some("Hello world"));
        assert!(msg.tool_calls.is_none());
    }

    #[test]
    fn test_stream_accumulator_tool_calls() {
        let mut acc = StreamAccumulator::new();
        acc.push_tool_call_delta(&StreamToolCallDelta {
            index: 0,
            id: Some("call_123".into()),
            function: Some(crate::types::StreamFunctionDelta {
                name: Some("read".into()),
                arguments: Some("{\"pa".into()),
            }),
        });
        acc.push_tool_call_delta(&StreamToolCallDelta {
            index: 0,
            id: None,
            function: Some(crate::types::StreamFunctionDelta {
                name: None,
                arguments: Some("th\":\"/tmp\"}".into()),
            }),
        });

        let msg = acc.into_message();
        let tool_calls = msg.tool_calls.expect("tool calls should exist");
        assert_eq!(tool_calls[0].function.arguments, "{\"path\":\"/tmp\"}");
    }

    #[test]
    fn test_provider_build_request() {
        let messages = vec![AgentMessage::user("hello")];
        let tools = vec![];
        let req =
            OpenAiCompatibleProvider::build_request(&messages, &tools, "gpt-4o", false);

        assert_eq!(req.model, "gpt-4o");
        assert_eq!(req.messages.len(), 1);
        assert!(!req.stream);
        assert!(req.tools.is_none());
    }

    #[test]
    fn test_probe_request_uses_prompt_and_max_tokens() {
        let req = OpenAiCompatibleProvider::build_probe_request(
            "1+1=?",
            "gpt-4o-mini",
            1,
            ReasoningMode::Off,
        );
        assert_eq!(req.max_tokens, Some(1));
        assert_eq!(req.messages[0].content.as_deref(), Some("1+1=?"));
    }

    #[test]
    fn test_provider_client_selection() {
        let openai = ProviderClient::new(compatible_provider(
            ProviderVendor::OpenAi,
            "https://api.openai.com/v1",
        ));
        assert!(matches!(openai, ProviderClient::OpenAi(_)));

        let anthropic = ProviderClient::new(compatible_provider(
            ProviderVendor::Anthropic,
            "https://api.anthropic.com",
        ));
        assert!(matches!(anthropic, ProviderClient::Anthropic(_)));

        let gemini = ProviderClient::new(compatible_provider(
            ProviderVendor::Gemini,
            "https://generativelanguage.googleapis.com/v1beta",
        ));
        assert!(matches!(gemini, ProviderClient::Gemini(_)));
    }
}
