//! Minimal async FTP client for VFS.
//! Implements the FTP command protocol (RFC 959) over Tokio TCP.
//! Supports passive mode (PASV) for all data transfers.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use crate::types::VfsNode;

// ─── FTP Connection ───────────────────────────────────────────────────────────

/// A single FTP control connection plus state.
pub(crate) struct FtpConn {
    reader: BufReader<tokio::io::ReadHalf<TcpStream>>,
    writer: tokio::io::WriteHalf<TcpStream>,
    /// The root prefix to strip from all returned paths.
    root: String,
}

impl FtpConn {
    async fn connect_and_login(
        host: &str,
        port: u16,
        user: &str,
        pass: &str,
    ) -> Result<Self, String> {
        let stream = TcpStream::connect(format!("{host}:{port}"))
            .await
            .map_err(|e| format!("FTP connect {host}:{port} failed: {e}"))?;
        let (rh, wh) = tokio::io::split(stream);
        let mut c = FtpConn {
            reader: BufReader::new(rh),
            writer: wh,
            root: String::new(),
        };
        // Welcome banner
        c.read_response_check(220).await?;
        // Login
        c.cmd(&format!("USER {user}")).await?;
        let resp = c.read_response().await?;
        if resp.starts_with("331") {
            c.cmd(&format!("PASS {pass}")).await?;
            c.read_response_check(230).await?;
        } else if !resp.starts_with("230") {
            return Err(format!("FTP login failed: {resp}"));
        }
        // Binary mode
        c.cmd("TYPE I").await?;
        c.read_response_check(200).await?;
        Ok(c)
    }

    async fn cmd(&mut self, line: &str) -> Result<(), String> {
        // Mask PASS in logs
        if !line.starts_with("PASS") {
            tracing::trace!("FTP > {}", line);
        }
        let buf = format!("{line}\r\n");
        self.writer
            .write_all(buf.as_bytes())
            .await
            .map_err(|e| format!("FTP write error: {e}"))
    }

    async fn read_response(&mut self) -> Result<String, String> {
        let mut full = String::new();
        loop {
            let mut line = String::new();
            let n = self
                .reader
                .read_line(&mut line)
                .await
                .map_err(|e| format!("FTP read error: {e}"))?;
            if n == 0 {
                return Err("FTP connection closed unexpectedly".to_string());
            }
            tracing::trace!("FTP < {}", line.trim_end());
            full.push_str(&line);
            // Multi-line: code followed by '-' continues until line starts with same code + ' '
            if line.len() >= 4 && line.as_bytes()[3] != b'-' {
                break;
            }
        }
        Ok(full)
    }

    async fn read_response_check(&mut self, expected: u16) -> Result<String, String> {
        let resp = self.read_response().await?;
        let code: u16 = resp[..3].parse().unwrap_or(0);
        if code != expected {
            return Err(format!("FTP expected {expected}, got: {}", resp.trim()));
        }
        Ok(resp)
    }

    /// Enter passive mode and connect a data channel.
    async fn pasv(&mut self) -> Result<TcpStream, String> {
        self.cmd("PASV").await?;
        let resp = self.read_response_check(227).await?;
        // Parse "227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)"
        let start = resp
            .find('(')
            .ok_or_else(|| "PASV: missing '('".to_string())?;
        let end = resp
            .find(')')
            .ok_or_else(|| "PASV: missing ')'".to_string())?;
        let nums: Vec<u8> = resp[start + 1..end]
            .split(',')
            .filter_map(|s| s.trim().parse().ok())
            .collect();
        if nums.len() != 6 {
            return Err(format!("PASV: unexpected response: {resp}"));
        }
        let host = format!("{}.{}.{}.{}", nums[0], nums[1], nums[2], nums[3]);
        let port = u16::from(nums[4]) * 256 + u16::from(nums[5]);
        let data = TcpStream::connect(format!("{host}:{port}"))
            .await
            .map_err(|e| format!("FTP data connect {host}:{port} failed: {e}"))?;
        Ok(data)
    }

