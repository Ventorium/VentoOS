use std::collections::HashSet;

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use serde_json::json;
use tracing::{info, warn};
use ventoos_core::plugin::AppPlugin;
use ventoos_core::ws::{ClientMessage, ServerMessage};
use ventoos_task::TaskEvent;

use crate::state::AppState;

const TASK_EVENTS_CHANNEL: &str = "task_events";

/// WebSocket upgrade handler.
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    info!("WebSocket client connected");

    let mut task_rx = state.tasks.subscribe();
    let mut subscriptions = HashSet::new();

    loop {
        tokio::select! {
            // Forward task events to the WebSocket client
            Ok(event) = task_rx.recv() => {
                if !is_subscribed(&subscriptions, TASK_EVENTS_CHANNEL) {
                    continue;
                }

                if socket.send(Message::Text(task_event_message(&event).to_json().into())).await.is_err() {
                    break;
                }
            }
            // Handle incoming messages from the client
            Some(msg) = recv_msg(&mut socket) => {
                match msg {
                    Ok(Message::Text(text)) => {
                        match serde_json::from_str::<ClientMessage>(&text) {
                            Ok(ClientMessage::Ping) => {
                                let pong = ServerMessage::Pong;
                                if socket.send(Message::Text(pong.to_json().into())).await.is_err() {
                                    break;
                                }
                            }
                            Ok(ClientMessage::Subscribe { channel }) => {
                                info!("Client subscribed to channel: {channel}");
                                subscriptions.insert(channel);
                            }
                            Ok(ClientMessage::Unsubscribe { channel }) => {
                                info!("Client unsubscribed from channel: {channel}");
                                subscriptions.remove(channel.as_str());
                            }
                            Ok(ClientMessage::AppMessage { app_id, payload }) => {
                                let response = dispatch_app_message(&state.plugins, &app_id, &payload).await;
                                if socket.send(Message::Text(response.to_json().into())).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => {
                                warn!("Failed to parse client message: {e}");
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        info!("WebSocket client disconnected");
                        break;
                    }
                    Err(_) => {
                        warn!("WebSocket error");
                        break;
                    }
                    _ => {}
                }
            }
            else => break,
        }
    }
}

async fn recv_msg(socket: &mut WebSocket) -> Option<Result<Message, axum::Error>> {
    socket.recv().await
}

fn is_subscribed(subscriptions: &HashSet<String>, channel: &str) -> bool {
    subscriptions.contains(channel)
}

fn task_event_message(event: &TaskEvent) -> ServerMessage {
    ServerMessage::TaskUpdate {
        task_id: event.task_id.to_string(),
        status: serde_json::to_value(&event.status)
            .ok()
            .and_then(|value| value.as_str().map(String::from))
            .unwrap_or_else(|| format!("{:?}", event.status)),
        progress: event.progress,
        message: event.message.clone(),
    }
}

async fn dispatch_app_message(
    plugins: &[Box<dyn AppPlugin>],
    app_id: &str,
    payload: &serde_json::Value,
) -> ServerMessage {
    let Some(plugin) = plugins.iter().find(|plugin| plugin.app_id() == app_id) else {
        warn!("WebSocket app message target plugin not found: app_id={app_id}");
        return app_message_failure(
            app_id.to_string(),
            payload,
            "plugin_not_found",
            &format!("plugin '{app_id}' is not registered"),
        );
    };

    match plugin.handle_ws_message(payload).await {
        Ok(Some(response_payload)) => ServerMessage::AppMessage {
            app_id: app_id.to_string(),
            payload: json!({
                "handled": true,
                "payload": response_payload,
            }),
        },
        Ok(None) => app_message_failure(
            app_id.to_string(),
            payload,
            "unhandled",
            "plugin does not handle this websocket message",
        ),
        Err(error) => app_message_failure(
            app_id.to_string(),
            payload,
            "plugin_error",
            error.as_str(),
        ),
    }
}

fn app_message_failure(
    app_id: String,
    payload: &serde_json::Value,
    reason: &str,
    error: &str,
) -> ServerMessage {
    let payload_kind = match payload {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "bool",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    };

    ServerMessage::AppMessage {
        app_id,
        payload: json!({
            "handled": false,
            "reason": reason,
            "error": error,
            "payload_kind": payload_kind,
        }),
    }
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use serde_json::json;
    use ventoos_core::task::TaskStatus;
    use ventoos_core::plugin::PluginMessageFuture;
    use ventoos_core::types::new_id;

    use super::*;

    #[test]
    fn task_events_are_forwarded_only_when_subscribed() {
        let mut subscriptions = HashSet::new();
        assert!(!is_subscribed(&subscriptions, TASK_EVENTS_CHANNEL));

        subscriptions.insert(TASK_EVENTS_CHANNEL.to_string());
        assert!(is_subscribed(&subscriptions, TASK_EVENTS_CHANNEL));

        subscriptions.remove(TASK_EVENTS_CHANNEL);
        assert!(!is_subscribed(&subscriptions, TASK_EVENTS_CHANNEL));
    }

    #[tokio::test]
    async fn app_message_returns_observable_failure_payload_when_plugin_is_missing() {
        let message = dispatch_app_message(
            &[],
            "database",
            &json!({"action": "refresh", "scope": "connections"}),
        )
        .await;

        match message {
            ServerMessage::AppMessage { app_id, payload } => {
                assert_eq!(app_id, "database");
                assert_eq!(payload["handled"], json!(false));
                assert_eq!(payload["reason"], json!("plugin_not_found"));
                assert_eq!(payload["payload_kind"], json!("object"));
                assert!(payload["error"]
                    .as_str()
                    .unwrap_or_default()
                    .contains("not registered"));
            }
            other => panic!("expected AppMessage, got {other:?}"),
        }
    }

    struct TestWsPlugin;

    impl AppPlugin for TestWsPlugin {
        fn app_id(&self) -> &'static str {
            "test-plugin"
        }

        fn routes(&self) -> Router {
            Router::new()
        }

        fn handle_ws_message<'a>(
            &'a self,
            payload: &'a serde_json::Value,
        ) -> PluginMessageFuture<'a> {
            Box::pin(async move {
                Ok(Some(json!({
                    "echo": payload,
                    "ok": true,
                })))
            })
        }
    }

    #[tokio::test]
    async fn app_message_is_forwarded_to_plugin_when_hook_exists() {
        let plugins: Vec<Box<dyn AppPlugin>> = vec![Box::new(TestWsPlugin)];
        let message = dispatch_app_message(&plugins, "test-plugin", &json!({"action": "ping"})).await;

        match message {
            ServerMessage::AppMessage { app_id, payload } => {
                assert_eq!(app_id, "test-plugin");
                assert_eq!(payload["handled"], json!(true));
                assert_eq!(payload["payload"]["ok"], json!(true));
                assert_eq!(payload["payload"]["echo"]["action"], json!("ping"));
            }
            other => panic!("expected AppMessage, got {other:?}"),
        }
    }

    #[test]
    fn task_event_message_serializes_status_and_progress() {
        let event = TaskEvent {
            task_id: new_id(),
            status: TaskStatus::Running,
            progress: Some(0.5),
            message: Some("halfway".to_string()),
        };

        match task_event_message(&event) {
            ServerMessage::TaskUpdate {
                task_id,
                status,
                progress,
                message,
            } => {
                assert_eq!(task_id, event.task_id.to_string());
                assert_eq!(status, "running");
                assert_eq!(progress, Some(0.5));
                assert_eq!(message.as_deref(), Some("halfway"));
            }
            other => panic!("expected TaskUpdate, got {other:?}"),
        }
    }
}
