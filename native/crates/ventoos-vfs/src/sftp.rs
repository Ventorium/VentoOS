//! SFTP client for remote filesystem operations via SSH.

use std::collections::HashMap;
use std::sync::Arc;

use russh_sftp::client::SftpSession;
use tokio::sync::RwLock;
use tracing::debug;

use crate::types::{VfsFileContent, VfsNode};

/// Information needed to establish an SSH connection for SFTP.
#[derive(Debug, Clone)]
pub struct SshConnInfo {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
}

/// SSH authentication method for SFTP connections.
#[derive(Debug, Clone)]
pub enum SshAuth {
    Password(String),
    PrivateKey {
        key_pem: String,
        passphrase: Option<String>,
    },
}

impl SshConnInfo {
    /// Parse an SFTP URI of the form
    /// `sftp://[user[:pass]@]host[:port][/path][?key_path=...&key_pass=...]`.
    /// The `/path` part (remote root) is returned separately.
    /// Supports private key auth via `key_path` and `key_pass` query params.
    pub fn parse_sftp_url(uri: &str) -> Result<(Self, String), String> {
        let stripped = uri
            .strip_prefix("sftp://")
            .ok_or_else(|| format!("Not an sftp:// URI: {uri}"))?;

        // Split authority+path and query params
        let (without_query, query) = match stripped.find('?') {
            Some(idx) => (&stripped[..idx], &stripped[idx + 1..]),
            None => (stripped, ""),
        };

        // Parse query params
        let mut key_path: Option<String> = None;
        let mut key_pass: Option<String> = None;
        for pair in query.split('&') {
            if let Some(eq_idx) = pair.find('=') {
                let k = &pair[..eq_idx];
                let v = urldecode(&pair[eq_idx + 1..]);
                match k {
                    "key_path" => key_path = Some(v),
                    "key_pass" => key_pass = Some(v),
                    _ => {}
                }
            }
        }

        // Split authority and path
        let (authority, path) = match without_query.find('/') {
            Some(idx) => (
                &without_query[..idx],
                format!("/{}", &without_query[idx + 1..]),
            ),
            None => (without_query, "/".to_string()),
        };

        // Split userinfo@host:port
        let (userinfo, hostport) = match authority.rfind('@') {
            Some(idx) => (Some(&authority[..idx]), &authority[idx + 1..]),
            None => (None, authority),
        };

        let (host, port) = match hostport.rfind(':') {
            Some(idx) => {
                let p = hostport[idx + 1..]
                    .parse::<u16>()
                    .map_err(|_| "Invalid port".to_string())?;
                (&hostport[..idx], p)
            }
            None => (hostport, 22u16),
        };

        let (username, password) = match userinfo {
            None => ("anonymous".to_string(), String::new()),
            Some(ui) => match ui.find(':') {
                Some(idx) => (ui[..idx].to_string(), ui[idx + 1..].to_string()),
                None => (ui.to_string(), String::new()),
            },
        };

        let auth = if let Some(kp) = key_path {
            SshAuth::PrivateKey {
                key_pem: kp,
                passphrase: key_pass,
            }
        } else {
            SshAuth::Password(password)
        };

        let conn = SshConnInfo {
            host: host.to_string(),
            port,
            username,
            auth,
        };
        Ok((conn, path))
    }
}

/// Simple URL percent-decode.
fn urldecode(s: &str) -> String {
    let mut result = String::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len()
            && let Ok(byte) = u8::from_str_radix(&String::from_utf8_lossy(&bytes[i + 1..i + 3]), 16)
            {
                result.push(byte as char);
                i += 3;
                continue;
            }
        result.push(bytes[i] as char);
        i += 1;
    }
    result
}

/// An `SshInfoProvider` that always returns a pre-built `SshConnInfo`,
/// used for URL-based SFTP mounts that don't reference a connection-id.
pub struct InlineSftpProvider(pub SshConnInfo);

impl SshInfoProvider for InlineSftpProvider {
    fn resolve(
        &self,
        _connection_id: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<SshConnInfo, String>> + Send + '_>>
    {
        let info = self.0.clone();
        Box::pin(async move { Ok(info) })
    }
}

/// Trait for resolving SSH connection info from a connection ID.
/// Implemented by the server layer to provide SSH server details to the VFS.
pub trait SshInfoProvider: Send + Sync {
    fn resolve(
        &self,
        connection_id: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<SshConnInfo, String>> + Send + '_>>;
}

/// Minimal russh client handler that accepts all server keys.
struct SshHandler;

impl russh::client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all host keys — in production, this should verify against known_hosts.
        Ok(true)
    }
}

