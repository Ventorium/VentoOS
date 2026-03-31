//! SFTP protocol adapter for VFS.
//!
//! Manages SSH connections and SFTP sessions, providing all VFS operations
//! over the SFTP protocol using `russh` + `russh-sftp`.

use std::collections::HashMap;
use std::sync::Arc;

use russh_sftp::client::SftpSession;
use tokio::sync::RwLock;

use crate::types::{VfsFileContent, VfsNode};

// ---------------------------------------------------------------------------
// URI parsing
// ---------------------------------------------------------------------------

/// Parsed components of an SFTP URI: `sftp://user:pass@host:port/basepath`
#[derive(Debug, Clone)]
pub(crate) struct SftpConnInfo {
    pub user: String,
    pub password: String,
    pub host: String,
    pub port: u16,
    pub base_path: String,
}

impl SftpConnInfo {
    /// Parse an SFTP URI.
    ///
    /// Format: `sftp://user:password@host:port/basepath`
    /// - password may contain `@` — we split on the *last* `@`
    /// - port defaults to 22 if omitted
    /// - basepath defaults to `/` if omitted
    pub fn parse(uri: &str) -> Result<Self, String> {
        let body = uri
            .strip_prefix("sftp://")
            .ok_or("Invalid SFTP URI: missing sftp:// prefix")?;

        // Separate auth from host+path at the last '@'
        let (auth, host_path) = body
            .rfind('@')
            .map(|i| (&body[..i], &body[i + 1..]))
            .ok_or("Invalid SFTP URI: missing @ separator")?;

        // auth = user:password  (first ':' splits)
        let (user_raw, pass_raw) = auth
            .split_once(':')
            .ok_or("Invalid SFTP URI: missing user:password")?;

        // host_path = host:port/path  or  host/path  or  host:port  or  host
        let (host_port, path) = match host_path.find('/') {
            Some(i) => (&host_path[..i], &host_path[i..]),
            None => (host_path, "/"),
        };

        let (host, port_str) = host_port.split_once(':').unwrap_or((host_port, "22"));
        let port: u16 = port_str.parse().map_err(|_| "Invalid SFTP port number")?;

        if host.is_empty() {
            return Err("Invalid SFTP URI: empty host".into());
        }

        Ok(Self {
            user: percent_decode(user_raw),
            password: percent_decode(pass_raw),
            host: host.to_string(),
            port,
            base_path: if path.is_empty() {
                "/".to_string()
            } else {
                path.to_string()
            },
        })
    }
}

/// Minimal percent-decoding for URI components.
fn percent_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16)
        {
            out.push(byte as char);
            i += 3;
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

// ---------------------------------------------------------------------------
// SSH handler (minimal — accepts all host keys for now)
// ---------------------------------------------------------------------------

struct SshHandler;

impl russh::client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO: Implement proper host-key verification (known_hosts).
        Ok(true)
    }
}

// ---------------------------------------------------------------------------
// SFTP connection wrapper
// ---------------------------------------------------------------------------

/// A live SFTP session together with its SSH handle (keeps the transport alive).
pub(crate) struct SftpConn {
    sftp: SftpSession,
    /// Keep the SSH handle alive; dropping it closes the connection.
    ssh_handle: russh::client::Handle<SshHandler>,
    base_path: String,
}

impl SftpConn {
    /// Establish a new SSH + SFTP connection from parsed info.
    async fn connect(info: &SftpConnInfo) -> Result<Self, String> {
        let config = Arc::new(russh::client::Config::default());
        let handler = SshHandler;

        let mut session =
            russh::client::connect(config, (info.host.as_str(), info.port), handler)
                .await
                .map_err(|e| format!("SSH connect failed: {e}"))?;

        let auth = session
            .authenticate_password(&info.user, &info.password)
            .await
            .map_err(|e| format!("SSH auth failed: {e}"))?;

        if !auth.success() {
            return Err("SSH authentication failed: invalid credentials".into());
        }

        let channel = session
            .channel_open_session()
            .await
            .map_err(|e| format!("SSH channel open failed: {e}"))?;

        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| format!("SFTP subsystem request failed: {e}"))?;

        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("SFTP session init failed: {e}"))?;

        Ok(Self {
            sftp,
            ssh_handle: session,
            base_path: info.base_path.clone(),
        })
    }
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

