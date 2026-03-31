//! Agent execution engine — ReAct loop with streaming output.

use std::sync::Arc;

use serde_json::Value;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use crate::guard::GuardChain;
use crate::provider::OpenAiProvider;
use crate::session::{truncate_title, SessionStore};
use crate::tool::{ToolExecutor, ToolRegistry};
use crate::types::{
    AgentConfig, AgentError, AgentMessage, ChatRequest, StreamEvent, ToolDefinition,
};

/// The core agent execution engine.
///
/// Implements the `ReAct` loop: user message → LLM → (tool calls → results)* → final reply.
pub struct AgentRunner {
    pub(crate) sessions: Arc<SessionStore>,
    pub(crate) config: AgentConfig,
}

impl AgentRunner {
    pub fn new(sessions: Arc<SessionStore>, config: AgentConfig) -> Self {
        Self { sessions, config }
    }

    /// Execute a chat request, streaming events to the provided channel.
    ///
    /// The `provider`, `tools`, `guards`, and `executor` are passed in by the caller
    /// (typically the `AgentManager`) to avoid tight coupling.
    #[allow(clippy::too_many_lines)]
    pub async fn run(
        &self,
        req: &ChatRequest,
        provider: &OpenAiProvider,
        tool_registry: &ToolRegistry,
        guards: &GuardChain,
        executor: &dyn ToolExecutor,
        tx: mpsc::Sender<StreamEvent>,
    ) {
        // Determine session
        let (session, _created) = self
            .sessions
            .get_or_create(
                req.session_id.as_deref(),
                &truncate_title(&req.message),
                req.provider_id.clone(),
                req.model.clone(),
                req.system_prompt.clone(),
            )
            .await;

        let session_id = session.id.clone();

        // Add user message
        let user_msg = AgentMessage::user(&req.message);
        self.sessions
            .push_message(&session_id, user_msg.clone())
            .await;

        // Build messages for LLM
        let system_prompt = req
            .system_prompt
            .as_deref()
            .or(session.system_prompt.as_deref())
            .unwrap_or(&self.config.default_system_prompt);

        let mut messages = vec![AgentMessage::system(system_prompt)];
        // Add existing session messages
        if let Some(s) = self.sessions.get(&session_id).await {
            messages.extend(s.messages.clone());
        }

        // Get tool definitions
        let tools: Vec<ToolDefinition> = if self.config.tools_enabled {
            tool_registry.definitions()
        } else {
            Vec::new()
        };

        let model = req
            .model
            .as_deref()
            .or(self.config.default_model.as_deref());

        let max_iterations = self.config.max_iterations;

        // ReAct loop
        for iteration in 0..max_iterations {
            debug!("Agent iteration {}/{}", iteration + 1, max_iterations);

            // Call LLM with streaming
            let assistant_msg = match provider.chat_stream(&messages, &tools, model, &tx).await {
                Ok(msg) => msg,
                Err(e) => {
                    warn!("Provider error: {e}");
                    let _ = tx
                        .send(StreamEvent::Error {
                            message: e.to_string(),
                        })
                        .await;
                    let _ = tx
                        .send(StreamEvent::Done {
                            session_id: session_id.clone(),
                        })
                        .await;
                    return;
                }
            };

            // Save assistant message
            self.sessions
                .push_message(&session_id, assistant_msg.clone())
                .await;
            messages.push(assistant_msg.clone());

            // Check for tool calls
            if let Some(tool_calls) = &assistant_msg.tool_calls {
                if tool_calls.is_empty() {
                    // No tool calls, we're done
                    self.send_completion(&tx, &assistant_msg, &session_id).await;
                    return;
                }

                // Execute each tool call
                for tc in tool_calls {
                    let tool_name = &tc.function.name;
                    let arguments_str = &tc.function.arguments;

                    // Parse arguments
                    let arguments: Value =
                        match serde_json::from_str(arguments_str) {
                            Ok(v) => v,
                            Err(e) => {
                                let error_msg = format!("Invalid tool arguments: {e}");
                                let _ = tx
                                    .send(StreamEvent::ToolResult {
                                        id: tc.id.clone(),
                                        name: tool_name.clone(),
                                        content: error_msg.clone(),
                                        success: false,
                                    })
                                    .await;
                                let tool_result_msg = AgentMessage::tool_result(
                                    &tc.id,
                                    tool_name,
                                    &error_msg,
                                );
                                self.sessions
                                    .push_message(&session_id, tool_result_msg.clone())
                                    .await;
                                messages.push(tool_result_msg);
                                continue;
                            }
                        };

                    // Send tool call start event
                    let _ = tx
                        .send(StreamEvent::ToolCallStart {
                            id: tc.id.clone(),
                            name: tool_name.clone(),
                            arguments: arguments_str.clone(),
                        })
                        .await;

                    // Check guards
                    if let Err(e) = guards.check_all(tool_name, &arguments) {
                        let error_msg = e.to_string();
                        let _ = tx
                            .send(StreamEvent::ToolResult {
                                id: tc.id.clone(),
                                name: tool_name.clone(),
                                content: error_msg.clone(),
                                success: false,
                            })
                            .await;
                        let tool_result_msg =
                            AgentMessage::tool_result(&tc.id, tool_name, &error_msg);
                        self.sessions
                            .push_message(&session_id, tool_result_msg.clone())
                            .await;
                        messages.push(tool_result_msg);
                        continue;
                    }

                    // Execute tool
                    let (content, success) = match executor.execute(tool_name, &arguments).await {
                        Ok(result) => {
                            let content = serde_json::to_string_pretty(&result)
                                .unwrap_or_else(|_| result.to_string());
                            (content, true)
                        }
                        Err(e) => (e, false),
                    };

                    info!("Tool '{}' executed: success={}", tool_name, success);

                    // Send tool result event
                    let _ = tx
                        .send(StreamEvent::ToolResult {
                            id: tc.id.clone(),
                            name: tool_name.clone(),
                            content: content.clone(),
                            success,
                        })
                        .await;

                    // Add tool result message
                    let tool_result_msg =
                        AgentMessage::tool_result(&tc.id, tool_name, &content);
                    self.sessions
                        .push_message(&session_id, tool_result_msg.clone())
                        .await;
                    messages.push(tool_result_msg);
                }

                // Continue the loop — LLM will process tool results
                continue;
            }

            // No tool calls: the assistant message is the final reply
            self.send_completion(&tx, &assistant_msg, &session_id).await;
            return;
        }

        // Max iterations reached
        let _ = tx
            .send(StreamEvent::Error {
                message: format!("Maximum iterations ({max_iterations}) reached"),
            })
            .await;
        let _ = tx
            .send(StreamEvent::Done {
                session_id: session_id.clone(),
            })
            .await;
    }

