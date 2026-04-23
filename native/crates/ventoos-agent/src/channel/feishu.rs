//! Feishu (飞书) Lark bot adapter.
//!
//! Inbound: accepts event callback JSON from Feishu open platform.
//! Outbound: sends replies via the Feishu bot message API.
//!
//! Reference: <https://open.feishu.cn/document/server-docs/event-subscription-guide>

use serde::Deserialize;

use crate::channel::{
    ChannelAdapter, ChannelKind, ChannelSendResult, InboundChannelRequest, VerifiedChannelRequest,
};
use crate::types::{AgentError, ChannelIdentity, ChannelMessageEvent};

/// Feishu Lark bot adapter.
pub struct FeishuAdapter {
    channel_id: String,
    app_id: String,
    app_secret: String,
    verification_token: Option<String>,
    /// Planned: used for decrypting encrypted Feishu webhook payloads.
    #[allow(dead_code)]
    encrypt_key: Option<String>,
}

impl FeishuAdapter {
    #[must_use]
    pub fn new(channel_id: String, app_id: String, app_secret: String) -> Self {
        Self {
            channel_id,
            app_id,
            app_secret,
            verification_token: None,
            encrypt_key: None,
        }
    }

    /// Set optional verification token for URL verification challenge.
    #[must_use]
    pub fn with_verification_token(mut self, token: String) -> Self {
        self.verification_token = Some(token);
        self
    }

    /// Parse Feishu callback JSON (event or challenge).
    #[allow(clippy::unused_self)]
    fn parse_callback(&self, raw_body: &str) -> Result<FeishuCallback, AgentError> {
        serde_json::from_str(raw_body).map_err(|e| AgentError::ChannelError {
            channel: "feishu".into(),
            detail: format!("invalid callback JSON: {e}"),
        })
    }

    async fn get_tenant_access_token(&self) -> Result<String, AgentError> {
        let url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
        let body = serde_json::json!({
            "app_id": self.app_id,
            "app_secret": self.app_secret,
        });

        let client = reqwest::Client::new();
        let resp =
            client
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| AgentError::ChannelError {
                    channel: "feishu".into(),
                    detail: format!("token request failed: {e}"),
                })?;

        if !resp.status().is_success() {
            return Err(AgentError::ChannelError {
                channel: "feishu".into(),
                detail: format!("token API returned {}", resp.status()),
            });
        }

        let result: serde_json::Value =
            resp.json().await.map_err(|e| AgentError::ChannelError {
                channel: "feishu".into(),
                detail: format!("failed to parse token response: {e}"),
            })?;

        result
            .get("tenant_access_token")
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| AgentError::ChannelError {
                channel: "feishu".into(),
                detail: "tenant_access_token not found".into(),
            })
    }
}

impl ChannelAdapter for FeishuAdapter {
    fn id(&self) -> &str {
        &self.channel_id
    }

    fn kind(&self) -> ChannelKind {
        ChannelKind::Feishu
    }

    fn verify(
        &self,
        request: &InboundChannelRequest,
    ) -> Result<VerifiedChannelRequest, AgentError> {
        let cb = self.parse_callback(&request.raw_body)?;

        // Handle URL verification challenge
        if cb.r#type == "url_verification" {
            return Ok(VerifiedChannelRequest {
                channel_id: self.channel_id.clone(),
                kind: ChannelKind::Feishu,
                raw_body: request.raw_body.clone(),
            });
        }

        if cb.header.event_type != "im.message.receive_v1" {
            return Err(AgentError::ChannelError {
                channel: "feishu".into(),
                detail: format!("unsupported event type: {}", cb.header.event_type),
            });
        }

        Ok(VerifiedChannelRequest {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::Feishu,
            raw_body: request.raw_body.clone(),
        })
    }

    fn normalize(
        &self,
        inbound: VerifiedChannelRequest,
    ) -> Result<ChannelMessageEvent, AgentError> {
        let cb = self.parse_callback(&inbound.raw_body)?;

        if cb.r#type == "url_verification" {
            return Ok(ChannelMessageEvent {
                channel_id: self.channel_id.clone(),
                kind: ChannelKind::Feishu,
                external_message_id: "url_verification".into(),
                external_conversation_id: "system".into(),
                external_thread_id: None,
                sender: ChannelIdentity {
                    channel_id: self.channel_id.clone(),
                    kind: ChannelKind::Feishu,
                    external_user_id: "system".into(),
                    external_conversation_id: "system".into(),
                    external_thread_id: None,
                },
                content: cb.challenge.unwrap_or_default(),
                occurred_at: chrono::Utc::now().to_rfc3339(),
            });
        }

        let event = cb.event.ok_or_else(|| AgentError::ChannelError {
            channel: "feishu".into(),
            detail: "missing event payload".into(),
        })?;

        if event.message.message_type != "text" {
            return Err(AgentError::ChannelError {
                channel: "feishu".into(),
                detail: format!("unsupported message type: {}", event.message.message_type),
            });
        }

        let content = event.message.content.trim_matches('"').trim().to_string();
        if content.is_empty() {
            return Err(AgentError::ChannelError {
                channel: "feishu".into(),
                detail: "empty message content".into(),
            });
        }

        Ok(ChannelMessageEvent {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::Feishu,
            external_message_id: event.message.message_id,
            external_conversation_id: event.message.chat_id.clone(),
            external_thread_id: event.message.thread_id.clone(),
            sender: ChannelIdentity {
                channel_id: self.channel_id.clone(),
                kind: ChannelKind::Feishu,
                external_user_id: event.sender.sender_id.open_id,
                external_conversation_id: event.message.chat_id,
                external_thread_id: event.message.thread_id,
            },
            content,
            occurred_at: cb
                .header
                .timestamp
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        })
    }

    fn send(
        &self,
        outbound: crate::channel::ChannelOutboundMessage,
    ) -> crate::channel::BoxFuture<'_, Result<ChannelSendResult, AgentError>> {
        Box::pin(async move {
            let token = self.get_tenant_access_token().await?;

            let url = "https://open.feishu.cn/open-apis/im/v1/messages";
            let body = serde_json::json!({
                "receive_id": outbound.external_conversation_id,
                "msg_type": "text",
                "content": serde_json::json!({"text": outbound.content}).to_string(),
            });

            let client = reqwest::Client::new();
            let resp = client
                .post(url)
                .header("Authorization", format!("Bearer {token}"))
                .query(&[("receive_id_type", "chat_id")])
                .json(&body)
                .send()
                .await
                .map_err(|e| AgentError::ChannelError {
                    channel: "feishu".into(),
                    detail: format!("send request failed: {e}"),
                })?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(AgentError::ChannelError {
                    channel: "feishu".into(),
                    detail: format!("send API returned {status}: {text}"),
                });
            }

            let result: serde_json::Value =
                resp.json().await.map_err(|e| AgentError::ChannelError {
                    channel: "feishu".into(),
                    detail: format!("failed to parse send response: {e}"),
                })?;

            Ok(ChannelSendResult {
                accepted: true,
                external_message_id: result
                    .get("data")
                    .and_then(|d| d.get("message_id"))
                    .and_then(|m| m.as_str())
                    .map(String::from),
            })
        })
    }
}

