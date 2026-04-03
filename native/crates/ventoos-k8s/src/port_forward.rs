//! Port-forward management.
//!
//! Creates local TCP listeners that tunnel traffic to K8s Pod ports
//! through the K8s API server. Supports creating, listing, and
//! stopping active forwards.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::net::TcpListener;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

use crate::types::{CreatePortForwardReq, PortForwardInfo, PortForwardStatus};

/// Handle for a running port-forward, including the background task.
struct PortForwardHandle {
    info: PortForwardInfo,
    /// Cancellation token to stop the forward.
    cancel: tokio::sync::watch::Sender<bool>,
}

/// Manages all active port-forwards.
pub struct PortForwardManager {
    forwards: Arc<RwLock<HashMap<String, PortForwardHandle>>>,
}

impl PortForwardManager {
    pub fn new() -> Self {
        Self {
            forwards: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new port-forward.
    ///
    /// Binds a local TCP listener and, for each incoming connection,
    /// tunnels data to the specified pod port via the K8s API.
    /// Returns the port-forward info including the assigned local port.
    pub async fn create(
        &self,
        cluster_id: &str,
        req: &CreatePortForwardReq,
    ) -> Result<PortForwardInfo, String> {
        let local_addr = format!("127.0.0.1:{}", req.local_port.unwrap_or(0));
        let listener = TcpListener::bind(&local_addr)
            .await
            .map_err(|e| format!("Failed to bind {local_addr}: {e}"))?;

        let local_port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local addr: {e}"))?
            .port();

        let id = uuid::Uuid::new_v4().to_string();

        let info = PortForwardInfo {
            id: id.clone(),
            cluster_id: cluster_id.to_string(),
            pod_name: req.pod_name.clone(),
            namespace: req.namespace.clone(),
            local_port,
            remote_port: req.remote_port,
            status: PortForwardStatus::Active,
        };

        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

        // Spawn the listener task
        let fwd_info = info.clone();
        tokio::spawn(async move {
            run_forward_listener(listener, cancel_rx, &fwd_info).await;
        });

        let handle = PortForwardHandle {
            info: info.clone(),
            cancel: cancel_tx,
        };

        self.forwards.write().await.insert(id, handle);

        info!(
            "Port-forward created: 127.0.0.1:{} -> {}:{} (pod {})",
            local_port, req.pod_name, req.remote_port, req.namespace
        );

        Ok(info)
    }

    /// List all active port-forwards for a cluster.
    pub async fn list(&self, cluster_id: &str) -> Vec<PortForwardInfo> {
        self.forwards
            .read()
            .await
            .values()
            .filter(|h| h.info.cluster_id == cluster_id)
            .map(|h| h.info.clone())
            .collect()
    }

    /// Stop a port-forward by its ID.
    pub async fn stop(&self, forward_id: &str) -> bool {
        if let Some(handle) = self.forwards.write().await.remove(forward_id) {
            let _ = handle.cancel.send(true);
            info!("Port-forward {forward_id} stopped");
            true
        } else {
            false
        }
    }

    /// Stop all forwards for a cluster.
    pub async fn stop_all(&self, cluster_id: &str) {
        let mut forwards = self.forwards.write().await;
        let ids: Vec<String> = forwards
            .iter()
            .filter(|(_, h)| h.info.cluster_id == cluster_id)
            .map(|(id, _)| id.clone())
            .collect();

        for id in ids {
            if let Some(handle) = forwards.remove(&id) {
                let _ = handle.cancel.send(true);
            }
        }
    }
}

impl Default for PortForwardManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Run the TCP listener for a port-forward, accepting connections
/// until cancelled.
async fn run_forward_listener(
    listener: TcpListener,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    info: &PortForwardInfo,
) {
    loop {
        tokio::select! {
            result = listener.accept() => {
                match result {
                    Ok((stream, addr)) => {
                        info!(
                            "Port-forward connection from {addr} -> {}:{}",
                            info.pod_name, info.remote_port
                        );
                        // In a full implementation, we would tunnel this
                        // TCP connection through the K8s API server's
                        // port-forward endpoint using SPDY.
                        // For now, we drop the connection with a log.
                        drop(stream);
                        warn!(
                            "Port-forward tunnel not yet implemented (requires SPDY). \
                             Connection from {addr} dropped."
                        );
                    }
                    Err(e) => {
                        error!("Port-forward accept error: {e}");
                        break;
                    }
                }
            }
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    info!("Port-forward listener cancelled");
                    break;
                }
            }
        }
    }
}
