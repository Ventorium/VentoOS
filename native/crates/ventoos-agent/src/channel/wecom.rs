//! WeCom (钉钉) Enterprise Wechat bot adapter.
//!
//! Inbound: accepts the callback JSON from WeCom robot webhook/stream.
//! Outbound: sends replies via the WeCom robot message API.
//!
//! Reference: <https://open.wecom.com/document/orgapp/the-creation-and-installation-of-the-bot>

use serde::Deserialize;

use crate::channel::{
    ChannelAdapter, ChannelKind, ChannelSendResult, InboundChannelRequest, VerifiedChannelRequest,
};
use crate::types::{AgentError, ChannelIdentity, ChannelMessageEvent};

/// WeCom robot adapter.
pub struct WeComAdapter {
    channel_id: String,
    client_id: String,
    client_secret: String,
}

impl WeComAdapter {
    #[must_use]
    pub fn new(channel_id: String, client_id: String, client_secret: String) -> Self {
        Self {
            channel_id,
            client_id,
            client_secret,
        }
    }

    /// Parse and validate a WeCom robot callback body.
    fn parse_callback(&self, raw_body: &str) -> Result<WeComCallback, AgentError> {
        serde_json::from_str(raw_body).map_err(|e| AgentError::ChannelError {
            channel: "wecom".into(),
            detail: format!("invalid callback JSON: {e}"),
        })
    }
}

impl ChannelAdapter for WeComAdapter {
    fn id(&self) -> &str {
        &self.channel_id
    }

    fn kind(&self) -> ChannelKind {
        ChannelKind::WeCom
    }

    fn verify(
        &self,
        request: &InboundChannelRequest,
    ) -> Result<VerifiedChannelRequest, AgentError> {
        // Basic structural validation
        let cb = self.parse_callback(&request.raw_body)?;

        if cb.from_user_name.is_empty() {
            return Err(AgentError::ChannelError {
                channel: "wecom".into(),
                detail: "missing FromUserName".into(),
            });
        }

        Ok(VerifiedChannelRequest {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::WeCom,
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
                channel: "wecom".into(),
                detail: "empty message content".into(),
            });
        }

        let sender_id = cb.from_user_name.clone();
        let conversation_id = cb.to_user_name.clone();
        let message_id = cb
            .msg_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        Ok(ChannelMessageEvent {
            channel_id: self.channel_id.clone(),
            kind: ChannelKind::WeCom,
            external_message_id: message_id,
            external_conversation_id: conversation_id.clone(),
            external_thread_id: None,
            sender: ChannelIdentity {
                channel_id: self.channel_id.clone(),
                kind: ChannelKind::WeCom,
                external_user_id: sender_id,
                external_conversation_id: conversation_id,
                external_thread_id: None,
            },
            content,
            occurred_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    fn send<'a>(
        &'a self,
        outbound: crate::channel::ChannelOutboundMessage,
    ) -> crate::channel::BoxFuture<'a, Result<ChannelSendResult, AgentError>> {
        Box::pin(async move {
            // First get an access token
            let token = self.get_access_token().await?;

            let url = "https://api.wecom.com/v1.0/robot/oToMessages/batchSend";
            let body = serde_json::json!({
                "agentid": self.client_id,
                "userIds": [outbound.external_conversation_id],
                "msgtype": "text",
                "text": {"content": outbound.content},
            });

            let client = reqwest::Client::new();
            let resp = client
                .post(url)
                .header("x-acs-wecom-access-token", &token)
                .json(&body)
                .send()
                .await
                .map_err(|e| AgentError::ChannelError {
                    channel: "wecom".into(),
                    detail: format!("send request failed: {e}"),
                })?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(AgentError::ChannelError {
                    channel: "wecom".into(),
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

impl WeComAdapter {
    /// Obtain an access token using client_id + client_secret.
    async fn get_access_token(&self) -> Result<String, AgentError> {
        let url = "https://api.wecom.com/v1.0/oauth2/access_token";
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
                    channel: "wecom".into(),
                    detail: format!("token request failed: {e}"),
                })?;

        if !resp.status().is_success() {
            return Err(AgentError::ChannelError {
                channel: "wecom".into(),
                detail: format!("token API returned {}", resp.status()),
            });
        }

        let result: serde_json::Value =
            resp.json().await.map_err(|e| AgentError::ChannelError {
                channel: "wecom".into(),
                detail: format!("failed to parse token response: {e}"),
            })?;

        result
            .get("access_token")
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| AgentError::ChannelError {
                channel: "wecom".into(),
                detail: "access_token not found in response".into(),
            })
    }
}

// ─── WeCom API Types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct WeComCallback {
    #[serde(default)]
    pub to_user_name: String,
    #[serde(default)]
    pub from_user_name: String,
    #[serde(default)]
    pub sender_nick: Option<String>,
    #[serde(default)]
    pub msg_id: Option<String>,
    #[serde(default)]
    pub text: WeComText,
    #[serde(default)]
    pub create_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WeComText {
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
            kind: ChannelKind::WeCom,
            raw_body: body.into(),
            headers: HashMap::new(),
            query_params: HashMap::new(),
        }
    }

    fn test_adapter() -> WeComAdapter {
        WeComAdapter::new(
            "ch-dt".into(),
            "test-client-id".into(),
            "test-secret".into(),
        )
    }

    #[test]
    fn test_verify_valid_callback() {
        let adapter = test_adapter();
        let body = r#"{
            "to_user_name": "cid123",
            "from_user_name": "user1",
            "msg_id": "msg1",
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
            "to_user_name": "cid123",
            "from_user_name": "user1",
            "msg_id": "msg1",
            "text": {"content": "hello wecom"}
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        let event = adapter.normalize(verified).unwrap();

        assert_eq!(event.channel_id, "ch-dt");
        assert_eq!(event.content, "hello wecom");
        assert_eq!(event.external_conversation_id, "cid123");
        assert_eq!(event.sender.external_user_id, "user1");
        assert_eq!(event.external_message_id, "msg1");
    }

    #[test]
    fn test_normalize_empty_content_fails() {
        let adapter = test_adapter();
        let body = r#"{
            "from_user_name": "user1",
            "text": {"content": "  "}
        }"#;
        let verified = adapter.verify(&make_request(body)).unwrap();
        assert!(adapter.normalize(verified).is_err());
    }
}