/// Normalize a UNIX path: resolve `.`, `..`, collapse multiple `/`.
fn normalize_path(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for seg in path.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    if parts.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", parts.join("/"))
    }
}

/// Resolve a user-supplied relative path against the mount base path
/// and verify it stays within the base path (path traversal prevention).
fn resolve_sftp_path(base: &str, rel_path: &str) -> Result<String, String> {
    let base = normalize_path(base);
    let clean = rel_path.trim_start_matches('/');
    let full = if clean.is_empty() {
        base.clone()
    } else {
        format!("{}/{clean}", base.trim_end_matches('/'))
    };
    let normalized = normalize_path(&full);

    // Ensure the resolved path is under base
    let base_with_slash = if base.ends_with('/') {
        base.clone()
    } else {
        format!("{base}/")
    };
    if normalized != base && !normalized.starts_with(&base_with_slash) {
        return Err("Path traversal denied".into());
    }
    Ok(normalized)
}

/// Check if permissions indicate a directory.
fn is_dir_from_perms(perms: Option<u32>) -> bool {
    perms.is_some_and(|p| (p & 0o170_000) == 0o040_000)
}

/// Convert unix-timestamp seconds to RFC 3339 string.
fn mtime_to_rfc3339(mtime: Option<u32>) -> Option<String> {
    mtime.and_then(|t| {
        chrono::DateTime::from_timestamp(i64::from(t), 0).map(|dt| dt.to_rfc3339())
    })
}

/// Format octal permission string from the lower 12 bits.
fn perms_to_string(perms: Option<u32>) -> Option<String> {
    perms.map(|p| format!("{p:o}"))
}

// ---------------------------------------------------------------------------
// VFS operations on SftpConn
// ---------------------------------------------------------------------------

impl SftpConn {
    /// Resolve path (convenience).
    fn resolve(&self, rel_path: &str) -> Result<String, String> {
        resolve_sftp_path(&self.base_path, rel_path)
    }

    /// List directory contents.
    pub async fn list_dir(&self, rel_path: &str) -> Result<Vec<VfsNode>, String> {
        let abs = self.resolve(rel_path)?;
        let read_dir = self
            .sftp
            .read_dir(&abs)
            .await
            .map_err(|e| format!("SFTP read_dir failed: {e}"))?;

        let mut entries = Vec::new();
        for entry in read_dir {
            let name = entry.file_name().clone();
            // Skip . and .. and hidden files (consistent with local)
            if name == "." || name == ".." || name.starts_with('.') {
                continue;
            }
            let attrs = entry.metadata();
            let is_dir = is_dir_from_perms(attrs.permissions);
            let size = if is_dir { None } else { attrs.size };
            let modified = mtime_to_rfc3339(attrs.mtime);

            let entry_path = if rel_path.is_empty() || rel_path == "/" {
                format!("/{name}")
            } else {
                format!("{}/{name}", rel_path.trim_end_matches('/'))
            };

            entries.push(VfsNode {
                name,
                path: entry_path,
                is_dir,
                size,
                modified,
                permissions: perms_to_string(attrs.permissions),
            });
        }

        // Sort: directories first, then alphabetical
        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(entries)
    }

    /// Read file content as text (with optional size limit).
    pub async fn read_file(
        &self,
        rel_path: &str,
        max_bytes: Option<u64>,
    ) -> Result<VfsFileContent, String> {
        let abs = self.resolve(rel_path)?;

        let bytes = self
            .sftp
            .read(&abs)
            .await
            .map_err(|e| format!("SFTP read failed: {e}"))?;

        let file_size = bytes.len() as u64;
        let limit = max_bytes.unwrap_or(1_048_576); // default 1 MB
        let truncated = file_size > limit;
        let slice = if truncated {
            &bytes[..usize::try_from(limit).unwrap_or(usize::MAX)]
        } else {
            &bytes
        };

        // Check binary (null bytes in first 8KB)
        let check_len = slice.len().min(8192);
        let is_binary = slice[..check_len].contains(&0);

        let content = if is_binary {
            format!("[Binary file, {file_size} bytes]")
        } else {
            String::from_utf8_lossy(slice).into_owned()
        };

        Ok(VfsFileContent {
            path: rel_path.to_string(),
            size: file_size,
            content,
            is_binary,
            truncated,
        })
    }

