//! SMB2/SMB3 client for browsing remote shares via pure Rust protocol.
//!
//! Uses the `smolder-smb-core` crate to connect directly to SMB shares
//! without OS-level mount commands.
//!
//! URI format:
//! - `smb://[user[:pass]@]host[:port]` for server-root browsing
//! - `smb://[user[:pass]@]host[:port]/share[/path]` for direct share access

use std::collections::HashMap;
use std::sync::Arc;

use smolder_core::auth::NtlmCredentials;
use smolder_core::facade::{Client, Share};
use smolder_core::srvsvc::ShareInfo1;
use smolder_proto::smb::smb2::GlobalCapabilities;
use tokio::sync::Mutex;
use tracing::debug;

use crate::types::{VfsFileContent, VfsNode};

#[allow(private_interfaces)]
#[derive(Debug, Clone)]
/// Parsed SMB connection info.
struct SmbConnInfo {
    server: String,
    port: u16,
    share: Option<String>,
    username: String,
    password: String,
    base_path: String,
}

#[derive(Debug, Clone)]
enum SmbTarget {
    ServerRoot,
    Share { share: String, share_path: String },
}

/// Pool of SMB connections keyed by mount ID.
/// Each mount keeps a reusable SMB client plus per-share pooled sessions.
pub(crate) struct SmbClientPool {
    clients: Mutex<HashMap<String, Arc<Client>>>,
    shares: Mutex<HashMap<String, HashMap<String, Arc<Mutex<Option<Share>>>>>>,
    conn_infos: Mutex<HashMap<String, SmbConnInfo>>,
}

impl SmbClientPool {
    pub fn new() -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
            shares: Mutex::new(HashMap::new()),
            conn_infos: Mutex::new(HashMap::new()),
        }
    }

    /// Register connection info for a mount.
    pub async fn register(&self, mount_id: &str, smb_uri: &str) -> Result<(), String> {
        let info = parse_smb_uri(smb_uri)?;

        let client = Client::builder(info.server.clone())
            .with_port(info.port)
            .with_ntlm_credentials(NtlmCredentials::new(
                if info.username.is_empty() {
                    "guest"
                } else {
                    &info.username
                },
                &info.password,
            ))
            // Use empty capabilities for maximum server compatibility.
            // Advertising ENCRYPTION (or even LEASING) can trigger negotiate
            // context rejection on some NAS/Windows Home servers with
            // STATUS_INVALID_PARAMETER (0xc000000d).
            .with_capabilities(GlobalCapabilities::empty())
            .build()
            .map_err(|e| format!("SMB client build failed: {e}"))?;

        self.clients
            .lock()
            .await
            .insert(mount_id.to_string(), Arc::new(client));
        self.shares
            .lock()
            .await
            .insert(mount_id.to_string(), HashMap::new());
        self.conn_infos
            .lock()
            .await
            .insert(mount_id.to_string(), info);
        Ok(())
    }

    /// Get the registered connection info for a mount.
    async fn get_info(&self, mount_id: &str) -> Result<SmbConnInfo, String> {
        let infos = self.conn_infos.lock().await;
        infos
            .get(mount_id)
            .cloned()
            .ok_or_else(|| format!("SMB mount {mount_id} info not found"))
    }

    /// Get or create a share connection for the given mount and share.
    async fn get_share(&self, mount_id: &str, share_name: &str) -> Result<Share, String> {
        let share_slot = {
            let mut shares = self.shares.lock().await;
            shares
                .entry(mount_id.to_string())
                .or_default()
                .entry(share_name.to_string())
                .or_insert_with(|| Arc::new(Mutex::new(None)))
                .clone()
        };

        {
            let mut guard = share_slot.lock().await;
            if let Some(share) = guard.take() {
                return Ok(share);
            }
        }

        let client = {
            let clients = self.clients.lock().await;
            clients
                .get(mount_id)
                .cloned()
                .ok_or_else(|| format!("SMB mount {mount_id} client not found"))?
        };

        let info = self.get_info(mount_id).await?;
        debug!(
            "Connecting to SMB: {}:{}/{} as {}",
            info.server, info.port, share_name, info.username
        );

        client
            .connect_share(share_name)
            .await
            .map_err(|e| format!("SMB connect failed: {e}"))
    }

    /// Return a share to the pool for reuse.
    async fn put_share(&self, mount_id: &str, share_name: &str, share: Share) {
        let slot = {
            let shares = self.shares.lock().await;
            shares
                .get(mount_id)
                .and_then(|mount_shares| mount_shares.get(share_name))
                .cloned()
        };

        if let Some(slot) = slot {
            let mut guard = slot.lock().await;
            if guard.is_none() {
                *guard = Some(share);
            }
        }
    }

    /// Remove a mount from the pool.
    #[allow(dead_code)]
    pub async fn remove(&self, mount_id: &str) {
        self.clients.lock().await.remove(mount_id);
        self.shares.lock().await.remove(mount_id);
        self.conn_infos.lock().await.remove(mount_id);
    }

    async fn list_shares(&self, mount_id: &str) -> Result<Vec<ShareInfo1>, String> {
        let client = {
            let clients = self.clients.lock().await;
            clients
                .get(mount_id)
                .cloned()
                .ok_or_else(|| format!("SMB mount {mount_id} client not found"))?
        };

        let mut srvsvc = client
            .connect_srvsvc()
            .await
            .map_err(|e| format!("SMB srvsvc connect failed: {e}"))?;
        srvsvc
            .share_enum_level1()
            .await
            .map_err(|e| format!("SMB share enumeration failed: {e}"))
    }
}

