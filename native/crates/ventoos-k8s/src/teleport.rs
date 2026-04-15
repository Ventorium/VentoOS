//! Teleport integration for Kubernetes cluster discovery.
//!
//! Wraps the `tsh` CLI tool to perform:
//! 1. Login (password + optional OTP)
//! 2. List available Kubernetes clusters
//! 3. Generate kubeconfig for a specific cluster

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

/// A Teleport session keyed by proxy address.
#[derive(Debug, Clone)]
struct TeleportSession {
    proxy: String,
    user: String,
    /// Whether the user is currently logged in (tsh login succeeded).
    logged_in: bool,
}

/// Manages Teleport sessions and wraps `tsh` CLI interactions.
pub struct TeleportManager {
    sessions: Arc<RwLock<HashMap<String, TeleportSession>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeleportLoginReq {
    pub proxy: String,
    pub user: String,
    pub password: String,
    /// Optional one-time password for 2FA.
    pub otp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeleportLoginResult {
    pub success: bool,
    pub message: String,
    /// If true, the server requires a 2FA/OTP code.
    pub needs_otp: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeleportKubeCluster {
    pub name: String,
    pub labels: HashMap<String, String>,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeleportKubeConfigResult {
    pub success: bool,
    pub message: String,
    /// The generated kubeconfig YAML content.
    pub kubeconfig: Option<String>,
}

impl TeleportManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Check if `tsh` is available on the system.
    pub async fn check_tsh_available() -> bool {
        Command::new("tsh")
            .arg("version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Login to Teleport proxy with password (and optional OTP).
    ///
    /// This runs: `tsh login --proxy=<proxy> --user=<user> --auth=local`
    /// with password piped via stdin.
    pub async fn login(&self, req: &TeleportLoginReq) -> TeleportLoginResult {
        // Check tsh availability first
        if !Self::check_tsh_available().await {
            return TeleportLoginResult {
                success: false,
                message: "tsh command not found. Please install Teleport client tools.".into(),
                needs_otp: false,
            };
        }

        let mut args = vec![
            "login".to_string(),
            format!("--proxy={}", req.proxy),
            format!("--user={}", req.user),
            "--auth=local".to_string(),
        ];

        if let Some(ref otp) = req.otp {
            args.push(format!("--mfa-mode=otp"));
            // tsh reads OTP from stdin after password
        }

        info!(proxy = %req.proxy, user = %req.user, "Teleport login attempt");

        let mut child = match Command::new("tsh")
            .args(&args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to spawn tsh: {e}");
                return TeleportLoginResult {
                    success: false,
                    message: format!("Failed to start tsh: {e}"),
                    needs_otp: false,
                };
            }
        };

        // Feed password (and optional OTP) via stdin
        if let Some(stdin) = child.stdin.as_mut() {
            use tokio::io::AsyncWriteExt;
            let mut input = format!("{}\n", req.password);
            if let Some(ref otp) = req.otp {
                input.push_str(&format!("{}\n", otp));
            }
            let _ = stdin.write_all(input.as_bytes()).await;
            let _ = stdin.shutdown().await;
        }

        match tokio::time::timeout(std::time::Duration::from_secs(30), child.wait_with_output())
            .await
        {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                if output.status.success() {
                    info!(proxy = %req.proxy, "Teleport login successful");
                    self.sessions.write().await.insert(
                        req.proxy.clone(),
                        TeleportSession {
                            proxy: req.proxy.clone(),
                            user: req.user.clone(),
                            logged_in: true,
                        },
                    );
                    TeleportLoginResult {
                        success: true,
                        message: "Login successful".into(),
                        needs_otp: false,
                    }
                } else {
                    let err_msg = if stderr.is_empty() {
                        stdout.to_string()
                    } else {
                        stderr.to_string()
                    };

                    // Detect if 2FA is required
                    let needs_otp = err_msg.contains("Enter your OTP")
                        || err_msg.contains("MFA")
                        || err_msg.contains("second factor")
                        || err_msg.contains("multi-factor");

                    if needs_otp {
                        warn!(proxy = %req.proxy, "Teleport login requires OTP");
                    }

                    TeleportLoginResult {
                        success: false,
                        message: err_msg.trim().to_string(),
                        needs_otp,
                    }
                }
            }
            Ok(Err(e)) => {
                error!("tsh process error: {e}");
                TeleportLoginResult {
                    success: false,
                    message: format!("tsh process error: {e}"),
                    needs_otp: false,
                }
            }
            Err(_) => {
                error!("tsh login timed out");
                TeleportLoginResult {
                    success: false,
                    message: "Login timed out (30s)".into(),
                    needs_otp: false,
                }
            }
        }
    }

    /// List available Kubernetes clusters from the Teleport proxy.
    ///
    /// Runs: `tsh kube ls --proxy=<proxy> --format=json`
    pub async fn list_kube_clusters(&self, proxy: &str) -> Result<Vec<TeleportKubeCluster>, String> {
        let output = Command::new("tsh")
            .args(["kube", "ls", &format!("--proxy={proxy}"), "--format=json"])
            .output()
            .await
            .map_err(|e| format!("Failed to run tsh kube ls: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("tsh kube ls failed: {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        // tsh kube ls --format=json outputs an array of objects
        let clusters: Vec<TeleportKubeCluster> =
            serde_json::from_str(&stdout).unwrap_or_else(|_| {
                // Fallback: parse line-by-line if JSON format isn't standard
                parse_kube_ls_text(&stdout)
            });

        Ok(clusters)
    }

    /// Generate kubeconfig for a specific Teleport Kubernetes cluster.
    ///
    /// Runs: `tsh kube login <cluster_name> --proxy=<proxy>` then reads kubeconfig.
    pub async fn get_kube_config(
        &self,
        proxy: &str,
        cluster_name: &str,
    ) -> TeleportKubeConfigResult {
        // First, login to the kube cluster
        let login_output = Command::new("tsh")
            .args([
                "kube",
                "login",
                cluster_name,
                &format!("--proxy={proxy}"),
            ])
            .output()
            .await;

        match login_output {
            Ok(output) if output.status.success() => {
                info!(
                    proxy,
                    cluster_name, "tsh kube login succeeded, reading kubeconfig"
                );
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return TeleportKubeConfigResult {
                    success: false,
                    message: format!("tsh kube login failed: {}", stderr.trim()),
                    kubeconfig: None,
                };
            }
            Err(e) => {
                return TeleportKubeConfigResult {
                    success: false,
                    message: format!("Failed to run tsh: {e}"),
                    kubeconfig: None,
                };
            }
        }

        // Now read the kubeconfig that tsh generates
        // tsh updates ~/.kube/config or uses KUBECONFIG env
        let kube_home = dirs_path();
        let kubeconfig_path = std::env::var("KUBECONFIG")
            .unwrap_or_else(|_| format!("{}/.kube/config", kube_home));

        match tokio::fs::read_to_string(&kubeconfig_path).await {
            Ok(content) => TeleportKubeConfigResult {
                success: true,
                message: "Kubeconfig generated".into(),
                kubeconfig: Some(content),
            },
            Err(e) => TeleportKubeConfigResult {
                success: false,
                message: format!("Failed to read kubeconfig: {e}"),
                kubeconfig: None,
            },
        }
    }

    /// Logout from a Teleport proxy.
    pub async fn logout(&self, proxy: &str) -> Result<(), String> {
        let _ = Command::new("tsh")
            .args(["logout", &format!("--proxy={proxy}")])
            .output()
            .await
            .map_err(|e| format!("tsh logout failed: {e}"))?;

        self.sessions.write().await.remove(proxy);
        Ok(())
    }
}

impl Default for TeleportManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Get user home directory.
fn dirs_path() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/root".into())
}

/// Fallback parser for `tsh kube ls` text output.
fn parse_kube_ls_text(text: &str) -> Vec<TeleportKubeCluster> {
    let mut clusters = Vec::new();
    let lines: Vec<&str> = text.lines().collect();

    // Skip header lines (first 2 lines typically: header + separator)
    for line in lines.iter().skip(2) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Format: "cluster_name   labels   selected"
        let parts: Vec<&str> = line.splitn(3, char::is_whitespace).collect();
        if let Some(name) = parts.first() {
            if !name.is_empty() && *name != "-" {
                clusters.push(TeleportKubeCluster {
                    name: name.to_string(),
                    labels: HashMap::new(),
                    selected: line.contains('*'),
                });
            }
        }
    }
    clusters
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_kube_ls_text() {
        let text = "Kube Cluster Name  Labels  Selected\n\
                     ----------------  ------  --------\n\
                     dev-cluster        env=dev  *\n\
                     staging-cluster    env=stg  \n";
        let clusters = parse_kube_ls_text(text);
        assert_eq!(clusters.len(), 2);
        assert_eq!(clusters[0].name, "dev-cluster");
        assert!(clusters[0].selected);
        assert_eq!(clusters[1].name, "staging-cluster");
        assert!(!clusters[1].selected);
    }

    #[test]
    fn test_parse_kube_ls_empty() {
        let text = "Kube Cluster Name  Labels  Selected\n\
                     ----------------  ------  --------\n";
        let clusters = parse_kube_ls_text(text);
        assert!(clusters.is_empty());
    }
}
