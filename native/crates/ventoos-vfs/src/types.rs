use serde::{Deserialize, Serialize};

/// The type of filesystem source.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VfsSourceKind {
    Local,
    Sftp,
    Ftp,
    Smb,
    S3,
    WebDav,
}

/// Settings for the built-in WebDAV server that exposes mounts to external clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavServerSettings {
    /// Whether the WebDAV server is enabled.
    pub enabled: bool,
    /// HTTP Basic Auth username for the WebDAV server.
    pub username: String,
    /// HTTP Basic Auth password for the WebDAV server.
    pub password: String,
    /// List of mount IDs to expose through the WebDAV server.
    pub exposed_mounts: Vec<String>,
}

impl Default for WebDavServerSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            username: "webdav".to_string(),
            password: String::new(),
            exposed_mounts: Vec::new(),
        }
    }
}

/// Validates that a mount name is safe to use as a WebDAV directory path segment.
/// Returns `None` if valid, or an error message if invalid.
pub fn validate_mount_name(name: &str) -> Option<String> {
    if name.is_empty() {
        return Some("名称不能为空".to_string());
    }
    if name.len() > 100 {
        return Some("名称不能超过 100 个字符".to_string());
    }
    if name != name.trim() {
        return Some("名称不能以空格开头或结尾".to_string());
    }
    let forbidden: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'];
    if let Some(c) = name.chars().find(|c| forbidden.contains(c)) {
        return Some(format!("名称不能包含字符 '{c}'"));
    }
    None
}

/// A mount source configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsMount {
    pub id: String,
    pub name: String,
    pub kind: VfsSourceKind,
    /// Root path for local, bucket for S3, share for SMB, etc.
    pub root: String,
    /// Optional connection ID (for SFTP, it references an SSH connection).
    pub connection_id: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVfsMountReq {
    pub name: String,
    pub kind: VfsSourceKind,
    pub root: String,
    pub connection_id: Option<String>,
    pub group: Option<String>,
}

/// A single file or directory node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub permissions: Option<String>,
}

/// Request to list directory contents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsListReq {
    pub mount_id: String,
    pub path: String,
    #[serde(default)]
    pub show_hidden: bool,
}

/// Request to read file contents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsReadReq {
    pub mount_id: String,
    pub path: String,
    /// Max bytes to read (for preview).
    pub max_bytes: Option<u64>,
}

/// File content response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsFileContent {
    pub path: String,
    pub size: u64,
    pub content: String,
    pub is_binary: bool,
    pub truncated: bool,
}

/// Request to move or copy a file/directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsMoveReq {
    pub mount_id: String,
    pub src: String,
    pub dest: String,
}

/// Request to copy a file/directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsCopyReq {
    pub mount_id: String,
    pub src: String,
    pub dest: String,
}

/// Request to create a directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsMkdirReq {
    pub mount_id: String,
    pub path: String,
}

/// Request to delete a file or directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsDeleteReq {
    pub mount_id: String,
    pub path: String,
}

/// Request to write file content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsWriteReq {
    pub mount_id: String,
    pub path: String,
    pub content: String,
}

/// Search request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsSearchReq {
    pub mount_id: String,
    pub path: String,
    pub query: String,
    pub max_results: Option<usize>,
}