#[allow(private_interfaces)]
pub(crate) fn parse_smb_uri(uri: &str) -> Result<SmbConnInfo, String> {
    let stripped = uri
        .strip_prefix("smb://")
        .ok_or_else(|| format!("Not an smb:// URI: {uri}"))?;

    let (authority, share_path) = match stripped.find('/') {
        Some(idx) => (&stripped[..idx], stripped[idx..].to_string()),
        None => (stripped, String::new()),
    };

    let (userinfo, hostport) = match authority.rfind('@') {
        Some(idx) => (Some(&authority[..idx]), &authority[idx + 1..]),
        None => (None, authority),
    };

    let (host, port) = match hostport.rfind(':') {
        Some(idx) => {
            let p = hostport[idx + 1..]
                .parse::<u16>()
                .map_err(|_| "Invalid SMB port".to_string())?;
            (&hostport[..idx], p)
        }
        None => (hostport, 445u16),
    };

    let (username, password) = match userinfo {
        None => (String::new(), String::new()),
        Some(ui) => match ui.find(':') {
            Some(idx) => (ui[..idx].to_string(), ui[idx + 1..].to_string()),
            None => (ui.to_string(), String::new()),
        },
    };

    // `smb://host` or `smb://host/` means server root.
    // `smb://host/share[/sub/path]` targets a specific share.
    let share = if share_path.is_empty() || share_path == "/" {
        None
    } else {
        let parts: Vec<&str> = share_path.splitn(3, '/').collect();
        if parts.len() >= 2 && !parts[1].is_empty() {
            Some(parts[1].to_string())
        } else {
            return Err("SMB URI must include a share name".to_string());
        }
    };
    let base_path = if share.is_some() {
        let parts: Vec<&str> = share_path.splitn(3, '/').collect();
        if parts.len() >= 3 {
            format!("/{}", parts[2])
        } else {
            "/".to_string()
        }
    } else {
        "/".to_string()
    };

    Ok(SmbConnInfo {
        server: host.to_string(),
        port,
        share,
        username,
        password,
        base_path,
    })
}

// ─── Path helpers ────────────────────────────────────────────────────────────

/// Convert a VFS path (relative to share base) to an SMB share path.
fn to_share_path(base_path: &str, vfs_path: &str) -> String {
    let clean = vfs_path.trim_start_matches('/');
    if clean.is_empty() {
        base_path.to_string()
    } else if base_path == "/" {
        format!("/{clean}")
    } else {
        format!("{base_path}/{clean}")
    }
}

fn is_hidden_share(name: &str) -> bool {
    name.eq_ignore_ascii_case("IPC$") || name.ends_with('$')
}

