//! SSH tunnel for database connections.
//!
//! Establishes an SSH session and forwards a local TCP port to a remote
//! database host through the SSH connection.

use std::sync::Arc;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tracing::{debug, error, info, warn};

use crate::types::SshTunnelConfig;

/// A running SSH tunnel that forwards `local_port` → SSH → `remote_host:remote_port`.
pub struct SshTunnel {
    pub local_port: u16,
    shutdown_tx: Option<oneshot::Sender<()>>,
    task: Option<tokio::task::JoinHandle<()>>,
}

impl SshTunnel {
    /// Start an SSH tunnel. Returns once the local listener is ready.
    pub async fn start(
        config: &SshTunnelConfig,
        remote_host: &str,
        remote_port: u16,
    ) -> Result<Self, String> {
        // Bind a local listener on a random port
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind local port: {e}"))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local addr: {e}"))?
            .port();

        info!("SSH tunnel local listener on 127.0.0.1:{local_port}");

        // Establish SSH connection
        let ssh_handle = connect_ssh(config).await?;
        let ssh_handle = Arc::new(ssh_handle);

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
        let remote_host = remote_host.to_string();

        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        info!("SSH tunnel shutting down");
                        break;
                    }
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((stream, addr)) => {
                                debug!("Tunnel accepted connection from {addr}");
                                let ssh = Arc::clone(&ssh_handle);
                                let rh = remote_host.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = Box::pin(forward_connection(ssh, stream, &rh, remote_port)).await {
                                        warn!("Tunnel forward error: {e}");
                                    }
                                });
                            }
                            Err(e) => {
                                error!("Tunnel accept error: {e}");
                                break;
                            }
                        }
                    }
                }
            }
        });

        Ok(Self {
            local_port,
            shutdown_tx: Some(shutdown_tx),
            task: Some(task),
        })
    }

    /// Stop the tunnel.
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Minimal SSH client handler that accepts all host keys.
struct TunnelSshHandler;

impl russh::client::Handler for TunnelSshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all host keys — production should verify against known_hosts.
        Ok(true)
    }
}

/// Connect and authenticate to the SSH server.
async fn connect_ssh(
    config: &SshTunnelConfig,
) -> Result<russh::client::Handle<TunnelSshHandler>, String> {
    let ssh_config = Arc::new(russh::client::Config::default());
    let handler = TunnelSshHandler;

    debug!("SSH tunnel connecting to {}:{}", config.host, config.port);

    let mut session =
        russh::client::connect(ssh_config, (config.host.as_str(), config.port), handler)
            .await
            .map_err(|e| format!("SSH connect failed: {e}"))?;

    // Authenticate
    let auth_ok = match &config.auth {
        crate::types::SshTunnelAuth::Password(pw) => session
            .authenticate_password(&config.username, pw)
            .await
            .map_err(|e| format!("SSH password auth failed: {e}"))?,
        crate::types::SshTunnelAuth::PrivateKey {
            key_pem,
            passphrase,
        } => {
            let key = russh::keys::decode_secret_key(key_pem, passphrase.as_deref())
                .map_err(|e| format!("Invalid private key: {e}"))?;
            let key_with_alg = russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key), None);
            session
                .authenticate_publickey(&config.username, key_with_alg)
                .await
                .map_err(|e| format!("SSH key auth failed: {e}"))?
        }
    };

    if !auth_ok.success() {
        return Err("SSH authentication failed".into());
    }

    info!(
        "SSH tunnel authenticated to {}:{}",
        config.host, config.port
    );
    Ok(session)
}

/// Forward a single TCP connection through SSH direct-tcpip channel.
async fn forward_connection(
    ssh: Arc<russh::client::Handle<TunnelSshHandler>>,
    mut tcp_stream: tokio::net::TcpStream,
    remote_host: &str,
    remote_port: u16,
) -> Result<(), String> {
    let channel = ssh
        .channel_open_direct_tcpip(remote_host, remote_port.into(), "127.0.0.1", 0)
        .await
        .map_err(|e| format!("SSH direct-tcpip failed: {e}"))?;

    let mut stream = channel.into_stream();
    let (mut tcp_read, mut tcp_write) = tcp_stream.split();
    let (mut ssh_read, mut ssh_write) = tokio::io::split(&mut stream);

    let client_to_ssh = async {
        let mut buf = [0u8; 8192];
        loop {
            let n = tcp_read.read(&mut buf).await.map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            ssh_write
                .write_all(&buf[..n])
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok::<_, String>(())
    };

    let ssh_to_client = async {
        let mut buf = [0u8; 8192];
        loop {
            let n = ssh_read.read(&mut buf).await.map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            tcp_write
                .write_all(&buf[..n])
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok::<_, String>(())
    };

    tokio::select! {
        r = client_to_ssh => { r?; }
        r = ssh_to_client => { r?; }
    }

    Ok(())
}
