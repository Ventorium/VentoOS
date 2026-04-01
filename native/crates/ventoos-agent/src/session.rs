//! Session management — in-memory session store for agent conversations.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::types::{AgentMessage, ChannelConversationBinding, ChannelKind, ChatSession};

/// In-memory store for chat sessions.
pub struct SessionStore {
    sessions: Arc<RwLock<HashMap<String, ChatSession>>>,
    channel_bindings: Arc<RwLock<HashMap<String, ChannelConversationBinding>>>,
}

impl SessionStore {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            channel_bindings: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new session with the given ID and optional parameters.
    pub async fn create(
        &self,
        id: String,
        title: String,
        provider_id: Option<String>,
        model: Option<String>,
        system_prompt: Option<String>,
        agent_profile_id: Option<String>,
    ) -> ChatSession {
        let now = chrono::Utc::now().to_rfc3339();
        let session = ChatSession {
            id: id.clone(),
            title,
            provider_id,
            model,
            system_prompt,
            agent_profile_id,
            channel_binding: None,
            messages: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        };
        self.sessions
            .write()
            .await
            .insert(id, session.clone());
        session
    }

    /// Get a session by ID.
    pub async fn get(&self, id: &str) -> Option<ChatSession> {
        self.sessions.read().await.get(id).cloned()
    }

    /// List all sessions, sorted by most recently updated.
    pub async fn list(&self) -> Vec<ChatSession> {
        let sessions = self.sessions.read().await;
        let mut list: Vec<_> = sessions.values().cloned().collect();
        list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        list
    }

    /// Delete a session by ID.
    pub async fn delete(&self, id: &str) -> bool {
        self.sessions.write().await.remove(id).is_some()
    }

    /// Append a message to a session and update the timestamp.
    pub async fn push_message(&self, session_id: &str, message: AgentMessage) -> bool {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.messages.push(message);
            session.updated_at = chrono::Utc::now().to_rfc3339();
            true
        } else {
            false
        }
    }

    /// Get or create a session, returning the session and whether it was newly created.
    pub async fn get_or_create(
        &self,
        session_id: Option<&str>,
        title: &str,
        provider_id: Option<String>,
        model: Option<String>,
        system_prompt: Option<String>,
        agent_profile_id: Option<String>,
    ) -> (ChatSession, bool) {
        if let Some(id) = session_id
            && let Some(session) = self.get(id).await {
                return (session, false);
            }

        let id = session_id.map_or_else(|| uuid::Uuid::new_v4().to_string(), String::from);

        let session = self
            .create(
                id,
                title.to_string(),
                provider_id,
                model,
                system_prompt,
                agent_profile_id,
            )
            .await;
        (session, true)
    }

    /// Bind an external channel conversation to a `VentoOS` chat session.
    pub async fn bind_channel_conversation(&self, binding: ChannelConversationBinding) {
        self.channel_bindings
            .write()
            .await
            .insert(binding.key(), binding.clone());

        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(&binding.session_id) {
            if session.agent_profile_id.is_none() {
                session.agent_profile_id.clone_from(&binding.agent_profile_id);
            }
            session.channel_binding = Some(binding);
            session.updated_at = chrono::Utc::now().to_rfc3339();
        }
    }

    /// Resolve a session ID from a channel conversation tuple.
    pub async fn find_session_by_channel(
        &self,
        channel_id: &str,
        kind: ChannelKind,
        external_conversation_id: &str,
        external_thread_id: Option<&str>,
    ) -> Option<String> {
        let key = ChannelConversationBinding::lookup_key(
            channel_id,
            kind,
            external_conversation_id,
            external_thread_id,
        );

        self.channel_bindings
            .read()
            .await
            .get(&key)
            .map(|binding| binding.session_id.clone())
    }
}

