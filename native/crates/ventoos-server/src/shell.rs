use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::Deserialize;
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tracing::{error, info};
use ventoos_vfs::sftp::{SshAuth, SshInfoProvider};

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

/// Minimal russh client handler for SSH shell sessions.
struct ShellSshHandler;

impl russh::client::Handler for ShellSshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all host keys — production should verify against known_hosts.
        Ok(true)
    }
}

async fn handle_ssh_shell(
    socket: &mut WebSocket,
    server_id: uuid::Uuid,
    cols: u16,
    rows: u16,
    state: AppState,
) {
    info!("Starting SSH shell session for server {server_id}");

    let id_str = server_id.to_string();

    // Resolve SSH connection info via SshInfoProvider
    let conn_info = match state.ssh.resolve(&id_str).await {
        Ok(info) => info,
        Err(e) => {
            let _ = socket
                .send(Message::Text(
                    format!("\r\nError resolving SSH credentials: {e}\r\n").into(),
                ))
                .await;
            return;
        }
    };

    let _ = socket
        .send(Message::Text(
            format!(
                "\r\nConnecting to {}@{}:{}...\r\n",
                conn_info.username, conn_info.host, conn_info.port
            )
            .into(),
        ))
        .await;

    // Establish SSH connection
    let config = Arc::new(russh::client::Config::default());
    let handler = ShellSshHandler;

    let mut session = match russh::client::connect(
        config,
        (conn_info.host.as_str(), conn_info.port),
        handler,
    )
    .await
    {
        Ok(s) => s,
        Err(e) => {
            let _ = socket
                .send(Message::Text(
                    format!("\r\nSSH connect failed: {e}\r\n").into(),
                ))
                .await;
            return;
        }
    };

    // Authenticate
    let auth_ok = match &conn_info.auth {
        SshAuth::Password(pw) => session
            .authenticate_password(&conn_info.username, pw)
            .await
            .map(|r| r.success())
            .unwrap_or(false),
        SshAuth::PrivateKey {
            key_pem,
            passphrase,
        } => {
            let key = match russh::keys::decode_secret_key(key_pem, passphrase.as_deref()) {
                Ok(k) => k,
                Err(e) => {
                    let _ = socket
                        .send(Message::Text(
                            format!("\r\nInvalid private key: {e}\r\n").into(),
                        ))
                        .await;
                    return;
                }
            };
            let key_with_alg = russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key), None);
            session
                .authenticate_publickey(&conn_info.username, key_with_alg)
                .await
                .map(|r| r.success())
                .unwrap_or(false)
        }
    };

    if !auth_ok {
        let _ = socket
            .send(Message::Text(
                "\r\nSSH authentication failed\r\n".to_string().into(),
            ))
            .await;
        return;
    }

    // Open channel, request PTY, and start shell
    let channel = match session.channel_open_session().await {
        Ok(ch) => ch,
        Err(e) => {
            let _ = socket
                .send(Message::Text(
                    format!("\r\nFailed to open SSH channel: {e}\r\n").into(),
                ))
                .await;
            return;
        }
    };

    if let Err(e) = channel
        .request_pty(true, "xterm-256color", cols.into(), rows.into(), 0, 0, &[])
        .await
    {
        let _ = socket
            .send(Message::Text(
                format!("\r\nFailed to request PTY: {e}\r\n").into(),
            ))
            .await;
        return;
    }

    if let Err(e) = channel.request_shell(true).await {
        let _ = socket
            .send(Message::Text(
                format!("\r\nFailed to start shell: {e}\r\n").into(),
            ))
            .await;
        return;
    }

    let _ = socket
        .send(Message::Text("\r\nConnected.\r\n".to_string().into()))
        .await;

    // Get a stream for the channel
    let mut stream = channel.into_stream();

    // Relay loop: WebSocket ↔ SSH channel
    let mut buf = vec![0u8; 4096];
    loop {
        tokio::select! {
            // SSH channel → WebSocket
            result = stream.read(&mut buf) => {
                match result {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            // WebSocket → SSH channel
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        // Handle resize messages
                        if let Some((new_cols, new_rows)) = parse_resize(&text) {
                            // russh doesn't easily support window-change on stream;
                            // the original channel handle is consumed by into_stream.
                            // Resize is best-effort here.
                            let _ = (new_cols, new_rows);
                            continue;
                        }
                        if stream.write_all(text.as_bytes()).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Binary(data))) => {
                        if stream.write_all(&data).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    _ => {}
                }
            }
        }
    }

    info!("SSH shell session ended for server {server_id}");
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