    /// Convert a VFS relative path to FTP absolute path.
    fn to_ftp_path(&self, vfs_path: &str) -> String {
        if self.root.is_empty() || self.root == "/" {
            return vfs_path.to_string();
        }
        let root = self.root.trim_end_matches('/');
        let rel = vfs_path.trim_start_matches('/');
        if rel.is_empty() {
            root.to_string()
        } else {
            format!("{root}/{rel}")
        }
    }

    // ── Directory listing ────────────────────────────────────────────────────

    pub async fn list_dir(&mut self, vfs_path: &str) -> Result<Vec<VfsNode>, String> {
        let ftp_path = self.to_ftp_path(vfs_path);
        let data = self.pasv().await?;
        self.cmd(&format!("LIST {ftp_path}")).await?;
        self.read_response_check(150).await?;

        // Read all data
        let mut raw = Vec::new();
        let mut data_reader = BufReader::new(data);
        data_reader
            .read_to_end(&mut raw)
            .await
            .map_err(|e| format!("FTP list read error: {e}"))?;
        drop(data_reader);
        self.read_response_check(226).await?;

        let listing = String::from_utf8_lossy(&raw);
        Ok(parse_unix_list(&listing, vfs_path))
    }

    // ── File read (raw bytes) ────────────────────────────────────────────────

    pub async fn read_file_raw(&mut self, vfs_path: &str) -> Result<Vec<u8>, String> {
        let ftp_path = self.to_ftp_path(vfs_path);
        let data = self.pasv().await?;
        self.cmd(&format!("RETR {ftp_path}")).await?;
        self.read_response_check(150).await?;

        let mut buf = Vec::new();
        let mut data_reader = BufReader::new(data);
        data_reader
            .read_to_end(&mut buf)
            .await
            .map_err(|e| format!("FTP RETR read error: {e}"))?;
        drop(data_reader);
        self.read_response_check(226).await?;
        Ok(buf)
    }

    // ── File write ───────────────────────────────────────────────────────────

    pub async fn write_file(&mut self, vfs_path: &str, data: &[u8]) -> Result<(), String> {
        let ftp_path = self.to_ftp_path(vfs_path);
        let mut data_stream = self.pasv().await?;
        self.cmd(&format!("STOR {ftp_path}")).await?;
        self.read_response_check(150).await?;

        data_stream
            .write_all(data)
            .await
            .map_err(|e| format!("FTP STOR write error: {e}"))?;
        data_stream
            .flush()
            .await
            .map_err(|e| format!("FTP STOR flush error: {e}"))?;
        drop(data_stream);
        self.read_response_check(226).await?;
        Ok(())
    }

    // ── Mkdir ────────────────────────────────────────────────────────────────