/// Pool of active SFTP sessions keyed by connection ID.
pub(crate) struct SftpPool {
    sessions: RwLock<HashMap<String, Arc<SftpSession>>>,
}

impl SftpPool {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Get or create an SFTP session for the given connection.
    pub async fn get_or_connect(
        &self,
        connection_id: &str,
        provider: &dyn SshInfoProvider,
    ) -> Result<Arc<SftpSession>, String> {
        // Check cache first
        {
            let sessions = self.sessions.read().await;
            if let Some(session) = sessions.get(connection_id) {
                return Ok(Arc::clone(session));
            }
        }

        // Connect
        let info = provider.resolve(connection_id).await?;
        let sftp = connect_sftp(&info).await?;
        let sftp = Arc::new(sftp);

        let mut sessions = self.sessions.write().await;
        sessions.insert(connection_id.to_string(), Arc::clone(&sftp));
        Ok(sftp)
    }

    /// Remove a cached session (e.g. on error or disconnect).
    #[allow(dead_code)]
    pub async fn remove(&self, connection_id: &str) {
        self.sessions.write().await.remove(connection_id);
    }
}

/// Establish an SSH connection and open an SFTP session.
async fn connect_sftp(info: &SshConnInfo) -> Result<SftpSession, String> {
    let config = Arc::new(russh::client::Config::default());
    let handler = SshHandler;

    debug!("Connecting SSH to {}:{}", info.host, info.port);
    let mut session = russh::client::connect(config, (info.host.as_str(), info.port), handler)
        .await
        .map_err(|e| format!("SSH connect failed: {e}"))?;

    // Authenticate
    let auth_result = match &info.auth {
        SshAuth::Password(pw) => session
            .authenticate_password(&info.username, pw)
            .await
            .map_err(|e| format!("SSH auth failed: {e}"))?,
        SshAuth::PrivateKey {
            key_pem,
            passphrase,
        } => {
            let key = russh::keys::decode_secret_key(key_pem, passphrase.as_deref())
                .map_err(|e| format!("Invalid private key: {e}"))?;
            let key_with_alg = russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key), None);
            session
                .authenticate_publickey(&info.username, key_with_alg)
                .await
                .map_err(|e| format!("SSH key auth failed: {e}"))?
        }
    };

    if !auth_result.success() {
        return Err("SSH authentication failed".into());
    }

    // Open SFTP subsystem
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

    debug!("SFTP session established for {}:{}", info.host, info.port);
    Ok(sftp)
}

/// List directory contents via SFTP.
pub async fn list_dir(
    sftp: &SftpSession,
    root: &str,
    rel_path: &str,
    show_hidden: bool,
) -> Result<Vec<VfsNode>, String> {
    let full_path = resolve_remote_path(root, rel_path);

    let entries = sftp
        .read_dir(&full_path)
        .await
        .map_err(|e| format!("SFTP readdir failed: {e}"))?;

    let mut nodes: Vec<VfsNode> = Vec::new();

    for entry in entries {
        let name = entry.file_name();
        // Skip macOS Apple Double files (._*) always
        if name.starts_with("._") {
            continue;
        }
        // Skip hidden files unless explicitly requested
        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata();
        let is_dir = entry.file_type().is_dir();
        let size = if is_dir { None } else { metadata.size };
        let modified = metadata.modified().ok().map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.to_rfc3339()
        });
        let permissions = metadata.permissions.map(|p| format!("{p:o}"));

        let entry_path = if rel_path.is_empty() || rel_path == "/" {
            format!("/{name}")
        } else {
            format!("{}/{name}", rel_path.trim_end_matches('/'))
        };

        nodes.push(VfsNode {
            name,
            path: entry_path,
            is_dir,
            size,
            modified,
            permissions,
        });
    }

    // Sort: directories first, then alphabetical
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(nodes)
}