    /// Read raw file bytes.
    pub async fn read_file_raw(&self, rel_path: &str) -> Result<Vec<u8>, String> {
        let abs = self.resolve(rel_path)?;
        self.sftp
            .read(&abs)
            .await
            .map_err(|e| format!("SFTP read failed: {e}"))
    }

    /// Write data to a file (creates or truncates).
    pub async fn write_file(&self, rel_path: &str, data: &[u8]) -> Result<(), String> {
        let abs = self.resolve(rel_path)?;
        self.sftp
            .write(&abs, data)
            .await
            .map_err(|e| format!("SFTP write failed: {e}"))
    }

    /// Create directories recursively.
    pub async fn mkdir(&self, rel_path: &str) -> Result<(), String> {
        let abs = self.resolve(rel_path)?;
        self.mkdir_recursive(&abs).await
    }

    /// Recursively create directories by building each component.
    async fn mkdir_recursive(&self, abs_path: &str) -> Result<(), String> {
        // Try creating directly first — fast path
        if self.sftp.create_dir(abs_path).await.is_ok() {
            return Ok(());
        }

        // Walk components and create one by one
        let parts: Vec<&str> = abs_path.split('/').filter(|s| !s.is_empty()).collect();
        let mut current = String::new();
        for part in parts {
            current = format!("{current}/{part}");
            if self.sftp.try_exists(&current).await.unwrap_or(false) {
                continue;
            }
            self.sftp
                .create_dir(&current)
                .await
                .map_err(|e| format!("SFTP mkdir '{current}' failed: {e}"))?;
        }
        Ok(())
    }

    /// Delete a file or directory (recursive for directories).
    pub async fn delete(&self, rel_path: &str) -> Result<(), String> {
        let abs = self.resolve(rel_path)?;

        // Prevent deleting the base path itself
        if normalize_path(&abs) == normalize_path(&self.base_path) {
            return Err("Cannot delete mount root".into());
        }

        let meta = self
            .sftp
            .metadata(&abs)
            .await
            .map_err(|e| format!("SFTP stat failed: {e}"))?;

        if is_dir_from_perms(meta.permissions) {
            self.delete_dir_recursive(&abs).await
        } else {
            self.sftp
                .remove_file(&abs)
                .await
                .map_err(|e| format!("SFTP delete file failed: {e}"))
        }
    }

    /// Recursively delete a directory and its contents.
    async fn delete_dir_recursive(&self, abs_path: &str) -> Result<(), String> {
        let entries = self
            .sftp
            .read_dir(abs_path)
            .await
            .map_err(|e| format!("SFTP read_dir for delete failed: {e}"))?;

        for entry in entries {
            let name = entry.file_name().clone();
            if name == "." || name == ".." {
                continue;
            }
            let child = format!("{}/{name}", abs_path.trim_end_matches('/'));
            if is_dir_from_perms(entry.metadata().permissions) {
                Box::pin(self.delete_dir_recursive(&child)).await?;
            } else {
                self.sftp
                    .remove_file(&child)
                    .await
                    .map_err(|e| format!("SFTP delete '{child}' failed: {e}"))?;
            }
        }

        self.sftp
            .remove_dir(abs_path)
            .await
            .map_err(|e| format!("SFTP rmdir '{abs_path}' failed: {e}"))
    }

    /// Move / rename within the same SFTP connection.
    pub async fn move_file(&self, src: &str, dest: &str) -> Result<(), String> {
        let abs_src = self.resolve(src)?;
        let abs_dest = self.resolve(dest)?;

        if abs_src == abs_dest {
            return Ok(());
        }

        // Check dest doesn't already exist
        if self.sftp.try_exists(&abs_dest).await.unwrap_or(false) {
            return Err("Destination already exists".into());
        }

        self.sftp
            .rename(&abs_src, &abs_dest)
            .await
            .map_err(|e| format!("SFTP rename failed: {e}"))
    }