    pub async fn mkdir(&mut self, vfs_path: &str) -> Result<(), String> {
        let ftp_path = self.to_ftp_path(vfs_path);
        self.cmd(&format!("MKD {ftp_path}")).await?;
        let resp = self.read_response().await?;
        let code: u16 = resp[..3].parse().unwrap_or(0);
        if code != 257 {
            return Err(format!("FTP MKD failed: {}", resp.trim()));
        }
        Ok(())
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    pub async fn delete(&mut self, vfs_path: &str, is_dir: bool) -> Result<(), String> {
        let ftp_path = self.to_ftp_path(vfs_path);
        if is_dir {
            self.cmd(&format!("RMD {ftp_path}")).await?;
        } else {
            self.cmd(&format!("DELE {ftp_path}")).await?;
        }
        let resp = self.read_response().await?;
        let code: u16 = resp[..3].parse().unwrap_or(0);
        if code != 250 && code != 226 {
            return Err(format!("FTP delete failed: {}", resp.trim()));
        }
        Ok(())
    }

    // ── Rename/Move ──────────────────────────────────────────────────────────

    pub async fn rename(&mut self, vfs_src: &str, vfs_dest: &str) -> Result<(), String> {
        let src = self.to_ftp_path(vfs_src);
        let dest = self.to_ftp_path(vfs_dest);
        self.cmd(&format!("RNFR {src}")).await?;
        self.read_response_check(350).await?;
        self.cmd(&format!("RNTO {dest}")).await?;
        self.read_response_check(250).await?;
        Ok(())
    }

    // ── Stat ─────────────────────────────────────────────────────────────────

    pub async fn stat(&mut self, vfs_path: &str) -> Result<VfsNode, String> {
        let ftp_path = self.to_ftp_path(vfs_path);
        // Try SIZE first
        self.cmd(&format!("SIZE {ftp_path}")).await?;
        let size_resp = self.read_response().await?;
        let size_code: u16 = size_resp[..3].parse().unwrap_or(0);

        if size_code == 213 {
            let size: u64 = size_resp[4..].trim().parse().unwrap_or(0);
            let name = vfs_path.rsplit('/').next().unwrap_or(vfs_path).to_string();
            return Ok(VfsNode {
                name,
                path: vfs_path.to_string(),
                is_dir: false,
                size: Some(size),
                modified: None,
                permissions: None,
            });
        }

        // Fallback: try CWD to detect directory
        self.cmd(&format!("CWD {ftp_path}")).await?;
        let cwd_resp = self.read_response().await?;
        let cwd_code: u16 = cwd_resp[..3].parse().unwrap_or(0);
        if cwd_code == 250 {
            // It's a directory; navigate back
            let parent = vfs_path.rsplit('/').skip(1).collect::<Vec<_>>().join("/");
            let parent_ftp = self.to_ftp_path(if parent.is_empty() { "/" } else { &parent });
            self.cmd(&format!("CWD {parent_ftp}")).await?;
            let _ = self.read_response().await;
            let name = vfs_path.rsplit('/').next().unwrap_or(vfs_path).to_string();
            return Ok(VfsNode {
                name,
                path: vfs_path.to_string(),
                is_dir: true,
                size: None,
                modified: None,
                permissions: None,
            });
        }

        Err(format!("FTP stat failed for {vfs_path}"))
    }

    // ── Search ───────────────────────────────────────────────────────────────

    pub async fn search(
        &mut self,
        start_path: &str,
        query: &str,
        max: usize,
    ) -> Result<Vec<VfsNode>, String> {
        let mut results = Vec::new();
        let entries = self.list_dir(start_path).await?;
        for e in entries {
            if e.name.to_lowercase().contains(&query.to_lowercase()) {
                results.push(e.clone());
            }
            if e.is_dir
                && results.len() < max
                && let Ok(sub) = Box::pin(self.search(&e.path, query, max - results.len())).await
            {
                results.extend(sub);
            }
            if results.len() >= max {
                break;
            }
        }
        Ok(results)
    }
}

// ─── Parse Unix-style FTP LIST output ────────────────────────────────────────

/// Parse Unix-style `LIST` output (same format as `ls -la`).
///
/// Example lines:
/// ```text
/// -rw-r--r--  1 user group 12345 Jan 15 10:30 filename.txt
/// drwxr-xr-x  2 user group  4096 Dec 31 2025 dirname
/// ```
fn parse_unix_list(output: &str, parent_path: &str) -> Vec<VfsNode> {
    let parent = parent_path.trim_end_matches('/');
    let mut nodes = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("total") {
            continue;
        }
        // Use split_whitespace for robust field parsing; filename is everything after the 8th token.
        let toks: Vec<&str> = line.split_whitespace().collect();
        if toks.len() < 9 {
            continue;
        }
        let perms = toks[0];
        let size_str = toks[4];
        let month = toks[5];
        let day = toks[6];
        let year_or_time = toks[7];
        // Everything from index 8 onward is the filename (handles spaces in names).
        let name = toks[8..].join(" ");

        if name == "." || name == ".." {
            continue;
        }

        let is_dir = perms.starts_with('d');
        let size: Option<u64> = if is_dir { None } else { size_str.parse().ok() };

        let modified = Some(format!("{month} {day} {year_or_time}"));

        let path = if parent.is_empty() {
            format!("/{name}")
        } else {
            format!("{parent}/{name}")
        };

        nodes.push(VfsNode {
            name,
            path,
            is_dir,
            size,
            modified,
            permissions: Some(perms.to_string()),
        });
    }
    nodes
}

