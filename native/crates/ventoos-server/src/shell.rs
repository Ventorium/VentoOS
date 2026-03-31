use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::Deserialize;
use std::io::{Read, Write};
use tokio::sync::mpsc;
use tracing::{error, info};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ShellQuery {
    /// "local" or a UUID for SSH server.
    pub target: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

/// WebSocket upgrade handler for `WebShell`.
pub async fn ws_shell_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<ShellQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let cols = query.cols.unwrap_or(80);
    let rows = query.rows.unwrap_or(24);
    let target = query.target.unwrap_or_else(|| "local".to_string());

    ws.on_upgrade(move |socket| handle_shell(socket, target, cols, rows, state))
}

async fn handle_shell(
    mut socket: WebSocket,
    target: String,
    cols: u16,
    rows: u16,
    state: AppState,
) {
    if target == "local" {
        handle_local_shell(&mut socket, cols, rows).await;
    } else {
        // SSH shell target — parse server_id
        match uuid::Uuid::parse_str(&target) {
            Ok(server_id) => {
                handle_ssh_shell(&mut socket, server_id, cols, rows, state).await;
            }
            Err(_) => {
                let _ = socket
                    .send(Message::Text(
                        format!("\r\nError: Invalid target '{target}'\r\n").into(),
                    ))
                    .await;
            }
        }
    }
}

async fn handle_local_shell(socket: &mut WebSocket, cols: u16, rows: u16) {
    info!("Starting local shell session ({}x{})", cols, rows);

    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => pair,
        Err(e) => {
            error!("Failed to open PTY: {e}");
            let _ = socket
                .send(Message::Text(
                    format!("\r\nFailed to open PTY: {e}\r\n").into(),
                ))
                .await;
            return;
        }
    };

    // Determine shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");

    let mut child = match pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(e) => {
            error!("Failed to spawn shell: {e}");
            let _ = socket
                .send(Message::Text(
                    format!("\r\nFailed to spawn shell: {e}\r\n").into(),
                ))
                .await;
            return;
        }
    };

    // Drop the slave — only keep the master
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();

    // Channel for PTY output → WebSocket
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(256);

    // Spawn blocking reader for PTY output
    let read_handle = std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Main loop: relay between WebSocket and PTY
    loop {
        tokio::select! {
            // PTY output → WebSocket
            Some(data) = rx.recv() => {
                let text = String::from_utf8_lossy(&data).to_string();
                if socket.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
            // WebSocket input → PTY
            Some(msg) = socket.recv() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        // Handle resize message
                        if let Some(resize) = parse_resize(&text) {
                            let _ = pair.master.resize(PtySize {
                                rows: resize.1,
                                cols: resize.0,
                                pixel_width: 0,
                                pixel_height: 0,
                            });
                            continue;
                        }
                        if writer.write_all(text.as_bytes()).is_err() {
                            break;
                        }
                        let _ = writer.flush();
                    }
                    Ok(Message::Binary(data)) => {
                        if writer.write_all(&data).is_err() {
                            break;
                        }
                        let _ = writer.flush();
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
            }
            else => break,
        }
    }

    // Cleanup
    drop(writer);
    let _ = child.kill();
    let _ = child.wait();
    let _ = read_handle.join();
    info!("Local shell session ended");
}

async fn handle_ssh_shell(
    socket: &mut WebSocket,
    server_id: uuid::Uuid,
    _cols: u16,
    _rows: u16,
    state: AppState,
) {
    info!("Starting SSH shell session for server {server_id}");

    // Look up server from SSH manager
    let Some(server) = state.ssh.get_server(server_id).await else {
        let _ = socket
            .send(Message::Text(
                "\r\nError: SSH server not found\r\n".to_string().into(),
            ))
            .await;
        return;
    };

    let _ = socket
        .send(Message::Text(
            format!(
                "\r\nConnecting to {}@{}:{}...\r\n",
                server.username, server.host, server.port
            )
            .into(),
        ))
        .await;

    // TODO: Implement actual SSH connection using russh
    // For now, send a placeholder message
    let _ = socket
        .send(Message::Text(
            "\r\nSSH connection not yet implemented. Please use local shell for now.\r\n"
                .to_string()
                .into(),
        ))
        .await;
}

/// Parse resize message: "\x1b[resize:COLSxROWS"
fn parse_resize(text: &str) -> Option<(u16, u16)> {
    let rest = text.strip_prefix("\x1b[resize:")?;
    let inner = rest.trim_end_matches(']');
    let mut parts = inner.splitn(2, 'x');
    let cols = parts.next()?.parse::<u16>().ok()?;
    let rows = parts.next()?.parse::<u16>().ok()?;
    Some((cols, rows))
}
