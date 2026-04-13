//! Types for the mount subsystem.

use serde::{Deserialize, Serialize};

/// Current status of a VFS source mount.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum MountStatus {
    /// Not currently mounted.
    Unmounted,
    /// Currently mounted at the given path.
    Mounted {
        /// Absolute mount point path (tilde expanded).
        mount_point: String,
    },
    /// Mount attempt failed.
    Error {
        /// Human-readable error message.
        error: String,
    },
}

/// Errors from mount / unmount operations.
#[derive(Debug, thiserror::Error)]
pub enum MountError {
    #[error("FUSE error: {0}")]
    Fuse(String),

    #[error("Mount point path error: {0}")]
    PathError(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("FileProvider error: {0}")]
    FileProvider(String),

    #[error("Unsupported platform")]
    Unsupported,

    #[error("Mount not found: {0}")]
    NotFound(String),
}
