use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use tracing::{info, warn};
use ventoos_core::ws::{ClientMessage, ServerMessage};

use crate::state::AppState;

/// WebSocket upgrade handler.
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    info!("WebSocket client connected");

    let mut task_rx = state.tasks.subscribe();

    loop {
        tokio::select! {
            // Forward task events to the WebSocket client
            Ok(event) = task_rx.recv() => {
                let msg = ServerMessage::TaskUpdate {
                    task_id: event.task_id.to_string(),
                    status: serde_json::to_value(&event.status)
                        .ok()
                        .and_then(|v| v.as_str().map(String::from))
                        .unwrap_or_else(|| format!("{:?}", event.status)),
                    progress: event.progress,
                    message: event.message,
                };
                if socket.send(Message::Text(msg.to_json().into())).await.is_err() {
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
                                // TODO: manage subscription channels
                            }
                            Ok(ClientMessage::Unsubscribe { channel }) => {
                                info!("Client unsubscribed from channel: {channel}");
                                // TODO: manage subscription channels
                            }
                            Ok(ClientMessage::AppMessage { app_id, payload }) => {
                                info!("App message for {app_id}: {payload}");
                                // TODO: forward to appropriate plugin
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