fn resolve_server_target(vfs_path: &str) -> Option<(String, String)> {
    let clean = vfs_path.trim_start_matches('/');
    if clean.is_empty() {
        return None;
    }

    let mut parts = clean.splitn(2, '/');
    let share = parts.next().unwrap_or_default();
    if share.is_empty() {
        return None;
    }

    let share_path = match parts.next() {
        Some(rest) if !rest.is_empty() => format!("/{}", rest),
        _ => "/".to_string(),
    };

    Some((share.to_string(), share_path))
}

fn resolve_target(info: &SmbConnInfo, vfs_path: &str) -> Result<SmbTarget, String> {
    if let Some(share) = &info.share {
        return Ok(SmbTarget::Share {
            share: share.clone(),
            share_path: to_share_path(&info.base_path, vfs_path),
        });
    }

    match resolve_server_target(vfs_path) {
        None => Ok(SmbTarget::ServerRoot),
        Some((share, share_path)) => Ok(SmbTarget::Share { share, share_path }),
    }
}

async fn list_server_root(
    pool: &SmbClientPool,
    mount_id: &str,
    show_hidden: bool,
) -> Result<Vec<VfsNode>, String> {
    let info = pool.get_info(mount_id).await?;
    let shares = pool.list_shares(mount_id).await?;
    let mut nodes = Vec::new();

    for share in shares {
        if !show_hidden && is_hidden_share(&share.name) {
            continue;
        }

        nodes.push(VfsNode {
            name: share.name.clone(),
            path: format!("/{}", share.name),
            is_dir: true,
            size: None,
            modified: None,
            permissions: None,
        });
    }

    nodes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    debug!(
        "Listed SMB server root for {}:{} with {} shares",
        info.server,
        info.port,
        nodes.len()
    );
    Ok(nodes)
}

// ─── VFS operations ──────────────────────────────────────────────────────────

/// List directory contents via SMB.
pub(crate) async fn list_dir(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
    show_hidden: bool,
) -> Result<Vec<VfsNode>, String> {
    let info = pool.get_info(mount_id).await?;
    let target = resolve_target(&info, vfs_path)?;

    match target {
        SmbTarget::ServerRoot => list_server_root(pool, mount_id, show_hidden).await,
        SmbTarget::Share { share, share_path } => {
            let mut smb_share = pool.get_share(mount_id, &share).await?;
            let result = async {
                let entries = smb_share
                    .list(&share_path)
                    .await
                    .map_err(|e| format!("SMB list failed: {e}"))?;

                let mut nodes = Vec::new();
                for entry in entries {
                    let is_dir = entry.is_directory();
                    let name = entry.name;
                    if !show_hidden && name.starts_with('.') {
                        continue;
                    }

                    let size = entry.metadata.size;
                    let modified = entry.metadata.written.map(|t| format_system_time(&t));
                    let base_path = vfs_path.trim_end_matches('/');

                    let node_path = if base_path.is_empty() || base_path == "/" {
                        format!("/{name}")
                    } else {
                        format!("{base_path}/{name}")
                    };

                    nodes.push(VfsNode {
                        name,
                        path: node_path,
                        is_dir,
                        size: Some(size),
                        modified,
                        permissions: None,
                    });
                }
                Ok(nodes)
            }
            .await;

            pool.put_share(mount_id, &share, smb_share).await;
            result
        }
    }
}

/// Read a file's text content via SMB.
pub(crate) async fn read_file(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
    max_bytes: Option<u64>,
) -> Result<VfsFileContent, String> {
    let raw = read_file_raw(pool, mount_id, vfs_path).await?;
    let size = raw.len();
    let truncated = max_bytes.is_some_and(|m| (m as usize) < size);

    let content = String::from_utf8_lossy(&raw).to_string();
    let is_binary = content.contains('\u{FFFD}');

    Ok(VfsFileContent {
        path: vfs_path.to_string(),
        size: size as u64,
        content,
        is_binary,
        truncated,
    })
}

