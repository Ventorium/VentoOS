//! Pub/Sub management.
//!
//! Handles SUBSCRIBE/PSUBSCRIBE and PUBLISH operations.
//! Subscriptions use dedicated connections with WebSocket push.

use crate::types::PubSubMessage;

/// Supported subscription types.
#[derive(Debug, Clone)]
pub enum SubKind {
    /// SUBSCRIBE — exact channel match.
    Channel,
    /// PSUBSCRIBE — pattern-based matching.
    Pattern,
}

impl SubKind {
    pub fn subscribe_cmd(&self) -> &str {
        match self {
            Self::Channel => "SUBSCRIBE",
            Self::Pattern => "PSUBSCRIBE",
        }
    }

    pub fn unsubscribe_cmd(&self) -> &str {
        match self {
            Self::Channel => "UNSUBSCRIBE",
            Self::Pattern => "PUNSUBSCRIBE",
        }
    }

    pub fn message_type(&self) -> &str {
        match self {
            Self::Channel => "message",
            Self::Pattern => "pmessage",
        }
    }
}

/// Parse a RESP array from a subscription into a `PubSubMessage`.
///
/// For `message`: `[message, channel, data]`
/// For `pmessage`: `[pmessage, pattern, channel, data]`
pub fn parse_subscription_message(
    kind: &str,
    parts: &[String],
) -> Option<PubSubMessage> {
    match kind {
        "message" if parts.len() >= 2 => Some(PubSubMessage {
            channel: parts[0].clone(),
            message: parts[1].clone(),
        }),
        "pmessage" if parts.len() >= 3 => Some(PubSubMessage {
            channel: parts[1].clone(), // actual channel
            message: parts[2].clone(),
        }),
        _ => None,
    }
}