// ─── Feishu API Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct FeishuCallback {
    #[serde(default, rename = "type")]
    pub r#type: String,
    #[serde(default)]
    pub challenge: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub header: FeishuEventHeader,
    #[serde(default)]
    pub event: Option<FeishuEvent>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct FeishuEventHeader {
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub event_type: String,
    #[serde(default)]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeishuEvent {
    #[serde(default)]
    pub sender: FeishuSender,
    #[serde(default)]
    pub message: FeishuMessage,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct FeishuSender {
    #[serde(default)]
    pub sender_id: FeishuSenderId,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct FeishuSenderId {
    #[serde(default)]
    pub open_id: String,
    #[serde(default)]
    pub user_id: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct FeishuMessage {
    #[serde(default)]
    pub message_id: String,
    #[serde(default)]
    pub chat_id: String,
    #[serde(default)]
    pub message_type: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub thread_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_request(body: &str) -> InboundChannelRequest {
        InboundChannelRequest {
            channel_id: "ch-fs".into(),
            kind: ChannelKind::Feishu,
            raw_body: body.into(),
            headers: HashMap::new(),
            query_params: HashMap::new(),
        }
    }

    fn test_adapter() -> FeishuAdapter {
        FeishuAdapter::new("ch-fs".into(), "test-app-id".into(), "test-secret".into())
    }

    #[test]
    fn test_verify_url_challenge() {
        let adapter = test_adapter();
        let body = r#"{"type":"url_verification","challenge":"abc123","token":"vt"}"#;
        let result = adapter.verify(&make_request(body));
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_message_event() {
        let adapter = test_adapter();
        let body = r#"{"header":{"event_type":"im.message.receive_v1","event_id":"e1"},"event":{"sender":{"sender_id":{"open_id":"ou1","user_id":"u1"}},"message":{"message_id":"m1","chat_id":"oc1","message_type":"text","content":"\"hello\""}}}"#;
        let result = adapter.verify(&make_request(body));
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_unsupported_event_type() {
        let adapter = test_adapter();
        let body = r#"{"header":{"event_type":"some.other.event","event_id":"e1"},"event":{}}"#;
        assert!(adapter.verify(&make_request(body)).is_err());
    }

    #[test]
    fn test_normalize_url_challenge() {
        let adapter = test_adapter();
        let body = r#"{"type":"url_verification","challenge":"test-challenge"}"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        let event = adapter.normalize(verified).unwrap();
        assert_eq!(event.content, "test-challenge");
        assert_eq!(event.external_conversation_id, "system");
    }

    #[test]
    fn test_normalize_message() {
        let adapter = test_adapter();
        let body = r#"{"header":{"event_type":"im.message.receive_v1","event_id":"e1"},"event":{"sender":{"sender_id":{"open_id":"ou1","user_id":"u1"}},"message":{"message_id":"m1","chat_id":"oc1","message_type":"text","content":"\"hello feishu\""}}}"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        let event = adapter.normalize(verified).unwrap();
        assert_eq!(event.channel_id, "ch-fs");
        assert_eq!(event.content, "hello feishu");
        assert_eq!(event.external_conversation_id, "oc1");
        assert_eq!(event.sender.external_user_id, "ou1");
        assert_eq!(event.external_message_id, "m1");
    }

    #[test]
    fn test_normalize_non_text_message_fails() {
        let adapter = test_adapter();
        let body = r#"{"header":{"event_type":"im.message.receive_v1","event_id":"e1"},"event":{"sender":{"sender_id":{"open_id":"ou1"}},"message":{"message_id":"m1","chat_id":"oc1","message_type":"image","content":"{}"}}}"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        assert!(adapter.normalize(verified).is_err());
    }

    #[test]
    fn test_normalize_empty_content_fails() {
        let adapter = test_adapter();
        let body = r#"{"header":{"event_type":"im.message.receive_v1","event_id":"e1"},"event":{"sender":{"sender_id":{"open_id":"ou1"}},"message":{"message_id":"m1","chat_id":"oc1","message_type":"text","content":"\"\""}}}"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        assert!(adapter.normalize(verified).is_err());
    }
}
