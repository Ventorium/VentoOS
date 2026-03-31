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
