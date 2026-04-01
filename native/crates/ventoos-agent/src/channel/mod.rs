//! Channel runtime for external chat platforms.
//!
//! Provides:
//! - **ChannelAdapter** trait — unified interface for verify / normalize / send
//! - **Concrete adapters** — Telegram, DingTalk, Feishu, WeCom, QQ
//! - **ChannelRegistry** — runtime adapter registry keyed by channel config ID

pub mod dingtalk;
pub mod feishu;
pub mod qq;
pub mod telegram;
pub mod wecom;

use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::types::{AgentError, ChannelKind, ChannelMessageEvent};

pub(crate) type BoxFuture<'a, T> = Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

// ─── Core Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InboundChannelRequest {
    pub channel_id: String,
    pub kind: ChannelKind,
    pub raw_body: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub query_params: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VerifiedChannelRequest {
    pub channel_id: String,
    pub kind: ChannelKind,
    pub raw_body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelOutboundMessage {
    pub channel_id: String,
    pub kind: ChannelKind,
    pub external_conversation_id: String,
    pub external_thread_id: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelSendResult {
    pub accepted: bool,
    pub external_message_id: Option<String>,
}

// ─── Adapter Trait ──────────────────────────────────────────────────────────

pub trait ChannelAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn kind(&self) -> ChannelKind;
    fn verify(&self, request: &InboundChannelRequest) -> Result<VerifiedChannelRequest, AgentError>;
    fn normalize(&self, inbound: VerifiedChannelRequest) -> Result<ChannelMessageEvent, AgentError>;
    fn send<'a>(
        &'a self,
        outbound: ChannelOutboundMessage,
    ) -> BoxFuture<'a, Result<ChannelSendResult, AgentError>>;
}

// ─── Registry ───────────────────────────────────────────────────────────────

/// Runtime registry that maps channel config IDs → concrete adapter instances.
pub struct ChannelRegistry {
    adapters: Arc<RwLock<HashMap<String, Arc<dyn ChannelAdapter>>>>,
}

impl ChannelRegistry {
    #[must_use]
    pub fn new() -> Self {
        Self {
            adapters: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register(&self, adapter: Arc<dyn ChannelAdapter>) {
        self.adapters
            .write()
            .await
            .insert(adapter.id().to_string(), adapter);
    }

    pub async fn get(&self, channel_id: &str) -> Option<Arc<dyn ChannelAdapter>> {
        self.adapters.read().await.get(channel_id).cloned()
    }

    pub async fn list(&self) -> Vec<String> {
        self.adapters.read().await.keys().cloned().collect()
    }

    pub async fn remove(&self, channel_id: &str) -> bool {
        self.adapters.write().await.remove(channel_id).is_some()
    }
}

impl Default for ChannelRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/// Extract the bot token from credentials JSON.
fn extract_token(credentials: &serde_json::Value) -> Result<String, AgentError> {
    credentials
        .get("token")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| AgentError::ConfigError("missing credentials.token".into()))
}

/// Extract the app secret from credentials JSON.
fn extract_secret(credentials: &serde_json::Value) -> Result<String, AgentError> {
    credentials
        .get("secret")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| AgentError::ConfigError("missing credentials.secret".into()))
}

/// Extract the app ID from credentials JSON.
fn extract_app_id(credentials: &serde_json::Value) -> Result<String, AgentError> {
    credentials
        .get("app_id")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| AgentError::ConfigError("missing credentials.app_id".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_token() {
        let creds = serde_json::json!({"token": "bot123"});
        assert_eq!(extract_token(&creds).unwrap(), "bot123");
        assert!(extract_token(&serde_json::json!({})).is_err());
    }

    #[test]
    fn test_extract_secret() {
        let creds = serde_json::json!({"secret": "s3cret"});
        assert_eq!(extract_secret(&creds).unwrap(), "s3cret");
    }

    #[test]
    fn test_extract_app_id() {
        let creds = serde_json::json!({"app_id": "app1"});
        assert_eq!(extract_app_id(&creds).unwrap(), "app1");
    }

    #[tokio::test]
    async fn test_registry_register_and_get() {
        let reg = ChannelRegistry::new();
        let adapter = Arc::new(crate::channel::telegram::TelegramAdapter::new(
            "ch-tg".into(),
            "123456:ABC-DEF".into(),
        ));
        reg.register(adapter).await;

        assert!(reg.get("ch-tg").await.is_some());
        assert!(reg.get("nonexistent").await.is_none());

        let ids = reg.list().await;
        assert_eq!(ids, vec!["ch-tg"]);
    }

    #[tokio::test]
    async fn test_registry_remove() {
        let reg = ChannelRegistry::new();
        let adapter = Arc::new(crate::channel::telegram::telegram_test_adapter("ch-tg"));
        reg.register(adapter).await;
        assert!(reg.remove("ch-tg").await);
        assert!(!reg.remove("ch-tg").await);
    }
}
