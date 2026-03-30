use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing::info;

use crate::types::*;

/// AI Agent manager.
/// Manages chat sessions, delegates to configured agent engines.
pub struct AgentManager {
    sessions: Arc<RwLock<HashMap<String, ChatSession>>>,
    config: Arc<RwLock<AgentConfig>>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            config: Arc::new(RwLock::new(AgentConfig {
                engine: AgentEngine::ClaudeCode,
                enabled: true,
                api_key: None,
                endpoint: None,
            })),
        }
    }

    pub async fn get_config(&self) -> AgentConfig {
        self.config.read().await.clone()
    }

    pub async fn update_config(&self, new_config: AgentConfig) {
        *self.config.write().await = new_config;
    }

    /// List all chat sessions.
    pub async fn list_sessions(&self) -> Vec<ChatSession> {
        let sessions = self.sessions.read().await;
        let mut list: Vec<_> = sessions.values().cloned().collect();
        list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        list
    }

    pub async fn get_session(&self, id: &str) -> Option<ChatSession> {
        self.sessions.read().await.get(id).cloned()
    }

    pub async fn delete_session(&self, id: &str) -> bool {
        self.sessions.write().await.remove(id).is_some()
    }

    /// Send a message and get a response.
    /// Current implementation returns a stub response; real implementation would
    /// call Claude Code SDK or configured agent engine.
    pub async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let session_id = req
            .session_id
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let user_msg = ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            role: ChatRole::User,
            content: req.message.clone(),
            timestamp: now.clone(),
        };

        // Generate stub response (real impl would invoke agent engine)
        let assistant_content = self.generate_response(&req.message).await;

        let assistant_msg = ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            role: ChatRole::Assistant,
            content: assistant_content,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        // Update or create session
        let mut sessions = self.sessions.write().await;
        let session = sessions
            .entry(session_id.clone())
            .or_insert_with(|| ChatSession {
                id: session_id.clone(),
                title: truncate_title(&req.message),
                messages: Vec::new(),
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        session.messages.push(user_msg);
        session.messages.push(assistant_msg.clone());
        session.updated_at = chrono::Utc::now().to_rfc3339();

        info!(
            "Chat session {session_id}: {} messages",
            session.messages.len()
        );

        Ok(ChatResponse {
            session_id,
            message: assistant_msg,
        })
    }

    /// Stub response generator. Will be replaced with real agent integration.
    async fn generate_response(&self, message: &str) -> String {
        let lower = message.to_lowercase();
        if lower.contains("help") || lower.contains("帮助") {
            "I can help with Kubernetes, database, Redis, and file operations. What would you like to do?".into()
        } else if lower.contains("k8s") || lower.contains("kubernetes") || lower.contains("pod") {
            "I can help with Kubernetes operations. Try asking about pods, deployments, services, or cluster status.".into()
        } else if lower.contains("sql") || lower.contains("database") || lower.contains("数据库") {
            "I can help with database queries. Describe the table or data you're looking for.".into()
        } else if lower.contains("redis") {
            "I can help with Redis operations. What key or command would you like to work with?".into()
        } else {
            format!("Received: \"{message}\". AI agent integration is being set up. This will connect to your configured agent engine for intelligent responses.")
        }
    }
}

impl Default for AgentManager {
    fn default() -> Self {
        Self::new()
    }
}

fn truncate_title(s: &str) -> String {
    let chars: Vec<char> = s.chars().take(50).collect();
    let result: String = chars.into_iter().collect();
    if s.chars().count() > 50 {
        format!("{result}...")
    } else {
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_chat_creates_session() {
        let mgr = AgentManager::new();
        let resp = mgr
            .chat(ChatRequest {
                session_id: None,
                message: "Hello".into(),
                context: None,
            })
            .await
            .unwrap();

        assert!(!resp.session_id.is_empty());
        assert_eq!(resp.message.role, ChatRole::Assistant);

        let sessions = mgr.list_sessions().await;
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].messages.len(), 2); // user + assistant
    }

    #[tokio::test]
    async fn test_chat_continues_session() {
        let mgr = AgentManager::new();
        let r1 = mgr
            .chat(ChatRequest {
                session_id: None,
                message: "First".into(),
                context: None,
            })
            .await
            .unwrap();

        let _r2 = mgr
            .chat(ChatRequest {
                session_id: Some(r1.session_id.clone()),
                message: "Second".into(),
                context: None,
            })
            .await
            .unwrap();

        let session = mgr.get_session(&r1.session_id).await.unwrap();
        assert_eq!(session.messages.len(), 4); // 2 pairs
    }

    #[tokio::test]
    async fn test_delete_session() {
        let mgr = AgentManager::new();
        let resp = mgr
            .chat(ChatRequest {
                session_id: None,
                message: "temp".into(),
                context: None,
            })
            .await
            .unwrap();
        assert!(mgr.delete_session(&resp.session_id).await);
        assert!(mgr.get_session(&resp.session_id).await.is_none());
    }
}
