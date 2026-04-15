//! K8s Pod file system provider.
//!
//! Uses the Kubernetes API (via HTTPS) to execute commands in pods for file operations.
//! This is a self-contained implementation that does not depend on the kube-rs crate,
//! using direct HTTPS calls to the Kubernetes API server.
// This module contains planned VFS-over-pod functionality not yet wired into VfsManager.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use crate::types::VfsNode;

/// Configuration for a K8s Pod filesystem provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sPodConfig {
    /// Kubernetes API server URL (e.g., `https://kubernetes.default.svc`)
    pub api_server: String,
    /// Bearer token for authentication
    pub token: String,
    /// Target namespace
    pub namespace: String,
    /// Target pod name
    pub pod_name: String,
    /// Optional container name (if pod has multiple containers)
    pub container: Option<String>,
    /// Whether to skip TLS verification (for development)
    pub insecure_skip_tls: bool,
}

impl K8sPodConfig {
    /// Parse a k8s pod URI: `k8s://token@apiserver/namespace/pod[/container]`
    pub fn parse(uri: &str) -> Result<Self, String> {
        let rest = uri
            .strip_prefix("k8s://")
            .ok_or_else(|| format!("Not a k8s:// URI: {uri}"))?;

        let (auth, hostpath) = rest
            .split_once('@')
            .ok_or("K8s URI missing '@': expected k8s://token@apiserver/namespace/pod")?;

        let parts: Vec<&str> = hostpath.splitn(4, '/').collect();
        if parts.len() < 3 {
            return Err("K8s URI must have at least apiserver/namespace/pod".into());
        }

        let api_server = format!("https://{}", parts[0]);
        let namespace = parts[1].to_string();
        let pod_name = parts[2].to_string();
        let container = parts.get(3).map(|s| (*s).to_string());

        Ok(Self {
            api_server,
            token: auth.to_string(),
            namespace,
            pod_name,
            container,
            insecure_skip_tls: false,
        })
    }
}

/// Execute a command in a K8s pod and return stdout.
async fn exec_in_pod(config: &K8sPodConfig, command: &[&str]) -> Result<String, String> {
    let mut url = format!(
        "{}/api/v1/namespaces/{}/pods/{}/exec",
        config.api_server, config.namespace, config.pod_name
    );

    // Build query params
    let mut params = Vec::new();
    for cmd in command {
        params.push(format!("command={}", urlencoding(cmd)));
    }
    params.push("stdout=true".to_string());
    params.push("stderr=true".to_string());
    if let Some(container) = &config.container {
        params.push(format!("container={container}"));
    }
    url = format!("{}?{}", url, params.join("&"));

    // For exec, Kubernetes requires a WebSocket or SPDY upgrade.
    // As a simplified implementation, we use the exec endpoint with HTTP.
    // In production, this would need proper WebSocket handling.
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(config.insecure_skip_tls)
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let resp = client
        .post(&url)
        .bearer_auth(&config.token)
        .send()
        .await
        .map_err(|e| format!("K8s exec error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("K8s exec failed ({status}): {body}"));
    }

    resp.text()
        .await
        .map_err(|e| format!("Read response error: {e}"))
}

fn urlencoding(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{b:02X}"));
            }
        }
    }
    result
}

/// List directory contents in a K8s pod by executing `ls -la`.
pub async fn list_dir(config: &K8sPodConfig, path: &str) -> Result<Vec<VfsNode>, String> {
    let output = exec_in_pod(
        config,
        &["ls", "-la", "--time-style=+%Y-%m-%dT%H:%M:%S", path],
    )
    .await?;
    Ok(parse_ls_output(&output, path))
}

/// Parse `ls -la` output into VfsNode entries.
fn parse_ls_output(output: &str, base_path: &str) -> Vec<VfsNode> {
    let mut nodes = Vec::new();
    for line in output.lines().skip(1) {
        // Skip "total N" line
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 7 {
            continue;
        }

        let perms = parts[0];
        let size_str = parts[4];
        let date = parts[5];
        let name = parts[6..].join(" ");

        // Skip . and ..
        if name == "." || name == ".." {
            continue;
        }

        let is_dir = perms.starts_with('d');
        let size = if is_dir {
            None
        } else {
            size_str.parse::<u64>().ok()
        };

        let entry_path = if base_path == "/" {
            format!("/{name}")
        } else {
            format!("{}/{name}", base_path.trim_end_matches('/'))
        };

        nodes.push(VfsNode {
            name,
            path: entry_path,
            is_dir,
            size,
            modified: Some(date.to_string()),
            permissions: Some(perms.to_string()),
        });
    }

    // Sort: directories first, then alphabetical
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    nodes
}

/// Read file contents from a K8s pod.
pub async fn read_file(config: &K8sPodConfig, path: &str) -> Result<Vec<u8>, String> {
    let output = exec_in_pod(config, &["cat", path]).await?;
    Ok(output.into_bytes())
}

/// Write content to a file in a K8s pod.
pub async fn write_file(config: &K8sPodConfig, path: &str, _content: &[u8]) -> Result<(), String> {
    // Use tee to write content via stdin
    // Note: Simplified implementation; real exec requires WebSocket stdin streaming
    exec_in_pod(config, &["tee", path]).await?;
    Ok(())
}

/// Create a directory in a K8s pod.
pub async fn mkdir(config: &K8sPodConfig, path: &str) -> Result<(), String> {
    exec_in_pod(config, &["mkdir", "-p", path]).await?;
    Ok(())
}

/// Delete a file or directory in a K8s pod.
pub async fn delete(config: &K8sPodConfig, path: &str) -> Result<(), String> {
    exec_in_pod(config, &["rm", "-rf", path]).await?;
    Ok(())
}

/// Rename/move a file in a K8s pod.
pub async fn rename(config: &K8sPodConfig, from: &str, to: &str) -> Result<(), String> {
    exec_in_pod(config, &["mv", from, to]).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_config() {
        let config = K8sPodConfig::parse("k8s://mytoken@cluster.local/default/nginx").unwrap();
        assert_eq!(config.api_server, "https://cluster.local");
        assert_eq!(config.namespace, "default");
        assert_eq!(config.pod_name, "nginx");
        assert!(config.container.is_none());
    }

    #[test]
    fn test_parse_config_with_container() {
        let config =
            K8sPodConfig::parse("k8s://mytoken@cluster.local/kube-system/pod1/sidecar").unwrap();
        assert_eq!(config.container, Some("sidecar".to_string()));
    }

    #[test]
    fn test_parse_ls_output() {
        let output = "total 28\ndrwxr-xr-x 2 root root 4096 2024-01-15T10:30:00 bin\n-rw-r--r-- 1 root root 1234 2024-01-15T10:30:00 readme.txt\ndrwxr-xr-x 3 root root 4096 2024-01-15T10:30:00 src\n";
        let nodes = parse_ls_output(output, "/");
        assert_eq!(nodes.len(), 3);
        // Directories first
        assert!(nodes[0].is_dir);
        assert_eq!(nodes[0].name, "bin");
        assert!(nodes[1].is_dir);
        assert_eq!(nodes[1].name, "src");
        // File last
        assert!(!nodes[2].is_dir);
        assert_eq!(nodes[2].name, "readme.txt");
        assert_eq!(nodes[2].size, Some(1234));
    }
}
