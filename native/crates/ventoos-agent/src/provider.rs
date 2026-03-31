//! LLM Provider — OpenAI-compatible API client with streaming support.

use std::time::Duration;

use reqwest::Client;
use tokio::sync::mpsc;
use tokio_stream::StreamExt;
use tracing::debug;

use crate::types::{
    AgentError, AgentMessage, OpenAiErrorResponse, OpenAiRequest, OpenAiResponse,
    OpenAiStreamChunk, ProviderConfig, StreamEvent, StreamToolCallDelta, ToolCall, ToolDefinition,
    FunctionCall,
};

/// HTTP client wrapper for calling OpenAI-compatible LLM APIs.
pub struct OpenAiProvider {
    client: Client,
    config: ProviderConfig,
}

impl OpenAiProvider {
    pub fn new(config: ProviderConfig) -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");
        Self { client, config }
    }

    /// Non-streaming chat completion.
    pub async fn chat(
        &self,
        messages: &[AgentMessage],
        tools: &[ToolDefinition],
        model: Option<&str>,
    ) -> Result<AgentMessage, AgentError> {
        let url = format!("{}/chat/completions", self.config.base_url.trim_end_matches('/'));
        let model = model.unwrap_or(&self.config.default_model);

        let body = Self::build_request(messages, tools, model, false);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            if let Ok(err) = serde_json::from_str::<OpenAiErrorResponse>(&text) {
                return Err(AgentError::Provider(format!(
                    "API error ({}): {}",
                    status, err.error.message
                )));
            }
            return Err(AgentError::Provider(format!("API error ({status}): {text}")));
        }

        let data: OpenAiResponse = response.json().await?;
        let choice = data
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| AgentError::Provider("Empty response from API".into()))?;

        Ok(choice.message.to_agent_message())
    }

    /// Streaming chat completion — sends `StreamEvent`s through the provided channel.
    ///
    /// Returns the accumulated assistant message when the stream is complete.
    pub async fn chat_stream(
        &self,
        messages: &[AgentMessage],
        tools: &[ToolDefinition],
        model: Option<&str>,
        tx: &mpsc::Sender<StreamEvent>,
    ) -> Result<AgentMessage, AgentError> {
        let url = format!("{}/chat/completions", self.config.base_url.trim_end_matches('/'));
        let model = model.unwrap_or(&self.config.default_model);

        let body = Self::build_request(messages, tools, model, true);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            if let Ok(err) = serde_json::from_str::<OpenAiErrorResponse>(&text) {
                return Err(AgentError::Provider(format!(
                    "API error ({}): {}",
                    status, err.error.message
                )));
            }
            return Err(AgentError::Provider(format!("API error ({status}): {text}")));
        }

        // Parse SSE stream
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
                            // Handle content delta
                            if let Some(content) = &choice.delta.content
                                && !content.is_empty() {
                                    accumulator.push_content(content);
                                    let _ = tx
                                        .send(StreamEvent::ContentDelta {
                                            content: content.clone(),
                                        })
                                        .await;
                                }

                            // Handle tool call deltas
                            if let Some(tool_calls) = &choice.delta.tool_calls {
                                for tc_delta in tool_calls {
                                    accumulator.push_tool_call_delta(tc_delta);
                                }
                            }

                            // Handle finish
                            if choice.finish_reason.as_deref() == Some("tool_calls")
                                || choice.finish_reason.as_deref() == Some("stop")
                            {
                                // Stream complete for this choice
                            }
                        }
                    }
                    Err(e) => {
                        debug!("Failed to parse stream chunk: {e}, data: {data}");
                    }
                }
            }
        }

        Ok(accumulator.into_message())
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
            temperature: Some(0.7),
            max_tokens: None,
            stream,
        }
    }
}

// ─── SSE Parser ────────────────────────────────────────────────────────────

/// Simple line-based SSE parser for streaming HTTP responses.
struct SseParser {
    buffer: String,
}

impl SseParser {
    fn new() -> Self {
        Self {
            buffer: String::new(),
        }
    }

    /// Feed raw bytes into the parser; returns any complete SSE data payloads.
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

// ─── Stream Accumulator ────────────────────────────────────────────────────

/// Accumulates streaming deltas into a complete assistant message.
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
        // Ensure we have enough slots
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
                    .map(|b| ToolCall {
                        id: b.id,
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name: b.name,
                            arguments: b.arguments,
                        },
                    })
                    .collect(),
            )
        };

        let content = if self.content.is_empty() {
            None
        } else {
            Some(self.content)
        };

        AgentMessage {
            role: crate::types::MessageRole::Assistant,
            content,
            tool_calls,
            tool_call_id: None,
            name: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

        // First delta: tool call start
        acc.push_tool_call_delta(&StreamToolCallDelta {
            index: 0,
            id: Some("call_123".into()),
            function: Some(crate::types::StreamFunctionDelta {
                name: Some("read".into()),
                arguments: Some("{\"pa".into()),
            }),
        });

        // Second delta: argument continuation
        acc.push_tool_call_delta(&StreamToolCallDelta {
            index: 0,
            id: None,
            function: Some(crate::types::StreamFunctionDelta {
                name: None,
                arguments: Some("th\":\"/tmp\"}".into()),
            }),
        });

        let msg = acc.into_message();
        assert!(msg.content.is_none());
        let tcs = msg.tool_calls.unwrap();
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].id, "call_123");
        assert_eq!(tcs[0].function.name, "read");
        assert_eq!(tcs[0].function.arguments, "{\"path\":\"/tmp\"}");
    }

    #[test]
    fn test_provider_build_request() {
        let messages = vec![AgentMessage::user("hello")];
        let tools = vec![];
        let req = OpenAiProvider::build_request(&messages, &tools, "gpt-4o", false);

        assert_eq!(req.model, "gpt-4o");
        assert_eq!(req.messages.len(), 1);
        assert!(!req.stream);
        assert!(req.tools.is_none());
    }
}
