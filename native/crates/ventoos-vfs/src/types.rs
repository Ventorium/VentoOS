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

impl VfsSourceKind {
    /// Serialize as a lowercase string for DB storage (matches serde rename_all).
    pub fn as_db_str(self) -> &'static str {
        match self {
            VfsSourceKind::Local => "local",
            VfsSourceKind::Sftp => "sftp",
            VfsSourceKind::Ftp => "ftp",
            VfsSourceKind::Smb => "smb",
            VfsSourceKind::S3 => "s3",
            VfsSourceKind::WebDav => "webdav",
        }
    }
}

impl std::str::FromStr for VfsSourceKind {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "local" => Ok(VfsSourceKind::Local),
            "sftp" => Ok(VfsSourceKind::Sftp),
            "ftp" => Ok(VfsSourceKind::Ftp),
            "smb" => Ok(VfsSourceKind::Smb),
            "s3" => Ok(VfsSourceKind::S3),
            "webdav" => Ok(VfsSourceKind::WebDav),
            other => Err(format!("Unknown VFS kind: {other}")),
        }
    }
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

/// Mount backend selection for local filesystem mounting.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum MountBackend {
    /// FUSE-based mounting (macFUSE on macOS, libfuse3 on Linux).
    #[default]
    Fuse,
    /// Apple FileProvider framework (macOS 12+ only).
    FileProvider,
}

/// Local filesystem mount configuration (FUSE/WinFSP/FileProvider).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct LocalMountConfig {
    /// Whether local mounting is enabled.
    pub enabled: bool,
    /// Target directory on the local filesystem (`~` will be expanded by the server).
    pub mount_point: String,
    /// Mount backend to use. Defaults to Fuse for backward compatibility.
    #[serde(default)]
    pub backend: MountBackend,
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
    /// Optional local FUSE mount configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_mount: Option<LocalMountConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVfsMountReq {
    pub name: String,
    pub kind: VfsSourceKind,
    pub root: String,
    pub connection_id: Option<String>,
    pub group: Option<String>,
    /// Optional local FUSE mount configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_mount: Option<LocalMountConfig>,
}

/// Validate a local mount path for safety. Returns `None` if valid, or an error message.
pub fn validate_mount_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return Some("挂载路径不能为空".to_string());
    }
    if path.len() > 512 {
        return Some("挂载路径不能超过 512 字符".to_string());
    }
    // Normalize separators for check (accept both / and \)
    let normalized = path.replace('\\', "/");
    for segment in normalized.split('/').filter(|s| !s.is_empty()) {
        if segment == "." || segment == ".." {
            return Some("挂载路径不能包含 . 或 .. 路径段".to_string());
        }
        if segment.len() > 255 {
            return Some(format!("路径段 '{segment}' 超过 255 字符限制"));
        }
        let forbidden: &[char] = &['\0', '*', '?', '"', '<', '>', '|'];
        if let Some(c) = segment.chars().find(|c| forbidden.contains(c)) {
            return Some(format!("路径段 '{segment}' 不能包含字符 '{c}'"));
        }
    }
    None
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
