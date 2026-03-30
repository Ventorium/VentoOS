use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use tracing::{info, warn};

use crate::state::AppState;
use ventoos_task::TaskEvent;

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
                let msg = serde_json::json!({
                    "type": "task_event",
                    "data": {
                        "task_id": event.task_id.to_string(),
                        "status": event.status,
                        "progress": event.progress,
                        "message": event.message,
                    }
                });
                if socket.send(Message::Text(msg.to_string().into())).await.is_err() {
                    break;
                }
            }
            // Handle incoming messages from the client
            Some(msg) = recv_msg(&mut socket) => {
                match msg {
                    Ok(Message::Text(text)) => {
                        info!("Received message: {text}");
                        // Handle client messages (ping, subscribe, etc.)
                        if text.as_str() == "ping" && socket.send(Message::Text("pong".into())).await.is_err() {
                            break;
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

fn _format_event(event: &TaskEvent) -> String {
    serde_json::json!({
        "type": "task_event",
        "task_id": event.task_id.to_string(),
        "status": event.status,
    })
    .to_string()
}
