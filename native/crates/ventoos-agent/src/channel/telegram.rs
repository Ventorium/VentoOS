//! Telegram Bot API adapter.
//!
//! Supports both webhook and long-polling inbound modes.
//! Outbound messages are sent via the `sendMessage` API.

use serde::Deserialize;

use crate::channel::{
    ChannelAdapter, ChannelKind, ChannelSendResult, InboundChannelRequest,
    VerifiedChannelRequest,
};
use crate::types::{
    AgentError, ChannelIdentity, ChannelMessageEvent,
};

/// Telegram Bot API adapter.
pub struct TelegramAdapter {
    channel_id: String,
    token: String,
}

impl TelegramAdapter {
    #[must_use]
    pub fn new(channel_id: String, token: String) -> Self {
        Self { channel_id, token }
    }

    fn api_base(&self) -> String {
        format!("https://api.telegram.org/bot{}", self.token)
    }

    /// Verify a Telegram update by checking required fields in the JSON body.
    fn verify_update(&self, raw_body: &str) -> Result<TelegramUpdate, AgentError> {
        let update: TelegramUpdate =
            serde_json::from_str(raw_body).map_err(|e| AgentError::ChannelError {
                channel: "telegram".into(),
                detail: format!("invalid update JSON: {e}"),
            })?;

        if let Some(ref message) = update.message {
            if message.from.is_none() {
                return Err(AgentError::ChannelError {
                    channel: "telegram".into(),
                    detail: "update.message.from is missing".into(),
                });
            }
        } else if let Some(ref callback_query) = update.callback_query {
            if callback_query.from.is_none() {
                return Err(AgentError::ChannelError {
                    channel: "telegram".into(),
                    detail: "update.callback_query.from is missing".into(),
                });
            }
        } else {
            return Err(AgentError::ChannelError {
                channel: "telegram".into(),
                detail: "update has no message or callback_query".into(),
            });
        }

        Ok(update)
    }
}

impl ChannelAdapter for TelegramAdapter {
    fn id(&self) -> &str {
        &self.channel_id
    }

    fn kind(&self) -> ChannelKind {
        ChannelKind::Telegram
    }

    fn verify(&self, request: &InboundChannelRequest) -> Result<VerifiedChannelRequest, AgentError> {
        self.verify_update(&request.raw_body)?;
        Ok(VerifiedChannelRequest {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::Telegram,
            raw_body: request.raw_body.clone(),
        })
    }

    fn normalize(&self, inbound: VerifiedChannelRequest) -> Result<ChannelMessageEvent, AgentError> {
        let update = self.verify_update(&inbound.raw_body)?;
        // Extract non-field-moved data before partially moving update
        let update_id_str = update.update_id.to_string();
        let occurred_at = update.timestamp();

        let (message_text, chat_id, thread_id, from_user) = if let Some(msg) = update.message {
            let text = msg.text.unwrap_or_default();
            let user = msg.from.unwrap_or_default();
            (text, msg.chat.id, msg.message_thread_id, user)
        } else if let Some(cb) = update.callback_query {
            let text = cb.data.unwrap_or_default();
            let user = cb.from.unwrap_or_default();
            let chat_id = cb.message.as_ref().map(|m| m.chat.id).unwrap_or_default();
            (text, chat_id, None, user)
        } else {
            return Err(AgentError::ChannelError {
                channel: "telegram".into(),
                detail: "no actionable content in update".into(),
            });
        };

        if message_text.is_empty() {
            return Err(AgentError::ChannelError {
                channel: "telegram".into(),
                detail: "empty message text".into(),
            });
        }

        let conv_id = format!("{chat_id}");

        Ok(ChannelMessageEvent {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::Telegram,
            external_message_id: update_id_str,
            external_conversation_id: conv_id.clone(),
            external_thread_id: thread_id.map(|t| t.to_string()),
            sender: ChannelIdentity {
                channel_id: self.channel_id.clone(),
                kind: ChannelKind::Telegram,
                external_user_id: from_user.id.to_string(),
                external_conversation_id: conv_id,
                external_thread_id: thread_id.map(|t| t.to_string()),
            },
            content: message_text,
            occurred_at,
        })
    }

    fn send<'a>(
        &'a self,
        outbound: crate::channel::ChannelOutboundMessage,
    ) -> crate::channel::BoxFuture<'a, Result<ChannelSendResult, AgentError>> {
        Box::pin(async move {
        let url = format!("{}/sendMessage", self.api_base());
        let mut body = serde_json::json!({
            "chat_id": outbound.external_conversation_id,
            "text": outbound.content,
            "parse_mode": "Markdown",
        });

        if let Some(thread_id) = &outbound.external_thread_id {
            let thread_i64: i64 = thread_id
                .parse()
                .map_err(|_| AgentError::ChannelError {
                    channel: "telegram".into(),
                    detail: "invalid thread_id".into(),
                })?;
            body["message_thread_id"] = serde_json::json!(thread_i64);
        }

        let client = reqwest::Client::new();
        let resp = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AgentError::ChannelError {
                channel: "telegram".into(),
                detail: format!("send request failed: {e}"),
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AgentError::ChannelError {
                channel: "telegram".into(),
                detail: format!("sendMessage returned {status}: {text}"),
            });
        }

        let result: serde_json::Value = resp.json().await.map_err(|e| AgentError::ChannelError {
            channel: "telegram".into(),
            detail: format!("failed to parse sendMessage response: {e}"),
        })?;

        Ok(ChannelSendResult {
            accepted: true,
            external_message_id: result
                .get("result")
                .and_then(|r| r.get("message_id"))
                .and_then(|m| m.as_i64())
                .map(|m| m.to_string()),
        })
        })
    }
}

