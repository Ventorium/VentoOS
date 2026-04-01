//! Channel runtime primitives for external chat platforms.

use serde::{Deserialize, Serialize};

use crate::types::{AgentError, ChannelKind, ChannelMessageEvent};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InboundChannelRequest {
    pub channel_id: String,
    pub kind: ChannelKind,
    pub raw_body: String,
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

#[allow(async_fn_in_trait)]
pub trait ChannelAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn kind(&self) -> ChannelKind;
    fn verify(&self, request: &InboundChannelRequest) -> Result<VerifiedChannelRequest, AgentError>;
    fn normalize(&self, inbound: VerifiedChannelRequest) -> Result<ChannelMessageEvent, AgentError>;
    async fn send(
        &self,
        outbound: ChannelOutboundMessage,
    ) -> Result<ChannelSendResult, AgentError>;
}
