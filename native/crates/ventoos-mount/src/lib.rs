//! `ventoos-mount` — Cross-platform local filesystem mounting for VFS sources.
//!
//! On Linux and macOS: uses FUSE3 (via the `fuse3` crate).
//! On Windows: stub implementation (WinFSP integration planned).
//!
//! # Usage
//!
//! ```rust,no_run
//! use std::sync::Arc;
//! use ventoos_mount::{LocalMountManager, MountStatus};
//!
//! // let manager = LocalMountManager::new();
//! // manager.mount("mount-id", config, vfs_manager).await?;
//! // manager.status("mount-id"); // -> MountStatus::Mounted { ... }
//! ```

pub mod types;
pub mod validate;

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub(crate) mod fuse_impl;

#[cfg(target_os = "macos")]
pub(crate) mod fileprovider_impl;

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub(crate) mod stub_impl;

mod manager;

pub use manager::LocalMountManager;
pub use types::{MountError, MountStatus};
pub use validate::validate_mount_path;
pub use ventoos_vfs::types::MountBackend;