// ─── FTP Connection pool ──────────────────────────────────────────────────────

/// Parsed FTP URI: `ftp://user:pass@host:port/root_path`
#[derive(Clone)]
struct FtpConnInfo {
    host: String,
    port: u16,
    user: String,
    pass: String,
    root: String,
}

impl FtpConnInfo {
    fn parse(uri: &str) -> Result<Self, String> {
        // Strip scheme
        let rest = uri
            .strip_prefix("ftp://")
            .or_else(|| uri.strip_prefix("ftps://"))
            .ok_or_else(|| format!("Not an FTP URI: {uri}"))?;

        // Split auth@host:port/path
        let (auth, hostpath) = rest.split_once('@').unwrap_or(("anonymous:", rest));

        let (user, pass) = auth.split_once(':').unwrap_or((auth, ""));

        let (hostport, root) = hostpath
            .split_once('/')
            .map(|(h, p)| (h, format!("/{p}")))
            .unwrap_or((hostpath, "/".to_string()));

        let (host, port_s) = hostport.split_once(':').unwrap_or((hostport, "21"));

        let port: u16 = port_s.parse().unwrap_or(21);

        Ok(FtpConnInfo {
            host: host.to_string(),
            port,
            user: user.to_string(),
            pass: pass.to_string(),
            root: if root.is_empty() {
                "/".to_string()
            } else {
                root
            },
        })
    }
}

/// Per-mount FTP connection pool (single connection for now; FTP is not thread-safe).
pub(crate) struct FtpPool {
    inner: Arc<Mutex<HashMap<String, Arc<Mutex<FtpConn>>>>>,
}

impl FtpPool {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn remove(&self, mount_id: &str) {
        self.inner.lock().await.remove(mount_id);
    }

    pub async fn get_or_connect(
        &self,
        mount_id: &str,
        root_uri: &str,
    ) -> Result<Arc<Mutex<FtpConn>>, String> {
        {
            let guard = self.inner.lock().await;
            if let Some(conn) = guard.get(mount_id) {
                return Ok(Arc::clone(conn));
            }
        }

        let info = FtpConnInfo::parse(root_uri)?;
        let mut conn =
            FtpConn::connect_and_login(&info.host, info.port, &info.user, &info.pass).await?;
        conn.root = info.root;

        let conn = Arc::new(Mutex::new(conn));
        self.inner
            .lock()
            .await
            .insert(mount_id.to_string(), Arc::clone(&conn));
        Ok(conn)
    }
}

// ─── High-level VFS operations wrapping FtpPool ───────────────────────────────

/// Convenience: execute a closure with a locked `FtpConn`, reconnecting on first failure.
async fn with_ftp<F, T, Fut>(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    f: F,
) -> Result<T, String>
where
    F: Fn(Arc<Mutex<FtpConn>>) -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let conn = pool.get_or_connect(mount_id, root_uri).await?;
    match f(Arc::clone(&conn)).await {
        Ok(v) => Ok(v),
        Err(e) => {
            // On error, evict and retry once
            tracing::warn!("FTP operation failed ({e}), reconnecting…");
            pool.remove(mount_id).await;
            let conn2 = pool.get_or_connect(mount_id, root_uri).await?;
            f(conn2).await
        }
    }
}

pub(crate) async fn ftp_list_dir(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    path: &str,
) -> Result<Vec<VfsNode>, String> {
    let path = path.to_string();
    with_ftp(pool, mount_id, root_uri, move |c| {
        let p = path.clone();
        async move { c.lock().await.list_dir(&p).await }
    })
    .await
}