impl Default for SessionStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Truncate a string for use as a session title.
pub fn truncate_title(s: &str) -> String {
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
    use crate::types::{ChannelConversationBinding, ChannelKind, MessageRole};

    #[tokio::test]
    async fn test_create_session() {
        let store = SessionStore::new();
        let session = store
            .create(
                "s1".into(),
                "Test Session".into(),
                None,
                None,
                None,
                None,
            )
            .await;
        assert_eq!(session.id, "s1");
        assert_eq!(session.title, "Test Session");
        assert!(session.messages.is_empty());
    }

    #[tokio::test]
    async fn test_get_session() {
        let store = SessionStore::new();
        store
            .create("s1".into(), "Test".into(), None, None, None, None)
            .await;
        let session = store.get("s1").await;
        assert!(session.is_some());
        assert!(store.get("nonexistent").await.is_none());
    }

    #[tokio::test]
    async fn test_list_sessions() {
        let store = SessionStore::new();
        store
            .create("s1".into(), "First".into(), None, None, None, None)
            .await;
        store
            .create("s2".into(), "Second".into(), None, None, None, None)
            .await;
        let list = store.list().await;
        assert_eq!(list.len(), 2);
    }

    #[tokio::test]
    async fn test_delete_session() {
        let store = SessionStore::new();
        store
            .create("s1".into(), "Test".into(), None, None, None, None)
            .await;
        assert!(store.delete("s1").await);
        assert!(!store.delete("s1").await);
        assert!(store.get("s1").await.is_none());
    }

    #[tokio::test]
    async fn test_push_message() {
        let store = SessionStore::new();
        store
            .create("s1".into(), "Test".into(), None, None, None, None)
            .await;

        let msg = AgentMessage::user("Hello");
        assert!(store.push_message("s1", msg).await);
        assert!(!store.push_message("nonexistent", AgentMessage::user("x")).await);

        let session = store.get("s1").await.unwrap();
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].role, MessageRole::User);
    }

    #[tokio::test]
    async fn test_get_or_create_new() {
        let store = SessionStore::new();
        let (session, created) = store
            .get_or_create(None, "New Session", None, None, None, None)
            .await;
        assert!(created);
        assert!(!session.id.is_empty());
    }

    #[tokio::test]
    async fn test_get_or_create_existing() {
        let store = SessionStore::new();
        store
            .create("s1".into(), "Existing".into(), None, None, None, None)
            .await;
        let (session, created) = store
            .get_or_create(Some("s1"), "Ignored", None, None, None, None)
            .await;
        assert!(!created);
        assert_eq!(session.title, "Existing");
    }

    #[tokio::test]
    async fn test_bind_and_resolve_channel_conversation() {
        let store = SessionStore::new();
        store
            .create("s1".into(), "Channel Session".into(), None, None, None, None)
            .await;

        let binding = ChannelConversationBinding::new(
            "channel-telegram".into(),
            ChannelKind::Telegram,
            "chat-42".into(),
            Some("thread-7".into()),
            "user-99".into(),
            "s1".into(),
            Some("general-assistant".into()),
        );

        store.bind_channel_conversation(binding.clone()).await;

        let resolved = store
            .find_session_by_channel(
                "channel-telegram",
                ChannelKind::Telegram,
                "chat-42",
                Some("thread-7"),
            )
            .await;

        assert_eq!(resolved.as_deref(), Some("s1"));

        let session = store.get("s1").await.expect("session exists");
        assert_eq!(
            session
                .channel_binding
                .as_ref()
                .map(|item| item.external_conversation_id.as_str()),
            Some("chat-42")
        );
        assert_eq!(session.agent_profile_id.as_deref(), Some("general-assistant"));
    }

    #[tokio::test]
    async fn test_find_session_by_channel_without_thread() {
        let store = SessionStore::new();
        store
            .create("s1".into(), "Channel Session".into(), None, None, None, None)
            .await;

        store
            .bind_channel_conversation(ChannelConversationBinding::new(
                "channel-feishu".into(),
                ChannelKind::Feishu,
                "conversation-1".into(),
                None,
                "open-id-1".into(),
                "s1".into(),
                None,
            ))
            .await;

        let resolved = store
            .find_session_by_channel(
                "channel-feishu",
                ChannelKind::Feishu,
                "conversation-1",
                None,
            )
            .await;

        assert_eq!(resolved.as_deref(), Some("s1"));
    }

    #[test]
    fn test_truncate_title_short() {
        assert_eq!(truncate_title("Short title"), "Short title");
    }

    #[test]
    fn test_truncate_title_long() {
        let long = "a".repeat(100);
        let result = truncate_title(&long);
        assert!(result.ends_with("..."));
        assert!(result.len() <= 53 + 3); // 50 chars + "..."
    }
}
