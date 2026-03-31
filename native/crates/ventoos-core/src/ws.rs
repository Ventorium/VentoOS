use serde::{Deserialize, Serialize};

/// Message sent from the frontend to the backend via WebSocket.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ClientMessage {
    /// Keep-alive ping.
    Ping,
    /// Subscribe to a named channel (e.g. `"task_events"`, `"redis:{connId}:pubsub"`).
    Subscribe { channel: String },
    /// Unsubscribe from a channel.
    Unsubscribe { channel: String },
    /// Application-specific message forwarded to the relevant plugin.
    AppMessage {
        app_id: String,
        payload: serde_json::Value,
    },
}

/// Message sent from the backend to the frontend via WebSocket.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ServerMessage {
    /// Keep-alive pong.
    Pong,
    /// A task status / progress update.
    TaskUpdate {
        task_id: String,
        status: String,
        progress: Option<f32>,
        message: Option<String>,
    },
    /// A system notification.
    Notification {
        id: String,
        level: String,
        title: String,
        message: String,
    },
    /// Connection status change.
    ConnectionStatus {
        connection_id: String,
        status: String,
    },
    /// Application-specific message from a plugin.
    AppMessage {
        app_id: String,
        payload: serde_json::Value,
    },
}

impl ServerMessage {
    /// Serialise to JSON string for transmission over WebSocket.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| r#"{"type":"Error"}"#.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_ping() {
        let msg: ClientMessage = serde_json::from_str(r#"{"type":"Ping"}"#).unwrap();
        assert!(matches!(msg, ClientMessage::Ping));
    }

    #[test]
    fn deserialize_subscribe() {
        let msg: ClientMessage =
            serde_json::from_str(r#"{"type":"Subscribe","data":{"channel":"task_events"}}"#)
                .unwrap();
        if let ClientMessage::Subscribe { channel } = msg {
            assert_eq!(channel, "task_events");
        } else {
            panic!("expected Subscribe");
        }
    }

    #[test]
    fn deserialize_app_message() {
        let msg: ClientMessage = serde_json::from_str(
            r#"{"type":"AppMessage","data":{"app_id":"kubernetes","payload":{"action":"watch"}}}"#,
        )
        .unwrap();
        if let ClientMessage::AppMessage { app_id, payload } = msg {
            assert_eq!(app_id, "kubernetes");
            assert_eq!(payload["action"], "watch");
        } else {
            panic!("expected AppMessage");
        }
    }

    #[test]
    fn serialize_task_update() {
        let msg = ServerMessage::TaskUpdate {
            task_id: "t1".into(),
            status: "running".into(),
            progress: Some(0.5),
            message: Some("halfway".into()),
        };
        let json = msg.to_json();
        assert!(json.contains("TaskUpdate"));
        assert!(json.contains("t1"));
    }

    #[test]
    fn serialize_pong() {
        let msg = ServerMessage::Pong;
        let json = msg.to_json();
        assert!(json.contains("Pong"));
    }

    #[test]
    fn serialize_notification() {
        let msg = ServerMessage::Notification {
            id: "n1".into(),
            level: "info".into(),
            title: "Test".into(),
            message: "hello".into(),
        };
        let json = msg.to_json();
        assert!(json.contains("Notification"));
        assert!(json.contains("hello"));
    }
}
