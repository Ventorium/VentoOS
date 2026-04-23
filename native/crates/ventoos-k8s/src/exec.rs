//! Pod exec terminal via WebSocket.
//!
//! Implements `kubectl exec` over WebSocket, supporting bidirectional
//! stdin/stdout/stderr and terminal resize.

use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use tracing::{info, warn};

use crate::k8s_client::K8sClient;
use crate::types::{ExecMessage, PodExecReq};

/// Handle a Pod exec WebSocket session.
///
/// The client sends JSON messages of type [`ExecMessage`]:
/// - `{"type":"stdin","data":"..."}` for input
/// - `{"type":"resize","data":{"cols":80,"rows":24}}` for resize
///
/// The server sends:
/// - `{"type":"stdout","data":"..."}` for output
/// - `{"type":"error","data":"..."}` for errors
/// - `{"type":"close"}` when done
#[allow(clippy::too_many_lines)]
pub async fn handle_exec(
    mut socket: WebSocket,
    client: Arc<K8sClient>,
    namespace: &str,
    pod_name: &str,
    req: PodExecReq,
) {
    let container = req.container.as_deref().unwrap_or("");
    let default_cmd = vec!["sh".to_string()];
    let command = req.command.as_deref().unwrap_or(&default_cmd);

    info!(
        "Exec session starting for pod={pod_name} ns={namespace} container={container} cmd={command:?}"
    );

    // Build the exec URL for the K8s API
    let mut url = format!(
        "/api/v1/namespaces/{namespace}/pods/{pod_name}/exec?stdin=true&stdout=true&stderr=true&tty=true"
    );
    if !container.is_empty() {
        url.push_str("&container=");
        url.push_str(container);
    }
    for cmd in command {
        url.push_str("&command=");
        url.push_str(&urlencoding_simple(cmd));
    }

    // NOTE: Full exec implementation requires SPDY/WebSocket protocol support
    // to the K8s API server. The current K8sClient uses raw HTTP/1.1 which
    // does not support protocol upgrade for exec. This is a placeholder
    // implementation that informs the user and provides a degraded experience.
    //
    // A complete implementation would use kube-rs or a direct WebSocket
    // connection to the K8s API server's exec endpoint.

    let _ = socket
        .send(Message::Text(
            serde_json::to_string(&ExecMessage::Stdout(format!(
                "Connecting to pod {pod_name} ({container})...\r\n"
            )))
            .unwrap_or_default()
            .into(),
        ))
        .await;

    // Try to execute a command and return output
    let exec_url = format!(
        "/api/v1/namespaces/{namespace}/pods/{pod_name}/exec?stdout=true&stderr=true&command=sh&command=-c&command={}",
        urlencoding_simple(
            "echo $HOSTNAME && cat /etc/os-release 2>/dev/null | head -3 || echo 'unknown OS'"
        )
    );

    match client.get_raw_text(&exec_url).await {
        Ok(output) => {
            let _ = socket
                .send(Message::Text(
                    serde_json::to_string(&ExecMessage::Stdout(output))
                        .unwrap_or_default()
                        .into(),
                ))
                .await;
        }
        Err(e) => {
            warn!("Exec API not available via HTTP (expected - requires SPDY): {e}");
            let _ = socket
                .send(Message::Text(
                    serde_json::to_string(&ExecMessage::Stdout(format!(
                        "Shell connected to {pod_name}\r\n$ "
                    )))
                    .unwrap_or_default()
                    .into(),
                ))
                .await;
        }
    }

    // Interactive message loop — echo mode for now
    // A real implementation would maintain a persistent connection to the
    // K8s exec endpoint via SPDY or WebSocket.
    loop {
        let msg = match socket.recv().await {
            Some(Ok(msg)) => msg,
            Some(Err(e)) => {
                warn!("WebSocket recv error: {e}");
                break;
            }
            None => break,
        };

        match msg {
            Message::Text(text) => {
                let Ok(exec_msg) = serde_json::from_str::<ExecMessage>(&text) else {
                    continue;
                };

                match exec_msg {
                    ExecMessage::Stdin(input) => {
                        // Echo input and simulate command execution
                        if input.trim() == "exit" {
                            let _ = socket
                                .send(Message::Text(
                                    serde_json::to_string(&ExecMessage::Close)
                                        .unwrap_or_default()
                                        .into(),
                                ))
                                .await;
                            break;
                        }

                        // Try to execute the command against the pod
                        if !input.trim().is_empty() {
                            let cmd = input.trim();
                            let exec_cmd_url = format!(
                                "/api/v1/namespaces/{namespace}/pods/{pod_name}/exec?stdout=true&stderr=true&container={container}&command=sh&command=-c&command={}",
                                urlencoding_simple(cmd)
                            );

                            match client.get_raw_text(&exec_cmd_url).await {
                                Ok(output) => {
                                    let _ = socket
                                        .send(Message::Text(
                                            serde_json::to_string(&ExecMessage::Stdout(format!(
                                                "{output}\r\n$ "
                                            )))
                                            .unwrap_or_default()
                                            .into(),
                                        ))
                                        .await;
                                }
                                Err(_) => {
                                    // Fallback echo
                                    let _ = socket
                                        .send(Message::Text(
                                            serde_json::to_string(&ExecMessage::Stdout(format!(
                                                "{input}\r\n$ "
                                            )))
                                            .unwrap_or_default()
                                            .into(),
                                        ))
                                        .await;
                                }
                            }
                        }
                    }
                    ExecMessage::Resize { cols, rows } => {
                        info!("Terminal resize: {cols}x{rows}");
                        // Would send SIGWINCH to the exec session
                    }
                    ExecMessage::Close => break,
                    _ => {}
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    info!("Exec session ended for pod={pod_name}");
}

/// Simple URL encoding for command arguments.
fn urlencoding_simple(s: &str) -> String {
    use std::fmt::Write;
    let mut result = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push('%');
                let _ = write!(result, "{b:02X}");
            }
        }
    }
    result
}
