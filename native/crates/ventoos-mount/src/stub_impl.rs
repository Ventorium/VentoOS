//! Stub mount implementation for platforms without FUSE support (e.g. Windows).
//! WinFSP integration is planned for a future release.

use std::collections::HashMap;
use std::sync::Arc;

use ventoos_vfs::VfsManager;

use crate::manager::MountState;

/// Placeholder: on unsupported platforms this function is never called
/// (the manager returns `MountError::Unsupported` before reaching here).
pub(crate) async fn run_fuse_mount(
    _mount_id: String,
    _mount_point: String,
    _vfs: Arc<VfsManager>,
    _state: Arc<tokio::sync::RwLock<HashMap<String, MountState>>>,
) {
    // No-op on unsupported platforms.
}

/// No-op unmount on unsupported platforms.
pub(crate) fn force_unmount(_mount_point: &str) {}