/// Read file content via SFTP.
pub async fn read_file(
    sftp: &SftpSession,
    root: &str,
    rel_path: &str,
    max_bytes: Option<u64>,
) -> Result<VfsFileContent, String> {
    use tokio::io::AsyncReadExt;

    let full_path = resolve_remote_path(root, rel_path);

    // Get file size first
    let metadata = sftp
        .metadata(&full_path)
        .await
        .map_err(|e| format!("SFTP stat failed: {e}"))?;

    let file_size = metadata.size.unwrap_or(0);
    let limit = max_bytes.unwrap_or(1_048_576); // Default 1 MB

    let mut file = sftp
        .open(&full_path)
        .await
        .map_err(|e| format!("SFTP open failed: {e}"))?;

    let read_size = usize::try_from(std::cmp::min(file_size, limit)).unwrap_or(usize::MAX);
    let mut buf = vec![0u8; read_size];
    let bytes_read = file
        .read(&mut buf)
        .await
        .map_err(|e| format!("SFTP read failed: {e}"))?;
    buf.truncate(bytes_read);

    let truncated = file_size > limit;

    // Check if binary (null bytes in first 8KB)
    let check_len = buf.len().min(8192);
    let is_binary = buf[..check_len].contains(&0);

    let content = if is_binary {
        format!("[Binary file, {file_size} bytes]")
    } else {
        String::from_utf8_lossy(&buf).into_owned()
    };

    Ok(VfsFileContent {
        path: rel_path.to_string(),
        size: file_size,
        content,
        is_binary,
        truncated,
    })
}

/// Read raw file bytes via SFTP (for download/preview).
pub async fn read_file_raw(
    sftp: &SftpSession,
    root: &str,
    rel_path: &str,
) -> Result<Vec<u8>, String> {
    use tokio::io::AsyncReadExt;

    let full_path = resolve_remote_path(root, rel_path);

    let mut file = sftp
        .open(&full_path)
        .await
        .map_err(|e| format!("SFTP open failed: {e}"))?;

    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| format!("SFTP read failed: {e}"))?;

    Ok(buf)
}

/// Move (rename) a file or directory via SFTP.
pub async fn move_file(
    sftp: &SftpSession,
    root: &str,
    src: &str,
    dest: &str,
) -> Result<(), String> {
    let src_path = resolve_remote_path(root, src);
    let dest_path = resolve_remote_path(root, dest);

    sftp.rename(&src_path, &dest_path)
        .await
        .map_err(|e| format!("SFTP rename failed: {e}"))
}

