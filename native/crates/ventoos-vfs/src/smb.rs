//! SMB2/SMB3 client for browsing remote shares via pure Rust protocol.
//!
//! Uses the `smolder-smb-core` crate to connect directly to SMB shares
//! without OS-level mount commands.
//!
//! URI format: `smb://[user[:pass]@]host[:port]/share[/path]`

use std::collections::HashMap;
use std::sync::Arc;

use smolder_core::facade::{Client, Share};
use smolder_core::auth::NtlmCredentials;
use tokio::sync::Mutex;
use tracing::debug;

use crate::types::{VfsFileContent, VfsNode};

#[allow(private_interfaces)]
#[derive(Debug, Clone)]
/// Parsed SMB connection info.
struct SmbConnInfo {
    server: String,
    port: u16,
    share: String,
    username: String,
    password: String,
    base_path: String,
}

/// Pool of SMB connections keyed by mount ID.
/// Each mount gets its own `Share` wrapped in a `Mutex`.
pub(crate) struct SmbClientPool {
    clients: Mutex<HashMap<String, Arc<Client>>>,
    shares: Mutex<HashMap<String, Arc<Mutex<Option<Share>>>>>,
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
                if info.username.is_empty() { "guest" } else { &info.username },
                &info.password,
            ))
            .build()
            .map_err(|e| format!("SMB client build failed: {e}"))?;

        self.clients
            .lock()
            .await
            .insert(mount_id.to_string(), Arc::new(client));
        self.shares
            .lock()
            .await
            .insert(mount_id.to_string(), Arc::new(Mutex::new(None)));
        self.conn_infos
            .lock()
            .await
            .insert(mount_id.to_string(), info);
        Ok(())
    }

    /// Get or create a share connection for the given mount.
    async fn get_share(&self, mount_id: &str) -> Result<(Share, SmbConnInfo), String> {
        let share_slot = {
            let shares = self.shares.lock().await;
            shares
                .get(mount_id)
                .cloned()
                .ok_or_else(|| format!("SMB mount {mount_id} not registered"))?
        };

        // Take the share if available (moves out of Option)
        {
            let mut guard = share_slot.lock().await;
            if let Some(share) = guard.take() {
                // Try a quick echo to verify the connection is alive
                // We can't easily check without consuming, so just return it.
                // If it's broken, the next operation will fail and we reconnect.
                let infos = self.conn_infos.lock().await;
                if let Some(info) = infos.get(mount_id) {
                    return Ok((share, info.clone()));
                }
            }
        }

        // Need to create a new connection
        let client = {
            let clients = self.clients.lock().await;
            clients
                .get(mount_id)
                .cloned()
                .ok_or_else(|| format!("SMB mount {mount_id} client not found"))?
        };

        let info = {
            let infos = self.conn_infos.lock().await;
            infos
                .get(mount_id)
                .cloned()
                .ok_or_else(|| format!("SMB mount {mount_id} info not found"))?
        };

        debug!(
            "Connecting to SMB: {}:{}/{} as {}",
            info.server, info.port, info.share, info.username
        );

        let share = client
            .connect_share(&info.share)
            .await
            .map_err(|e| format!("SMB connect failed: {e}"))?;

        // Store the share back in the slot so it can be reused
        // Actually, we return it and the caller should put it back
        Ok((share, info))
    }

    /// Return a share to the pool for reuse.
    async fn put_share(&self, mount_id: &str, share: Share) {
        if let Some(slot) = self.shares.lock().await.get(mount_id) {
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
}

#[allow(private_interfaces)]
pub(crate) fn parse_smb_uri(uri: &str) -> Result<SmbConnInfo, String> {
    let stripped = uri
        .strip_prefix("smb://")
        .ok_or_else(|| format!("Not an smb:// URI: {uri}"))?;

    let (authority, share_path) = match stripped.find('/') {
        Some(idx) => (&stripped[..idx], stripped[idx..].to_string()),
        None => return Err("SMB URI must include a share name: smb://host/share".to_string()),
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

    // share_path is "/share[/sub/path]" — extract share name and base_path
    let parts: Vec<&str> = share_path.splitn(3, '/').collect();
    let share = if parts.len() >= 2 {
        parts[1].to_string()
    } else {
        return Err("SMB URI must include a share name".to_string());
    };
    let base_path = if parts.len() >= 3 {
        format!("/{}", parts[2])
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

// ─── VFS operations ──────────────────────────────────────────────────────────

/// List directory contents via SMB.
pub(crate) async fn list_dir(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
    show_hidden: bool,
) -> Result<Vec<VfsNode>, String> {
    let (mut share, info) = pool.get_share(mount_id).await?;
    let share_path = to_share_path(&info.base_path, vfs_path);

    let result = async {
        let entries = share
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

            let node_path = if vfs_path == "/" {
                format!("/{name}")
            } else {
                format!("{vfs_path}/{name}")
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

    pool.put_share(mount_id, share).await;
    result
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
    let (mut share, info) = pool.get_share(mount_id).await?;
    let share_path = to_share_path(&info.base_path, vfs_path);

    let result = async {
        share
            .read(&share_path)
            .await
            .map_err(|e| format!("SMB read failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, share).await;
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
    let (mut share, info) = pool.get_share(mount_id).await?;
    let share_path = to_share_path(&info.base_path, vfs_path);

    let result = async {
        share
            .write(&share_path, data)
            .await
            .map_err(|e| format!("SMB write failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, share).await;
    result
}

/// Create a directory via SMB.
pub(crate) async fn mkdir(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
) -> Result<(), String> {
    let (mut share, info) = pool.get_share(mount_id).await?;
    let share_path = to_share_path(&info.base_path, vfs_path);

    let result = async {
        share
            .create_dir(&share_path)
            .await
            .map_err(|e| format!("SMB mkdir failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, share).await;
    result
}

/// Delete a file via SMB.
pub(crate) async fn delete(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
) -> Result<(), String> {
    let (mut share, info) = pool.get_share(mount_id).await?;
    let share_path = to_share_path(&info.base_path, vfs_path);

    let result = async {
        share
            .remove(&share_path)
            .await
            .map_err(|e| format!("SMB delete failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, share).await;
    result
}

/// Move/rename a file or directory via SMB.
pub(crate) async fn move_file(
    pool: &SmbClientPool,
    mount_id: &str,
    src_vfs_path: &str,
    dest_vfs_path: &str,
) -> Result<(), String> {
    let (mut share, info) = pool.get_share(mount_id).await?;
    let src_share_path = to_share_path(&info.base_path, src_vfs_path);
    let dest_share_path = to_share_path(&info.base_path, dest_vfs_path);

    let result = async {
        share
            .rename(&src_share_path, &dest_share_path)
            .await
            .map_err(|e| format!("SMB rename failed: {e}"))
    }
    .await;

    pool.put_share(mount_id, share).await;
    result
}

/// Copy a file via SMB (read + write, since SMB2 doesn't have server-side copy).
pub(crate) async fn copy_file(
    pool: &SmbClientPool,
    mount_id: &str,
    src_vfs_path: &str,
    dest_vfs_path: &str,
) -> Result<(), String> {
    let data = read_file_raw(pool, mount_id, src_vfs_path).await?;
    upload_file(pool, mount_id, dest_vfs_path, &data).await
}

/// Get file/directory metadata via SMB.
pub(crate) async fn stat(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
) -> Result<VfsNode, String> {
    let (mut share, info) = pool.get_share(mount_id).await?;
    let share_path = to_share_path(&info.base_path, vfs_path);

    let result = async {
        let metadata = share
            .stat(&share_path)
            .await
            .map_err(|e| format!("SMB stat failed: {e}"))?;

        let name = share_path
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string();

        Ok(VfsNode {
            name,
            path: vfs_path.to_string(),
            is_dir: metadata.is_directory(),
            size: Some(metadata.size),
            modified: metadata.written.map(|t| format_system_time(&t)),
            permissions: None,
        })
    }
    .await;

    pool.put_share(mount_id, share).await;
    result
}

/// Search files/directories by name via SMB (enumerate and filter).
pub(crate) async fn search(
    pool: &SmbClientPool,
    mount_id: &str,
    vfs_path: &str,
    query: &str,
    max_results: Option<usize>,
) -> Result<Vec<VfsNode>, String> {
    let all = list_dir(pool, mount_id, vfs_path, true).await?;
    let query_lower = query.to_lowercase();
    let max = max_results.unwrap_or(100);
    Ok(all
        .into_iter()
        .filter(|n| n.name.to_lowercase().contains(&query_lower))
        .take(max)
        .collect())
}

#[allow(dead_code)]
/// Test SMB connectivity by trying to connect and list the root.
pub(crate) async fn test_connection(smb_uri: &str) -> Result<(), String> {
    let info = parse_smb_uri(smb_uri)?;

    let client = Client::builder(info.server.clone())
        .with_port(info.port)
        .with_ntlm_credentials(NtlmCredentials::new(
            if info.username.is_empty() { "guest" } else { &info.username },
            &info.password,
        ))
        .build()
        .map_err(|e| format!("SMB client build failed: {e}"))?;

    let mut share = client
        .connect_share(&info.share)
        .await
        .map_err(|e| format!("SMB connection failed: {e}"))?;

    // Verify by listing root
    share
        .list(&info.base_path)
        .await
        .map_err(|e| format!("SMB share access failed: {e}"))?;

    let _ = share.logoff().await;
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
        assert_eq!(info.share, "share");
        assert_eq!(info.base_path, "/docs");
    }

    #[test]
    fn test_parse_smb_uri_no_creds() {
        let info = parse_smb_uri("smb://nas.home/backup").unwrap();
        assert_eq!(info.username, "");
        assert_eq!(info.password, "");
        assert_eq!(info.server, "nas.home");
        assert_eq!(info.port, 445);
        assert_eq!(info.share, "backup");
        assert_eq!(info.base_path, "/");
    }

    #[test]
    fn test_parse_smb_uri_custom_port() {
        let info = parse_smb_uri("smb://admin@server:4445/share").unwrap();
        assert_eq!(info.username, "admin");
        assert_eq!(info.server, "server");
        assert_eq!(info.port, 4445);
        assert_eq!(info.share, "share");
        assert_eq!(info.base_path, "/");
    }

    #[test]
    fn test_parse_smb_uri_no_share() {
        let result = parse_smb_uri("smb://host/");
        assert!(result.is_err());
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
