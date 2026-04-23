//! `DingTalk` (钉钉) Stream-mode bot adapter.
//!
//! Inbound: accepts the callback JSON from `DingTalk` robot webhook/stream.
//! Outbound: sends replies via the `DingTalk` robot message API.
//!
//! Reference: <https://open.dingtalk.com/document/orgapp/the-creation-and-installation-of-the-bot>

use serde::Deserialize;

use crate::channel::{
    ChannelAdapter, ChannelKind, ChannelSendResult, InboundChannelRequest, VerifiedChannelRequest,
};
use crate::types::{AgentError, ChannelIdentity, ChannelMessageEvent};

/// `DingTalk` robot adapter.
pub struct DingTalkAdapter {
    channel_id: String,
    client_id: String,
    client_secret: String,
}

impl DingTalkAdapter {
    #[must_use]
    pub fn new(channel_id: String, client_id: String, client_secret: String) -> Self {
        Self {
            channel_id,
            client_id,
            client_secret,
        }
    }

    /// Parse and validate a `DingTalk` robot callback body.
    #[allow(clippy::unused_self)]
    fn parse_callback(&self, raw_body: &str) -> Result<DingTalkCallback, AgentError> {
        serde_json::from_str(raw_body).map_err(|e| AgentError::ChannelError {
            channel: "dingtalk".into(),
            detail: format!("invalid callback JSON: {e}"),
        })
    }
}

impl ChannelAdapter for DingTalkAdapter {
    fn id(&self) -> &str {
        &self.channel_id
    }

    fn kind(&self) -> ChannelKind {
        ChannelKind::DingTalk
    }

    fn verify(
        &self,
        request: &InboundChannelRequest,
    ) -> Result<VerifiedChannelRequest, AgentError> {
        // Basic structural validation
        let cb = self.parse_callback(&request.raw_body)?;

        if cb.conversation_id.is_empty() {
            return Err(AgentError::ChannelError {
                channel: "dingtalk".into(),
                detail: "missing conversation_id".into(),
            });
        }

        Ok(VerifiedChannelRequest {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::DingTalk,
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
                channel: "dingtalk".into(),
                detail: "empty message content".into(),
            });
        }

        let sender_id = cb.sender_id.clone().unwrap_or_default();
        let conversation_id = cb.conversation_id.clone();
        let message_id = cb
            .message_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        Ok(ChannelMessageEvent {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::DingTalk,
            external_message_id: message_id,
            external_conversation_id: conversation_id.clone(),
            external_thread_id: None,
            sender: ChannelIdentity {
                channel_id: self.channel_id.clone(),
                kind: ChannelKind::DingTalk,
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

            let url = "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend";
            let body = serde_json::json!({
                "robotCode": self.client_id,
                "userIds": [outbound.external_conversation_id],
                "msgKey": "sampleText",
                "msgParam": serde_json::json!({
                    "content": outbound.content
                }).to_string(),
            });

            let client = reqwest::Client::new();
            let resp = client
                .post(url)
                .header("x-acs-dingtalk-access-token", &token)
                .json(&body)
                .send()
                .await
                .map_err(|e| AgentError::ChannelError {
                    channel: "dingtalk".into(),
                    detail: format!("send request failed: {e}"),
                })?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(AgentError::ChannelError {
                    channel: "dingtalk".into(),
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

impl DingTalkAdapter {
    /// Obtain an access token using `client_id` + `client_secret`.
    async fn get_access_token(&self) -> Result<String, AgentError> {
        let url = "https://api.dingtalk.com/v1.0/oauth2/accessToken";
        let body = serde_json::json!({
            "appKey": self.client_id,
            "appSecret": self.client_secret,
        });

        let client = reqwest::Client::new();
        let resp =
            client
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| AgentError::ChannelError {
                    channel: "dingtalk".into(),
                    detail: format!("token request failed: {e}"),
                })?;

        if !resp.status().is_success() {
            return Err(AgentError::ChannelError {
                channel: "dingtalk".into(),
                detail: format!("token API returned {}", resp.status()),
            });
        }

        let result: serde_json::Value =
            resp.json().await.map_err(|e| AgentError::ChannelError {
                channel: "dingtalk".into(),
                detail: format!("failed to parse token response: {e}"),
            })?;

        result
            .get("accessToken")
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| AgentError::ChannelError {
                channel: "dingtalk".into(),
                detail: "accessToken not found in response".into(),
            })
    }
}

// ─── DingTalk API Types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct DingTalkCallback {
    #[serde(default)]
    pub conversation_id: String,
    #[serde(default)]
    pub sender_id: Option<String>,
    #[serde(default)]
    pub sender_nick: Option<String>,
    #[serde(default)]
    pub message_id: Option<String>,
    #[serde(default)]
    pub text: DingTalkText,
    #[serde(default)]
    pub create_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DingTalkText {
    #[serde(default)]
    pub content: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_request(body: &str) -> InboundChannelRequest {
        InboundChannelRequest {
            channel_id: "ch-dt".into(),
            kind: ChannelKind::DingTalk,
            raw_body: body.into(),
            headers: HashMap::new(),
            query_params: HashMap::new(),
        }
    }

    fn test_adapter() -> DingTalkAdapter {
        DingTalkAdapter::new(
            "ch-dt".into(),
            "test-client-id".into(),
            "test-secret".into(),
        )
    }

    #[test]
    fn test_verify_valid_callback() {
        let adapter = test_adapter();
        let body = r#"{
            "conversation_id": "cid123",
            "sender_id": "user1",
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
            "conversation_id": "cid123",
            "sender_id": "user1",
            "message_id": "msg1",
            "text": {"content": "hello dingtalk"}
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        let event = adapter.normalize(verified).unwrap();

        assert_eq!(event.channel_id, "ch-dt");
        assert_eq!(event.content, "hello dingtalk");
        assert_eq!(event.external_conversation_id, "cid123");
        assert_eq!(event.sender.external_user_id, "user1");
        assert_eq!(event.external_message_id, "msg1");
    }

    #[test]
    fn test_normalize_empty_content_fails() {
        let adapter = test_adapter();
        let body = r#"{
            "conversation_id": "cid123",
            "text": {"content": "  "}
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        assert!(adapter.normalize(verified).is_err());
    }
}