    /// Copy a file (SFTP has no native copy — read then write).
    pub async fn copy_file(&self, src: &str, dest: &str) -> Result<(), String> {
        let abs_src = self.resolve(src)?;
        let abs_dest = self.resolve(dest)?;

        if self.sftp.try_exists(&abs_dest).await.unwrap_or(false) {
            return Err("Destination already exists".into());
        }

        let meta = self
            .sftp
            .metadata(&abs_src)
            .await
            .map_err(|e| format!("SFTP stat source failed: {e}"))?;

        if is_dir_from_perms(meta.permissions) {
            Box::pin(self.copy_dir_recursive(&abs_src, &abs_dest)).await
        } else {
            let data = self
                .sftp
                .read(&abs_src)
                .await
                .map_err(|e| format!("SFTP read source failed: {e}"))?;
            self.sftp
                .write(&abs_dest, &data)
                .await
                .map_err(|e| format!("SFTP write dest failed: {e}"))
        }
    }

    /// Recursively copy a directory.
    async fn copy_dir_recursive(&self, src: &str, dest: &str) -> Result<(), String> {
        self.sftp
            .create_dir(dest)
            .await
            .map_err(|e| format!("SFTP mkdir '{dest}' failed: {e}"))?;

        let entries = self
            .sftp
            .read_dir(src)
            .await
            .map_err(|e| format!("SFTP read_dir '{src}' failed: {e}"))?;

        for entry in entries {
            let name = entry.file_name().clone();
            if name == "." || name == ".." {
                continue;
            }
            let child_src = format!("{}/{name}", src.trim_end_matches('/'));
            let child_dest = format!("{}/{name}", dest.trim_end_matches('/'));

            if is_dir_from_perms(entry.metadata().permissions) {
                Box::pin(self.copy_dir_recursive(&child_src, &child_dest)).await?;
            } else {
                let data = self
                    .sftp
                    .read(&child_src)
                    .await
                    .map_err(|e| format!("SFTP read '{child_src}' failed: {e}"))?;
                self.sftp
                    .write(&child_dest, &data)
                    .await
                    .map_err(|e| format!("SFTP write '{child_dest}' failed: {e}"))?;
            }
        }
        Ok(())
    }

    /// Get file/directory metadata.
    pub async fn stat(&self, rel_path: &str) -> Result<VfsNode, String> {
        let abs = self.resolve(rel_path)?;
        let meta = self
            .sftp
            .metadata(&abs)
            .await
            .map_err(|e| format!("SFTP stat failed: {e}"))?;

        let is_dir = is_dir_from_perms(meta.permissions);
        let name = abs
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string();

        Ok(VfsNode {
            name,
            path: rel_path.to_string(),
            is_dir,
            size: if is_dir { None } else { meta.size },
            modified: mtime_to_rfc3339(meta.mtime),
            permissions: perms_to_string(meta.permissions),
        })
    }

    /// Search for files matching a query (case-insensitive name contains).
    pub async fn search(
        &self,
        rel_path: &str,
        query: &str,
        max_results: usize,
    ) -> Result<Vec<VfsNode>, String> {
        let abs = self.resolve(rel_path)?;
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        self.search_recursive(&abs, rel_path, &query_lower, max_results, 0, 10, &mut results)
            .await;
        Ok(results)
    }