pub(crate) async fn ftp_read_raw(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    path: &str,
) -> Result<Vec<u8>, String> {
    let path = path.to_string();
    with_ftp(pool, mount_id, root_uri, move |c| {
        let p = path.clone();
        async move { c.lock().await.read_file_raw(&p).await }
    })
    .await
}

pub(crate) async fn ftp_write(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    path: &str,
    data: Vec<u8>,
) -> Result<(), String> {
    let path = path.to_string();
    with_ftp(pool, mount_id, root_uri, move |c| {
        let p = path.clone();
        let d = data.clone();
        async move { c.lock().await.write_file(&p, &d).await }
    })
    .await
}

pub(crate) async fn ftp_mkdir(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    path: &str,
) -> Result<(), String> {
    let path = path.to_string();
    with_ftp(pool, mount_id, root_uri, move |c| {
        let p = path.clone();
        async move { c.lock().await.mkdir(&p).await }
    })
    .await
}

pub(crate) async fn ftp_delete(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    path: &str,
    is_dir: bool,
) -> Result<(), String> {
    let path = path.to_string();
    with_ftp(pool, mount_id, root_uri, move |c| {
        let p = path.clone();
        async move { c.lock().await.delete(&p, is_dir).await }
    })
    .await
}

/// Delete without knowing ahead of time whether target is a file or directory.
/// Tries DELE (file) first; on failure retries with RMD (directory).
pub(crate) async fn ftp_delete_auto(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    path: &str,
) -> Result<(), String> {
    // Try as file first
    match ftp_delete(pool, mount_id, root_uri, path, false).await {
        Ok(()) => Ok(()),
        Err(_) => ftp_delete(pool, mount_id, root_uri, path, true).await,
    }
}

pub(crate) async fn ftp_rename(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    src: &str,
    dest: &str,
) -> Result<(), String> {
    let src = src.to_string();
    let dest = dest.to_string();
    with_ftp(pool, mount_id, root_uri, move |c| {
        let s = src.clone();
        let d = dest.clone();
        async move { c.lock().await.rename(&s, &d).await }
    })
    .await
}

pub(crate) async fn ftp_stat(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    path: &str,
) -> Result<VfsNode, String> {
    let path = path.to_string();
    with_ftp(pool, mount_id, root_uri, move |c| {
        let p = path.clone();
        async move { c.lock().await.stat(&p).await }
    })
    .await
}

pub(crate) async fn ftp_search(
    pool: &FtpPool,
    mount_id: &str,
    root_uri: &str,
    start: &str,
    query: &str,
    max: usize,
) -> Result<Vec<VfsNode>, String> {
    let start = start.to_string();
    let query = query.to_string();
    with_ftp(pool, mount_id, root_uri, move |c| {
        let s = start.clone();
        let q = query.clone();
        async move { c.lock().await.search(&s, &q, max).await }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ftp_uri() {
        let info = FtpConnInfo::parse("ftp://alice:s3cr3t@ftp.example.com:2121/uploads").unwrap();
        assert_eq!(info.host, "ftp.example.com");
        assert_eq!(info.port, 2121);
        assert_eq!(info.user, "alice");
        assert_eq!(info.pass, "s3cr3t");
        assert_eq!(info.root, "/uploads");
    }

    #[test]
    fn test_parse_ftp_uri_defaults() {
        let info = FtpConnInfo::parse("ftp://anon@host.example.com/").unwrap();
        assert_eq!(info.port, 21);
        assert_eq!(info.root, "/");
    }

    #[test]
    fn test_parse_unix_list() {
        let listing = "\
total 8
drwxr-xr-x  2 user group 4096 Jan 15 10:30 docs
-rw-r--r--  1 user group 1234 Jan 16 09:00 readme.txt
";
        let nodes = parse_unix_list(listing, "/");
        assert_eq!(nodes.len(), 2);
        assert!(nodes[0].is_dir);
        assert_eq!(nodes[0].name, "docs");
        assert_eq!(nodes[1].name, "readme.txt");
        assert_eq!(nodes[1].size, Some(1234));
    }
}