/// Copy a file via SFTP (read source, write to destination).
/// Note: SFTP protocol doesn't have a native copy; we read and re-write.
pub async fn copy_file(
    sftp: &SftpSession,
    root: &str,
    src: &str,
    dest: &str,
) -> Result<(), String> {
    use russh_sftp::protocol::OpenFlags;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let src_path = resolve_remote_path(root, src);
    let dest_path = resolve_remote_path(root, dest);

    // Check source metadata
    let metadata = sftp
        .metadata(&src_path)
        .await
        .map_err(|e| format!("SFTP stat source failed: {e}"))?;

    if metadata.is_dir() {
        return Err("SFTP directory copy not yet supported".into());
    }

    // Read source
    let mut src_file = sftp
        .open(&src_path)
        .await
        .map_err(|e| format!("SFTP open source failed: {e}"))?;

    let mut data = Vec::new();
    src_file
        .read_to_end(&mut data)
        .await
        .map_err(|e| format!("SFTP read source failed: {e}"))?;

    // Write to destination
    let mut dest_file = sftp
        .open_with_flags(
            &dest_path,
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(|e| format!("SFTP open dest failed: {e}"))?;

    dest_file
        .write_all(&data)
        .await
        .map_err(|e| format!("SFTP write dest failed: {e}"))?;

    dest_file
        .flush()
        .await
        .map_err(|e| format!("SFTP flush failed: {e}"))?;

    Ok(())
}

/// Create a directory via SFTP.
pub async fn mkdir(sftp: &SftpSession, root: &str, rel_path: &str) -> Result<(), String> {
    let path = resolve_remote_path(root, rel_path);
    sftp.create_dir(&path)
        .await
        .map_err(|e| format!("SFTP mkdir failed: {e}"))
}

/// Delete a file or directory via SFTP.
pub async fn delete(sftp: &SftpSession, root: &str, rel_path: &str) -> Result<(), String> {
    let path = resolve_remote_path(root, rel_path);
    let metadata = sftp
        .metadata(&path)
        .await
        .map_err(|e| format!("SFTP stat failed: {e}"))?;
    if metadata.is_dir() {
        sftp.remove_dir(&path)
            .await
            .map_err(|e| format!("SFTP rmdir failed: {e}"))
    } else {
        sftp.remove_file(&path)
            .await
            .map_err(|e| format!("SFTP remove failed: {e}"))
    }
}

/// Write text content to a file via SFTP.
pub async fn write_file(
    sftp: &SftpSession,
    root: &str,
    rel_path: &str,
    content: &str,
) -> Result<(), String> {
    upload_file(sftp, root, rel_path, content.as_bytes()).await
}

/// Upload raw bytes to a file via SFTP.
pub async fn upload_file(
    sftp: &SftpSession,
    root: &str,
    rel_path: &str,
    data: &[u8],
) -> Result<(), String> {
    use russh_sftp::protocol::OpenFlags;
    use tokio::io::AsyncWriteExt;

    let path = resolve_remote_path(root, rel_path);
    let mut file = sftp
        .open_with_flags(
            &path,
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(|e| format!("SFTP open for write failed: {e}"))?;
    file.write_all(data)
        .await
        .map_err(|e| format!("SFTP write failed: {e}"))?;
    file.flush()
        .await
        .map_err(|e| format!("SFTP flush failed: {e}"))?;
    Ok(())
}

/// Get file/directory metadata via SFTP.
pub async fn stat(sftp: &SftpSession, root: &str, rel_path: &str) -> Result<VfsNode, String> {
    let path = resolve_remote_path(root, rel_path);
    let metadata = sftp
        .metadata(&path)
        .await
        .map_err(|e| format!("SFTP stat failed: {e}"))?;

    let name = rel_path
        .rsplit('/')
        .find(|s| !s.is_empty())
        .unwrap_or(rel_path)
        .to_string();

    let is_dir = metadata.is_dir();
    let size = if is_dir { None } else { metadata.size };
    let modified = metadata.modified().ok().map(|t| {
        let dt: chrono::DateTime<chrono::Utc> = t.into();
        dt.to_rfc3339()
    });
    let permissions = metadata.permissions.map(|p| format!("{p:o}"));

    Ok(VfsNode {
        name,
        path: rel_path.to_string(),
        is_dir,
        size,
        modified,
        permissions,
    })
}

/// Search for files matching a query string via SFTP.
/// Currently returns empty — recursive SFTP search is expensive over slow connections.
pub fn search(
    _sftp: &SftpSession,
    _root: &str,
    _rel_path: &str,
    _query: &str,
    _max_results: Option<usize>,
) -> Result<Vec<VfsNode>, String> {
    // Stub: recursive SFTP directory traversal for search is too expensive for
    // interactive use. A real implementation could cache directory listings.
    Ok(Vec::new())
}

/// Resolve a relative path within a remote root.
/// Prevents path traversal by stripping `..` components.
fn resolve_remote_path(root: &str, rel_path: &str) -> String {
    let root = root.trim_end_matches('/');
    if rel_path.is_empty() || rel_path == "/" {
        // If root itself was "/", trimming the trailing slash leaves an empty string.
        // In that case return "/" so SFTP operations target the filesystem root.
        return if root.is_empty() {
            "/".to_string()
        } else {
            root.to_string()
        };
    }

    // Normalize: split by '/', reject '..' components
    let clean: Vec<&str> = rel_path
        .split('/')
        .filter(|s| !s.is_empty() && *s != "." && *s != "..")
        .collect();

    if clean.is_empty() {
        root.to_string()
    } else {
        format!("{}/{}", root, clean.join("/"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_remote_path() {
        assert_eq!(resolve_remote_path("/home/user", "/"), "/home/user");
        assert_eq!(resolve_remote_path("/home/user", ""), "/home/user");
        assert_eq!(
            resolve_remote_path("/home/user", "docs/readme.md"),
            "/home/user/docs/readme.md"
        );
        assert_eq!(
            resolve_remote_path("/home/user", "/docs/readme.md"),
            "/home/user/docs/readme.md"
        );
        // Path traversal blocked
        assert_eq!(
            resolve_remote_path("/home/user", "../../etc/passwd"),
            "/home/user/etc/passwd"
        );
        assert_eq!(resolve_remote_path("/home/user", "../../../"), "/home/user");
    }

    #[test]
    fn test_resolve_remote_path_trailing_slash() {
        assert_eq!(
            resolve_remote_path("/data/", "files/test.txt"),
            "/data/files/test.txt"
        );
    }
}