/// Read raw file bytes via SMB.
pub(crate) async fn read_file_raw(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
) -> Result<Vec<u8>, String> {
    let info = pool.get_info(mount_id).await?;
    let target = resolve_target(&info, vfs_path)?;
    let (share_name, share_path) = match target {
        SmbTarget::ServerRoot => {
            return Err("Cannot read the SMB server root; select a share first".to_string());
        }
        SmbTarget::Share { share, share_path } => (share, share_path),
    };
    let mut share = pool.get_share(mount_id, &share_name).await?;

    let result = async {
        share
            .read(&share_path)
            .await
            .map_err(|e| format!("SMB read failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, &share_name, share).await;
    result
}

/// Write text content to a file via SMB.
pub(crate) async fn write_file(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
    content: &str,
) -> Result<(), String> {
    upload_file(pool, mount_id, vfs_path, content.as_bytes()).await
}

/// Upload raw binary data to a file via SMB.
pub(crate) async fn upload_file(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
    data: &[u8],
) -> Result<(), String> {
    let info = pool.get_info(mount_id).await?;
    let target = resolve_target(&info, vfs_path)?;
    let (share_name, share_path) = match target {
        SmbTarget::ServerRoot => {
            return Err("Cannot write into the SMB server root; select a share first".to_string());
        }
        SmbTarget::Share { share, share_path } => (share, share_path),
    };
    let mut share = pool.get_share(mount_id, &share_name).await?;

    let result = async {
        share
            .write(&share_path, data)
            .await
            .map_err(|e| format!("SMB write failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, &share_name, share).await;
    result
}

/// Create a directory via SMB.
pub(crate) async fn mkdir(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
) -> Result<(), String> {
    let info = pool.get_info(mount_id).await?;
    let target = resolve_target(&info, vfs_path)?;
    let (share_name, share_path) = match target {
        SmbTarget::ServerRoot => {
            return Err(
                "Cannot create directories in the SMB server root; select a share first"
                    .to_string(),
            );
        }
        SmbTarget::Share { share, share_path } => (share, share_path),
    };
    let mut share = pool.get_share(mount_id, &share_name).await?;

    let result = async {
        share
            .create_dir(&share_path)
            .await
            .map_err(|e| format!("SMB mkdir failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, &share_name, share).await;
    result
}

/// Delete a file via SMB.
pub(crate) async fn delete(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
) -> Result<(), String> {
    let info = pool.get_info(mount_id).await?;
    let target = resolve_target(&info, vfs_path)?;
    let (share_name, share_path) = match target {
        SmbTarget::ServerRoot => {
            return Err("Cannot delete the SMB server root; select a share first".to_string());
        }
        SmbTarget::Share { share, share_path } => (share, share_path),
    };
    let mut share = pool.get_share(mount_id, &share_name).await?;

    let result = async {
        share
            .remove(&share_path)
            .await
            .map_err(|e| format!("SMB delete failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, &share_name, share).await;
    result
}

/// Move/rename a file or directory via SMB.
pub(crate) async fn move_file(
    pool: &SmbClientPool,
    mount_id: &str,
    src_vfs_path: &str,
    dest_vfs_path: &str,
) -> Result<(), String> {
    let info = pool.get_info(mount_id).await?;
    let src_target = resolve_target(&info, src_vfs_path)?;
    let dest_target = resolve_target(&info, dest_vfs_path)?;

    match (src_target, dest_target) {
        (
            SmbTarget::Share {
                share: src_share,
                share_path: src_share_path,
            },
            SmbTarget::Share {
                share: dest_share,
                share_path: dest_share_path,
            },
        ) => {
            if src_share.eq_ignore_ascii_case(&dest_share) {
                let mut share = pool.get_share(mount_id, &src_share).await?;
                let result = async {
                    share
                        .rename(&src_share_path, &dest_share_path)
                        .await
                        .map_err(|e| format!("SMB rename failed: {e}"))
                }
                .await;

                pool.put_share(mount_id, &src_share, share).await;
                result
            } else {
                let data = read_file_raw(pool, mount_id, src_vfs_path).await?;
                upload_file(pool, mount_id, dest_vfs_path, &data).await?;
                delete(pool, mount_id, src_vfs_path).await
            }
        }
        _ => Err("Cannot move items at the SMB server root; select a share first".to_string()),
    }
}

/// Copy a file via SMB (read + write, since SMB2 doesn't have server-side copy).
pub(crate) async fn copy_file(
    pool: &SmbClientPool,
    mount_id: &str,
    src_vfs_path: &str,
    dest_vfs_path: &str,
) -> Result<(), String> {
    let info = pool.get_info(mount_id).await?;
    let src_target = resolve_target(&info, src_vfs_path)?;
    let dest_target = resolve_target(&info, dest_vfs_path)?;

    match (src_target, dest_target) {
        (SmbTarget::Share { .. }, SmbTarget::Share { .. }) => {
            let data = read_file_raw(pool, mount_id, src_vfs_path).await?;
            upload_file(pool, mount_id, dest_vfs_path, &data).await
        }
        _ => Err("Cannot copy items at the SMB server root; select a share first".to_string()),
    }
}

/// Quick TCP reachability probe for an SMB URI.
/// Works with or without a share name — just verifies the server is listening on port 445.
#[allow(dead_code)]
pub(crate) async fn probe_server(uri: &str) -> Result<(), String> {
    let stripped = uri
        .strip_prefix("smb://")
        .ok_or_else(|| format!("Not an smb:// URI: {uri}"))?;
    // Authority is everything before the first '/' (if any)
    let authority = match stripped.find('/') {
        Some(idx) => &stripped[..idx],
        None => stripped,
    };
    // Strip userinfo (user:pass@)
    let hostport = match authority.rfind('@') {
        Some(idx) => &authority[idx + 1..],
        None => authority,
    };
    // Split host:port
    let (host, port) = match hostport.rfind(':') {
        Some(idx) => {
            let p: u16 = hostport[idx + 1..].parse().unwrap_or(445);
            (&hostport[..idx], p)
        }
        None => (hostport, 445u16),
    };
    tokio::net::TcpStream::connect(format!("{host}:{port}"))
        .await
        .map(|_| ())
        .map_err(|e| format!("SMB server not reachable at {host}:{port}: {e}"))
}

/// Get file/directory metadata via SMB.
pub(crate) async fn stat(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
) -> Result<VfsNode, String> {
    let info = pool.get_info(mount_id).await?;
    let target = resolve_target(&info, vfs_path)?;

    match target {
        SmbTarget::ServerRoot => Ok(VfsNode {
            name: info.server,
            path: "/".to_string(),
            is_dir: true,
            size: None,
            modified: None,
            permissions: None,
        }),
        SmbTarget::Share { share, share_path } => {
            let mut smb_share = pool.get_share(mount_id, &share).await?;
            let result = async {
                let metadata = smb_share
                    .stat(&share_path)
                    .await
                    .map_err(|e| format!("SMB stat failed: {e}"))?;

                let name = if share_path == "/" {
                    share.clone()
                } else {
                    share_path.rsplit('/').next().unwrap_or("").to_string()
                };

                Ok(VfsNode {
                    name,
                    path: {
                        let trimmed = vfs_path.trim_end_matches('/');
                        if trimmed.is_empty() {
                            "/".to_string()
                        } else {
                            trimmed.to_string()
                        }
                    },
                    is_dir: metadata.is_directory(),
                    size: Some(metadata.size),
                    modified: metadata.written.map(|t| format_system_time(&t)),
                    permissions: None,
                })
            }
            .await;

            pool.put_share(mount_id, &share, smb_share).await;
            result
        }
    }
}

/// Search files/directories by name via SMB (enumerate and filter).
pub(crate) async fn search(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
    query: &str,
    max_results: Option<usize>,
) -> Result<Vec<VfsNode>, String> {
    let info = pool.get_info(mount_id).await?;
    let target = resolve_target(&info, vfs_path)?;
    let query_lower = query.to_lowercase();
    let max = max_results.unwrap_or(100);

    match target {
        SmbTarget::ServerRoot => {
            let all = list_server_root(pool, mount_id, true).await?;
            Ok(all
                .into_iter()
                .filter(|n| n.name.to_lowercase().contains(&query_lower))
                .take(max)
                .collect())
        }
        SmbTarget::Share { .. } => {
            let all = list_dir(pool, mount_id, vfs_path, true).await?;
            Ok(all
                .into_iter()
                .filter(|n| n.name.to_lowercase().contains(&query_lower))
                .take(max)
                .collect())
        }
    }
}

#[allow(dead_code)]
/// Test SMB connectivity by trying to connect and list the root.
pub(crate) async fn test_connection(smb_uri: &str) -> Result<(), String> {
    let info = parse_smb_uri(smb_uri)?;

    let client = Client::builder(info.server.clone())
        .with_port(info.port)
        .with_ntlm_credentials(NtlmCredentials::new(
            if info.username.is_empty() {
                "guest"
            } else {
                &info.username
            },
            &info.password,
        ))
        .build()
        .map_err(|e| format!("SMB client build failed: {e}"))?;

    if let Some(share_name) = &info.share {
        let mut share = client
            .connect_share(share_name)
            .await
            .map_err(|e| format!("SMB connection failed: {e}"))?;

        // Verify by listing the configured share root or base path.
        share
            .list(&info.base_path)
            .await
            .map_err(|e| format!("SMB share access failed: {e}"))?;

        let _ = share.logoff().await;
    } else {
        let mut srvsvc = client
            .connect_srvsvc()
            .await
            .map_err(|e| format!("SMB srvsvc connection failed: {e}"))?;
        let shares = srvsvc
            .share_enum_level1()
            .await
            .map_err(|e| format!("SMB share enumeration failed: {e}"))?;
        if shares.is_empty() {
            return Err("SMB server did not return any shares".to_string());
        }
    }
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn format_system_time(t: &std::time::SystemTime) -> String {
    use std::time::UNIX_EPOCH;
    let duration = t.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    // Simple year approximation for display
    let year = 1970 + (secs / 31_557_600);
    format!("{year}-??-??T??:??:??Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_smb_uri_full() {
        let info = parse_smb_uri("smb://alice:secret@fileserver.local:445/share/docs").unwrap();
        assert_eq!(info.username, "alice");
        assert_eq!(info.password, "secret");
        assert_eq!(info.server, "fileserver.local");
        assert_eq!(info.port, 445);
        assert_eq!(info.share, Some("share".to_owned()));
        assert_eq!(info.base_path, "/docs");
    }

    #[test]
    fn test_parse_smb_uri_no_creds() {
        let info = parse_smb_uri("smb://nas.home/backup").unwrap();
        assert_eq!(info.username, "");
        assert_eq!(info.password, "");
        assert_eq!(info.server, "nas.home");
        assert_eq!(info.port, 445);
        assert_eq!(info.share, Some("backup".to_owned()));
        assert_eq!(info.base_path, "/");
    }

    #[test]
    fn test_parse_smb_uri_custom_port() {
        let info = parse_smb_uri("smb://admin@server:4445/share").unwrap();
        assert_eq!(info.username, "admin");
        assert_eq!(info.server, "server");
        assert_eq!(info.port, 4445);
        assert_eq!(info.share, Some("share".to_owned()));
        assert_eq!(info.base_path, "/");
    }

    #[test]
    fn test_parse_smb_uri_server_root() {
        let info = parse_smb_uri("smb://host/").unwrap();
        assert_eq!(info.server, "host");
        assert_eq!(info.share, None);
        assert_eq!(info.base_path, "/");
    }

    #[test]
    fn test_parse_smb_uri_server_root_without_trailing_slash() {
        let info = parse_smb_uri("smb://host").unwrap();
        assert_eq!(info.server, "host");
        assert_eq!(info.share, None);
        assert_eq!(info.base_path, "/");
    }

    #[test]
    fn test_resolve_server_target() {
        assert_eq!(resolve_server_target("/"), None);
        assert_eq!(
            resolve_server_target("/Docs"),
            Some(("Docs".to_owned(), "/".to_owned()))
        );
        assert_eq!(
            resolve_server_target("/Docs/Projects"),
            Some(("Docs".to_owned(), "/Projects".to_owned()))
        );
    }

    #[test]
    fn test_to_share_path() {
        assert_eq!(to_share_path("/", "/"), "/");
        assert_eq!(to_share_path("/", "/foo"), "/foo");
        assert_eq!(to_share_path("/", "/foo/bar"), "/foo/bar");
        assert_eq!(to_share_path("/data", "/"), "/data");
        assert_eq!(to_share_path("/data", "file.txt"), "/data/file.txt");
    }
}
