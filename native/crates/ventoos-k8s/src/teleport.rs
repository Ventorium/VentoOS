//! Teleport integration for Kubernetes cluster discovery.
//!
//! Wraps the `tsh` CLI tool to perform:
//! 1. Login (password + optional OTP)
//! 2. List available Kubernetes clusters
//! 3. Generate kubeconfig for a specific cluster
// PTY operations are inherently low-level; allow unsafe in this module only.
#![allow(unsafe_code)]

use std::collections::HashMap;
use std::os::unix::io::{FromRawFd, IntoRawFd};
use std::os::unix::process::CommandExt;
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
    /// using a PTY so that tsh's terminal check passes, then feeds the
    /// password (and optional OTP) to the master end.
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

        if req.otp.is_some() {
            args.push("--mfa-mode=otp".to_string());
        }

        info!(proxy = %req.proxy, user = %req.user, "Teleport login attempt");

        // Run tsh inside a PTY so it thinks it has a terminal.
        let password = req.password.clone();
        let otp = req.otp.clone();

        let result = tokio::task::spawn_blocking(move || {
            login_with_pty("tsh", &args, &password, otp.as_deref())
        })
        .await;

        match result {
            Ok(Ok((success, output))) => {
                if success {
                    info!(proxy = %req.proxy, "Teleport login successful");
                    TeleportLoginResult {
                        success: true,
                        message: "Login successful".into(),
                        needs_otp: false,
                    }
                } else {
                    let needs_otp = output.contains("Enter an OTP")
                        || output.contains("MFA")
                        || output.contains("second factor")
                        || output.contains("multi-factor")
                        || output.contains("one-time password");

                    if needs_otp {
                        warn!(proxy = %req.proxy, "Teleport login requires OTP");
                    }

                    TeleportLoginResult {
                        success: false,
                        message: output.trim().to_string(),
                        needs_otp,
                    }
                }
            }
            Ok(Err(e)) => {
                error!("PTY login error: {e}");
                TeleportLoginResult {
                    success: false,
                    message: format!("Login error: {e}"),
                    needs_otp: false,
                }
            }
            Err(e) => {
                error!("spawn_blocking error: {e}");
                TeleportLoginResult {
                    success: false,
                    message: format!("Internal error: {e}"),
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

// ---------------------------------------------------------------------------
// PTY-based subprocess helper
// ---------------------------------------------------------------------------

/// Spawn `program` with `args` inside a pseudo-terminal so that programs that
/// check `isatty(stdin)` (e.g. `tsh`) believe they are running interactively.
///
/// After spawning, the function writes `password\n` to the PTY master, then
/// (if `otp` is `Some`) waits briefly and writes `otp\n`.
///
/// Returns `(exit_success, combined_output_string)`.
fn login_with_pty(
    program: &str,
    args: &[String],
    password: &str,
    otp: Option<&str>,
) -> Result<(bool, String), String> {
    use std::io::{Read, Write};
    use std::os::unix::io::RawFd;
    use std::time::{Duration, Instant};

    // ── 1. Open PTY pair ────────────────────────────────────────────────────
    let mut master_fd: RawFd = -1;
    let mut slave_fd: RawFd = -1;
    let rc = unsafe {
        libc::openpty(
            &mut master_fd,
            &mut slave_fd,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if rc != 0 {
        return Err(format!(
            "openpty failed: {}",
            std::io::Error::last_os_error()
        ));
    }

    // ── 2. Build Command, redirect all stdio to slave PTY ──────────────────
    let slave_file = unsafe { std::fs::File::from_raw_fd(slave_fd) };
    let slave_stdin = slave_file.try_clone().map_err(|e| e.to_string())?;
    let slave_stdout = slave_file
        .try_clone()
        .map_err(|e| format!("clone stdout: {e}"))?;
    let slave_stderr = slave_file
        .try_clone()
        .map_err(|e| format!("clone stderr: {e}"))?;
    // slave_file will be dropped here; its fd is dup-ed into the Command below.

    let slave_stdin_raw = slave_stdin.into_raw_fd();
    let slave_stdout_raw = slave_stdout.into_raw_fd();
    let slave_stderr_raw = slave_stderr.into_raw_fd();

    // We need to close the slave fd in *this* process after fork so that
    // reads on master don't block forever. We'll do that via pre_exec.
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    // Redirect stdio via unsafe pre_exec + dup2 into the slave PTY.
    unsafe {
        cmd.stdin(std::process::Stdio::from_raw_fd(slave_stdin_raw));
        cmd.stdout(std::process::Stdio::from_raw_fd(slave_stdout_raw));
        cmd.stderr(std::process::Stdio::from_raw_fd(slave_stderr_raw));
        // Create a new session so this process owns the PTY as its
        // controlling terminal.
        cmd.pre_exec(|| {
            libc::setsid();
            // Make slave the controlling terminal of this session.
            let fd = libc::open(
                b"/dev/tty\0".as_ptr() as *const libc::c_char,
                libc::O_RDWR | libc::O_NOCTTY,
            );
            if fd < 0 {
                // Try TIOCSCTTY directly on stdin (fd 0)
                libc::ioctl(0, libc::TIOCSCTTY as _, 0i32);
            } else {
                libc::close(fd);
            }
            Ok(())
        });
    }

    let mut child = cmd.spawn().map_err(|e| format!("spawn tsh: {e}"))?;

    // ── 3. Write password (and optional OTP) to master ──────────────────────
    let mut master_file = unsafe { std::fs::File::from_raw_fd(master_fd) };

    // Small delay to let tsh print its prompt before we send the password.
    std::thread::sleep(Duration::from_millis(300));
    master_file
        .write_all(format!("{password}\n").as_bytes())
        .map_err(|e| format!("write password: {e}"))?;

    if let Some(otp_code) = otp {
        // Wait a bit for tsh to process password and prompt for OTP.
        std::thread::sleep(Duration::from_millis(1500));
        master_file
            .write_all(format!("{otp_code}\n").as_bytes())
            .map_err(|e| format!("write otp: {e}"))?;
    }

    // ── 4. Read all output from master ──────────────────────────────────────
    // Set the master fd to non-blocking so we can drain remaining output
    // after the child exits without hanging.
    unsafe {
        let flags = libc::fcntl(master_fd, libc::F_GETFL, 0);
        libc::fcntl(master_fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
    }

    let deadline = Instant::now() + Duration::from_secs(45);
    let mut output = Vec::new();
    let mut buf = [0u8; 4096];

    loop {
        if Instant::now() > deadline {
            let _ = child.kill();
            return Err("Login timed out (45s)".into());
        }
        match child.try_wait() {
            Ok(Some(_status)) => {
                // Drain remaining output
                loop {
                    match master_file.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => output.extend_from_slice(&buf[..n]),
                    }
                }
                let text = String::from_utf8_lossy(&output).to_string();
                // Strip ANSI escape sequences
                let clean = strip_ansi(&text);
                return Ok((_status.success(), clean));
            }
            Ok(None) => {
                // Still running – read available output
                match master_file.read(&mut buf) {
                    Ok(0) => {}
                    Ok(n) => output.extend_from_slice(&buf[..n]),
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                    Err(_) => {}
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("wait error: {e}")),
        }
    }
}

/// Strip ANSI terminal escape sequences from a string.
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // ESC [ ... <final byte>
            if chars.peek() == Some(&'[') {
                chars.next();
                // consume until a letter
                for ic in chars.by_ref() {
                    if ic.is_ascii_alphabetic() {
                        break;
                    }
                }
            } else {
                // Other ESC sequence — consume one char
                chars.next();
            }
        } else {
            result.push(c);
        }
    }
    result
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