// ─── Telegram API Types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct TelegramUpdate {
    #[serde(default)]
    pub update_id: i64,
    #[serde(default)]
    pub message: Option<TelegramMessage>,
    #[serde(default)]
    pub callback_query: Option<TelegramCallbackQuery>,
}

impl TelegramUpdate {
    #[must_use]
    pub fn timestamp(&self) -> String {
        chrono::Utc::now().to_rfc3339()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelegramMessage {
    #[serde(default)]
    pub message_id: i64,
    #[serde(default)]
    pub from: Option<TelegramUser>,
    #[serde(default)]
    pub chat: TelegramChat,
    #[serde(default)]
    pub date: i64,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub message_thread_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct TelegramUser {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub is_bot: bool,
    #[serde(default)]
    pub first_name: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct TelegramChat {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub r#type: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelegramCallbackQuery {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub from: Option<TelegramUser>,
    #[serde(default)]
    pub message: Option<TelegramMessage>,
    #[serde(default)]
    pub data: Option<String>,
}

// ─── Test Helper ────────────────────────────────────────────────────────────

/// Create a Telegram adapter for testing (no real token needed for verify/normalize).
#[cfg(test)]
#[must_use]
pub fn telegram_test_adapter(channel_id: &str) -> TelegramAdapter {
    TelegramAdapter::new(channel_id.into(), "test-token".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_request(body: &str) -> InboundChannelRequest {
        InboundChannelRequest {
            channel_id: "ch-tg".into(),
            kind: ChannelKind::Telegram,
            raw_body: body.into(),
            headers: HashMap::new(),
            query_params: HashMap::new(),
        }
    }

    #[test]
    fn test_verify_valid_message() {
        let adapter = telegram_test_adapter("ch-tg");
        let body = r#"{
            "update_id": 42,
            "message": {
                "message_id": 1,
                "from": {"id": 100, "is_bot": false, "first_name": "Test"},
                "chat": {"id": 200, "type": "private"},
                "date": 1700000000,
                "text": "hello world"
            }
        }"#;
        let result = adapter.verify(&make_request(body));
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_invalid_json() {
        let adapter = telegram_test_adapter("ch-tg");
        let result = adapter.verify(&make_request("not json"));
        assert!(result.is_err());
    }

    #[test]
    fn test_verify_no_message() {
        let adapter = telegram_test_adapter("ch-tg");
        let body = r#"{"update_id": 42}"#;
        let result = adapter.verify(&make_request(body));
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_message() {
        let adapter = telegram_test_adapter("ch-tg");
        let body = r#"{
            "update_id": 42,
            "message": {
                "message_id": 1,
                "from": {"id": 100, "is_bot": false, "first_name": "Test"},
                "chat": {"id": 200, "type": "private"},
                "date": 1700000000,
                "text": "hello"
            }
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        let event = adapter.normalize(verified).unwrap();

        assert_eq!(event.channel_id, "ch-tg");
        assert_eq!(event.content, "hello");
        assert_eq!(event.external_conversation_id, "200");
        assert_eq!(event.sender.external_user_id, "100");
    }

    #[test]
    fn test_normalize_message_with_thread() {
        let adapter = telegram_test_adapter("ch-tg");
        let body = r#"{
            "update_id": 42,
            "message": {
                "message_id": 1,
                "from": {"id": 100, "is_bot": false, "first_name": "Test"},
                "chat": {"id": 200, "type": "group"},
                "date": 1700000000,
                "message_thread_id": 7,
                "text": "hello"
            }
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        let event = adapter.normalize(verified).unwrap();

        assert_eq!(event.external_thread_id.as_deref(), Some("7"));
    }

    #[test]
    fn test_normalize_callback_query() {
        let adapter = telegram_test_adapter("ch-tg");
        let body = r#"{
            "update_id": 43,
            "callback_query": {
                "id": "cb1",
                "from": {"id": 100, "is_bot": false, "first_name": "Test"},
                "message": {
                    "message_id": 1,
                    "chat": {"id": 200, "type": "private"},
                    "date": 1700000000
                },
                "data": "btn_click"
            }
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        let event = adapter.normalize(verified).unwrap();

        assert_eq!(event.content, "btn_click");
        assert_eq!(event.external_conversation_id, "200");
    }

    #[test]
    fn test_normalize_empty_text_fails() {
        let adapter = telegram_test_adapter("ch-tg");
        let body = r#"{
            "update_id": 42,
            "message": {
                "message_id": 1,
                "from": {"id": 100, "is_bot": false, "first_name": "Test"},
                "chat": {"id": 200, "type": "private"},
                "date": 1700000000
            }
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        assert!(adapter.normalize(verified).is_err());
    }
}