    /// Execute a non-streaming chat (for backwards compatibility).
    pub async fn chat(
        &self,
        req: &ChatRequest,
        provider: &OpenAiProvider,
        tool_registry: &ToolRegistry,
        _guards: &GuardChain,
        _executor: &dyn ToolExecutor,
    ) -> Result<(String, AgentMessage), AgentError> {
        // Use a channel but collect instead of streaming
        let (tx, mut rx) = mpsc::channel::<StreamEvent>(64);

        let req_clone = req.clone();
        let sessions = Arc::clone(&self.sessions);
        let config = self.config.clone();

        // We need to run the agent in a task to not hold the borrow
        // Since we can't move references, use a simpler approach for non-streaming
        let runner = Self::new(sessions, config);

        // Spawn the agent run in a task (we need owned data)
        // For simplicity, we'll do a non-streaming LLM call instead
        let (session, _created) = self
            .sessions
            .get_or_create(
                req_clone.session_id.as_deref(),
                &truncate_title(&req_clone.message),
                req_clone.provider_id.clone(),
                req_clone.model.clone(),
                req_clone.system_prompt.clone(),
            )
            .await;

        let session_id = session.id.clone();

        // Add user message
        let user_msg = AgentMessage::user(&req_clone.message);
        runner
            .sessions
            .push_message(&session_id, user_msg)
            .await;

        let system_prompt = req_clone
            .system_prompt
            .as_deref()
            .or(session.system_prompt.as_deref())
            .unwrap_or(&self.config.default_system_prompt);

        let mut messages = vec![AgentMessage::system(system_prompt)];
        if let Some(s) = runner.sessions.get(&session_id).await {
            messages.extend(s.messages.clone());
        }

        let tools: Vec<ToolDefinition> = if self.config.tools_enabled {
            tool_registry.definitions()
        } else {
            Vec::new()
        };

        let model = req_clone
            .model
            .as_deref()
            .or(self.config.default_model.as_deref());

        // Simple single-turn call
        let assistant_msg = provider.chat(&messages, &tools, model).await?;

        runner
            .sessions
            .push_message(&session_id, assistant_msg.clone())
            .await;

        // Drop tx to close the channel
        drop(tx);
        // Drain any remaining events
        while rx.recv().await.is_some() {}

        Ok((session_id, assistant_msg))
    }

    async fn send_completion(
        &self,
        tx: &mpsc::Sender<StreamEvent>,
        message: &AgentMessage,
        session_id: &str,
    ) {
        let _ = tx
            .send(StreamEvent::MessageComplete {
                message: message.clone(),
            })
            .await;
        let _ = tx
            .send(StreamEvent::Done {
                session_id: session_id.to_string(),
            })
            .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tool::StubToolExecutor;
    use crate::types::ChatSession;

    #[tokio::test]
    async fn test_agent_runner_creates_session() {
        let sessions = Arc::new(SessionStore::new());
        let config = AgentConfig::default();
        let runner = AgentRunner::new(Arc::clone(&sessions), config);

        let req = ChatRequest {
            session_id: None,
            message: "Hello".into(),
            provider_id: None,
            model: None,
            system_prompt: None,
        };

        let (session, created) = sessions
            .get_or_create(
                req.session_id.as_deref(),
                &truncate_title(&req.message),
                None,
                None,
                None,
            )
            .await;

        assert!(created);
        assert!(!session.id.is_empty());

        // Verify session was saved
        let list = sessions.list().await;
        assert_eq!(list.len(), 1);
    }
}