    #[allow(clippy::too_many_arguments)]
    async fn search_recursive(
        &self,
        abs_dir: &str,
        rel_dir: &str,
        query: &str,
        max_results: usize,
        depth: usize,
        max_depth: usize,
        results: &mut Vec<VfsNode>,
    ) {
        if depth > max_depth || results.len() >= max_results {
            return;
        }

        let Ok(entries) = self.sftp.read_dir(abs_dir).await else {
            return;
        };

        for entry in entries {
            if results.len() >= max_results {
                return;
            }

            let name = entry.file_name().clone();
            if name == "." || name == ".." || name.starts_with('.') {
                continue;
            }

            let attrs = entry.metadata();
            let is_dir = is_dir_from_perms(attrs.permissions);

            if name.to_lowercase().contains(query) {
                let entry_rel = if rel_dir == "/" {
                    format!("/{name}")
                } else {
                    format!("{}/{name}", rel_dir.trim_end_matches('/'))
                };
                results.push(VfsNode {
                    name: name.clone(),
                    path: entry_rel,
                    is_dir,
                    size: if is_dir { None } else { attrs.size },
                    modified: mtime_to_rfc3339(attrs.mtime),
                    permissions: perms_to_string(attrs.permissions),
                });
            }

            if is_dir {
                let child_abs =
                    format!("{}/{name}", abs_dir.trim_end_matches('/'));
                let child_rel = if rel_dir == "/" {
                    format!("/{name}")
                } else {
                    format!("{}/{name}", rel_dir.trim_end_matches('/'))
                };
                Box::pin(self.search_recursive(
                    &child_abs,
                    &child_rel,
                    query,
                    max_results,
                    depth + 1,
                    max_depth,
                    results,
                ))
                .await;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// SFTP session pool
// ---------------------------------------------------------------------------

/// Pool of cached SFTP connections keyed by mount ID.
pub(crate) struct SftpPool {
    sessions: RwLock<HashMap<String, Arc<SftpConn>>>,
}

impl SftpPool {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Get an existing connection or establish a new one.
    pub async fn get_or_connect(
        &self,
        mount_id: &str,
        root_uri: &str,
    ) -> Result<Arc<SftpConn>, String> {
        // Fast path: check cache
        {
            let sessions = self.sessions.read().await;
            if let Some(conn) = sessions.get(mount_id) {
                // Quick liveness check via SSH handle
                if !conn.ssh_handle.is_closed() {
                    return Ok(conn.clone());
                }
            }
        }

        // Parse URI and create new connection
        let info = SftpConnInfo::parse(root_uri)?;
        let conn = SftpConn::connect(&info).await?;
        let conn = Arc::new(conn);

        self.sessions
            .write()
            .await
            .insert(mount_id.to_string(), conn.clone());

        Ok(conn)
    }

    /// Remove a cached session (called when a mount is deleted).
    pub async fn remove(&self, mount_id: &str) {
        self.sessions.write().await.remove(mount_id);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic_uri() {
        let info = SftpConnInfo::parse("sftp://admin:secret@myhost:22/home/data").unwrap();
        assert_eq!(info.user, "admin");
        assert_eq!(info.password, "secret");
        assert_eq!(info.host, "myhost");
        assert_eq!(info.port, 22);
        assert_eq!(info.base_path, "/home/data");
    }

    #[test]
    fn parse_uri_default_port() {
        let info = SftpConnInfo::parse("sftp://user:pass@host/path").unwrap();
        assert_eq!(info.port, 22);
        assert_eq!(info.base_path, "/path");
    }

    #[test]
    fn parse_uri_no_path() {
        let info = SftpConnInfo::parse("sftp://user:pass@host:2222").unwrap();
        assert_eq!(info.port, 2222);
        assert_eq!(info.base_path, "/");
    }

    #[test]
    fn parse_uri_password_with_at() {
        let info = SftpConnInfo::parse("sftp://user:p%40ss@host:22/data").unwrap();
        assert_eq!(info.password, "p@ss");
    }

    #[test]
    fn parse_uri_missing_prefix() {
        assert!(SftpConnInfo::parse("ftp://user:pass@host").is_err());
    }

    #[test]
    fn parse_uri_missing_at() {
        assert!(SftpConnInfo::parse("sftp://userpass").is_err());
    }

    #[test]
    fn normalize_basic() {
        assert_eq!(normalize_path("/a/b/c"), "/a/b/c");
        assert_eq!(normalize_path("/a/../b"), "/b");
        assert_eq!(normalize_path("/a/./b"), "/a/b");
        assert_eq!(normalize_path("/a/b/../../c"), "/c");
        assert_eq!(normalize_path("/../../../"), "/");
        assert_eq!(normalize_path("/"), "/");
        assert_eq!(normalize_path(""), "/");
    }

    #[test]
    fn resolve_within_base() {
        assert_eq!(
            resolve_sftp_path("/home/data", "/sub/file.txt").unwrap(),
            "/home/data/sub/file.txt"
        );
        assert_eq!(
            resolve_sftp_path("/home/data", "/").unwrap(),
            "/home/data"
        );
        assert_eq!(
            resolve_sftp_path("/home/data", "").unwrap(),
            "/home/data"
        );
    }

    #[test]
    fn resolve_traversal_denied() {
        assert!(resolve_sftp_path("/home/data", "/../../etc/passwd").is_err());
        assert!(resolve_sftp_path("/home/data", "/../..").is_err());
    }
}
