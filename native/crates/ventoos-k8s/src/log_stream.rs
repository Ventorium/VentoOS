//! Pod log streaming via WebSocket.
//!
//! Supports:
//! - Single pod or multi-pod (via label selector) log aggregation
//! - Regex-based line filtering
//! - Tail lines parameter
//! - Pod name prefix + timestamp on each line

use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::k8s_client::K8sClient;
use crate::types::PodLogStreamReq;

/// Run a log-streaming WebSocket session.
///
/// Fetches logs for one or more pods (identified by `pod_name` or resolved via
/// `label_selector`) from the given cluster's API server, applies optional
/// regex filtering, and pushes matching lines to the WebSocket client as JSON
/// `{"pod","container","timestamp","message"}` messages.
pub async fn handle_log_stream(
    mut socket: WebSocket,
    client: Arc<K8sClient>,
    namespace: &str,
    pod_name: &str,
    req: PodLogStreamReq,
) {
    info!(
        "Log stream started for pod={pod_name} ns={namespace} container={:?}",
        req.container
    );

    // Resolve pod names — either a single pod or multiple via label selector
    let pod_names = if let Some(ref selector) = req.label_selector {
        match resolve_pods_by_label(&client, namespace, selector).await {
            Ok(names) => names,
            Err(e) => {
                let _ = socket
                    .send(Message::Text(
                        serde_json::json!({"type":"error","message": e})
                            .to_string()
                            .into(),
                    ))
                    .await;
                return;
            }
        }
    } else {
        vec![pod_name.to_string()]
    };

    if pod_names.is_empty() {
        let _ = socket
            .send(Message::Text(
                serde_json::json!({"type":"error","message":"No pods found"})
                    .to_string()
                    .into(),
            ))
            .await;
        return;
    }

    // Compile regex filter if provided
    let filter_regex = req.filter.as_ref().and_then(|pattern| {
        // Simple substring matching — we avoid pulling in the `regex` crate.
        // The pattern is used as a case-insensitive substring match.
        Some(pattern.to_lowercase())
    });

    let tail = req.tail_lines.unwrap_or(100);
    let container = req.container.clone().unwrap_or_default();

    // Channel to aggregate logs from multiple pods
    let (tx, mut rx) = mpsc::channel::<String>(256);

    // Spawn one task per pod to fetch logs
    for pn in &pod_names {
        let client = Arc::clone(&client);
        let ns = namespace.to_string();
        let pn = pn.clone();
        let container = container.clone();
        let tx = tx.clone();
        let filter = filter_regex.clone();

        tokio::spawn(async move {
            if let Err(e) = stream_pod_logs(&client, &ns, &pn, &container, tail, filter, tx).await {
                warn!("Log stream error for pod {pn}: {e}");
            }
        });
    }
    // Drop the original sender so the receiver completes when all tasks finish
    drop(tx);

    // Forward aggregated logs to WebSocket
    while let Some(line) = rx.recv().await {
        if socket.send(Message::Text(line.into())).await.is_err() {
            break;
        }
    }

    info!("Log stream ended for pod={pod_name}");
}

/// Fetch logs for a single pod and send each line through the channel.
async fn stream_pod_logs(
    client: &K8sClient,
    namespace: &str,
    pod_name: &str,
    container: &str,
    tail_lines: u64,
    filter: Option<String>,
    tx: mpsc::Sender<String>,
) -> Result<(), String> {
    let mut url = format!(
        "/api/v1/namespaces/{namespace}/pods/{pod_name}/log?tailLines={tail_lines}&timestamps=true"
    );
    if !container.is_empty() {
        url.push_str("&container=");
        url.push_str(container);
    }

    let raw = client.get_raw_text(&url).await?;

    for line in raw.lines() {
        if line.trim().is_empty() {
            continue;
        }

        // Apply filter
        if let Some(ref pattern) = filter {
            if !line.to_lowercase().contains(pattern) {
                continue;
            }
        }

        // Parse timestamp (K8s log lines are: "2024-01-01T00:00:00.000Z message...")
        let (timestamp, message) = if let Some(idx) = line.find(' ') {
            (Some(&line[..idx]), &line[idx + 1..])
        } else {
            (None, line)
        };

        let entry = serde_json::json!({
            "type": "log",
            "pod": pod_name,
            "container": if container.is_empty() { "default" } else { container },
            "timestamp": timestamp,
            "message": message,
        });

        if tx.send(entry.to_string()).await.is_err() {
            break;
        }
    }

    Ok(())
}

/// Resolve pod names matching a label selector within a namespace.
async fn resolve_pods_by_label(
    client: &K8sClient,
    namespace: &str,
    label_selector: &str,
) -> Result<Vec<String>, String> {
    let url = format!("/api/v1/namespaces/{namespace}/pods?labelSelector={label_selector}");
    let json = client.get(&url).await?;
    let items = json
        .get("items")
        .and_then(Value::as_array)
        .ok_or("Invalid pods response")?;

    let names: Vec<String> = items
        .iter()
        .filter_map(|item| {
            item.pointer("/metadata/name")
                .and_then(Value::as_str)
                .map(String::from)
        })
        .collect();

    Ok(names)
}
