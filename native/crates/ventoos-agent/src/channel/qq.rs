//! Qq (钉钉) QQ official bot adapter.
//!
//! Inbound: accepts the callback JSON from Qq robot webhook/stream.
//! Outbound: sends replies via the Qq robot message API.
//!
//! Reference: <https://open.qq.com/document/orgapp/the-creation-and-installation-of-the-bot>

use serde::Deserialize;

use crate::channel::{
    ChannelAdapter, ChannelKind, ChannelSendResult, InboundChannelRequest, VerifiedChannelRequest,
};
use crate::types::{AgentError, ChannelIdentity, ChannelMessageEvent};

/// Qq robot adapter.
pub struct QqAdapter {
    channel_id: String,
    app_id: String,
    app_secret: String,
}

impl QqAdapter {
    #[must_use]
    pub fn new(channel_id: String, client_id: String, client_secret: String) -> Self {
        Self {
            channel_id,
            app_id: client_id,
            app_secret: client_secret,
        }
    }

    /// Parse and validate a Qq robot callback body.
    #[allow(clippy::unused_self)]
    fn parse_callback(&self, raw_body: &str) -> Result<QqCallback, AgentError> {
        serde_json::from_str(raw_body).map_err(|e| AgentError::ChannelError {
            channel: "qq".into(),
            detail: format!("invalid callback JSON: {e}"),
        })
    }
}

impl ChannelAdapter for QqAdapter {
    fn id(&self) -> &str {
        &self.channel_id
    }

    fn kind(&self) -> ChannelKind {
        ChannelKind::Qq
    }

    fn verify(
        &self,
        request: &InboundChannelRequest,
    ) -> Result<VerifiedChannelRequest, AgentError> {
        // Basic structural validation
        let cb = self.parse_callback(&request.raw_body)?;

        if cb.channel_id.is_empty() {
            return Err(AgentError::ChannelError {
                channel: "qq".into(),
                detail: "missing conversation_id".into(),
            });
        }

        Ok(VerifiedChannelRequest {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::Qq,
            raw_body: request.raw_body.clone(),
        })
    }

    fn normalize(
        &self,
        inbound: VerifiedChannelRequest,
    ) -> Result<ChannelMessageEvent, AgentError> {
        let cb = self.parse_callback(&inbound.raw_body)?;

        let content = cb.text.content.trim().to_string();
        if content.is_empty() {
            return Err(AgentError::ChannelError {
                channel: "qq".into(),
                detail: "empty message content".into(),
            });
        }

        let sender_id = cb.sender_nick.clone().unwrap_or_default();
        let conversation_id = cb.channel_id.clone();
        let message_id = cb
            .message_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        Ok(ChannelMessageEvent {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::Qq,
            external_message_id: message_id,
            external_conversation_id: conversation_id.clone(),
            external_thread_id: None,
            sender: ChannelIdentity {
                channel_id: self.channel_id.clone(),
                kind: ChannelKind::Qq,
                external_user_id: sender_id,
                external_conversation_id: conversation_id,
                external_thread_id: None,
            },
            content,
            occurred_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    fn send(
        &self,
        outbound: crate::channel::ChannelOutboundMessage,
    ) -> crate::channel::BoxFuture<'_, Result<ChannelSendResult, AgentError>> {
        Box::pin(async move {
            // First get an access token
            let token = self.get_access_token().await?;

            let url = "https://api.qq.com/v1.0/robot/oToMessages/batchSend";
            let body = serde_json::json!({
                "robotCode": self.app_id,
                "userIds": [outbound.external_conversation_id],
                "msgKey": "sampleText",
                "msgParam": serde_json::json!({
                    "content": outbound.content
                }).to_string(),
            });

            let client = reqwest::Client::new();
            let resp = client
                .post(url)
                .header("x-acs-qq-access-token", &token)
                .json(&body)
                .send()
                .await
                .map_err(|e| AgentError::ChannelError {
                    channel: "qq".into(),
                    detail: format!("send request failed: {e}"),
                })?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(AgentError::ChannelError {
                    channel: "qq".into(),
                    detail: format!("send API returned {status}: {text}"),
                });
            }

            Ok(ChannelSendResult {
                accepted: true,
                external_message_id: None,
            })
        })
    }
}

impl QqAdapter {
    /// Obtain an access token using `client_id` + `client_secret`.
    async fn get_access_token(&self) -> Result<String, AgentError> {
        let url = "https://api.qq.com/v1.0/oauth2/access_token";
        let body = serde_json::json!({
            "appKey": self.app_id,
            "appSecret": self.app_secret,
        });

        let client = reqwest::Client::new();
        let resp =
            client
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| AgentError::ChannelError {
                    channel: "qq".into(),
                    detail: format!("token request failed: {e}"),
                })?;

        if !resp.status().is_success() {
            return Err(AgentError::ChannelError {
                channel: "qq".into(),
                detail: format!("token API returned {}", resp.status()),
            });
        }

        let result: serde_json::Value =
            resp.json().await.map_err(|e| AgentError::ChannelError {
                channel: "qq".into(),
                detail: format!("failed to parse token response: {e}"),
            })?;

        result
            .get("access_token")
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| AgentError::ChannelError {
                channel: "qq".into(),
                detail: "access_token not found in response".into(),
            })
    }
}

// ─── Qq API Types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct QqCallback {
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub guild_id: Option<String>,
    #[serde(default)]
    pub sender_nick: Option<String>,
    #[serde(default)]
    pub message_id: Option<String>,
    #[serde(default)]
    pub text: QqText,
    #[serde(default)]
    pub create_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct QqText {
    #[serde(default)]
    pub content: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_request(body: &str) -> InboundChannelRequest {
        InboundChannelRequest {
            channel_id: "ch-qq".into(),
            kind: ChannelKind::Qq,
            raw_body: body.into(),
            headers: HashMap::new(),
            query_params: HashMap::new(),
        }
    }

    fn test_adapter() -> QqAdapter {
        QqAdapter::new(
            "ch-qq".into(),
            "test-client-id".into(),
            "test-secret".into(),
        )
    }

    #[test]
    fn test_verify_valid_callback() {
        let adapter = test_adapter();
        let body = r#"{
            "channel_id": "cid123",
            "sender_nick": "user1",
            "message_id": "msg1",
            "text": {"content": "hello"}
        }"#;
        let result = adapter.verify(&make_request(body));
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_invalid_json() {
        let adapter = test_adapter();
        assert!(adapter.verify(&make_request("bad json")).is_err());
    }

    #[test]
    fn test_verify_missing_conversation_id() {
        let adapter = test_adapter();
        let body = r#"{"text": {"content": "hello"}}"#;
        assert!(adapter.verify(&make_request(body)).is_err());
    }

    #[test]
    fn test_normalize_callback() {
        let adapter = test_adapter();
        let body = r#"{
            "channel_id": "cid123",
            "sender_nick": "user1",
            "message_id": "msg1",
            "text": {"content": "hello qq"}
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        let event = adapter.normalize(verified).unwrap();

        assert_eq!(event.channel_id, "ch-qq");
        assert_eq!(event.content, "hello qq");
        assert_eq!(event.external_conversation_id, "cid123");
        assert_eq!(event.sender.external_user_id, "user1");
        assert_eq!(event.external_message_id, "msg1");
    }

    #[test]
    fn test_normalize_empty_content_fails() {
        let adapter = test_adapter();
        let body = r#"{
            "channel_id": "cid123",
            "text": {"content": "  "}
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        assert!(adapter.normalize(verified).is_err());
    }
}
