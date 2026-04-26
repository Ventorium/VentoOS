//! VFS driver trait system and registry.
//!
//! Adapted from tokimo-package-vfs capability-based design:
//! - Each backend implements `VfsDriver` (mandatory: meta + read ops)
//! - Optional write capabilities are separate traits, probed via `as_xxx() -> Option`
//! - Backends self-register via `inventory::submit!`
//!
//! Architecture:
//!   VfsManager → driver (trait object) → backend implementation

mod config;
pub mod registry;

pub mod ftp_driver;
pub mod local_driver;
pub mod s3_driver;
pub mod sftp_driver;
pub mod smb_driver;
pub mod webdav_driver;

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use tokio::sync::mpsc;

use crate::error::VfsResult;
use crate::ftp::FtpPool;
use crate::sftp::{SftpPool, SshInfoProvider};
use crate::smb::SmbClientPool;
use crate::types::{VfsCapabilities, VfsLink, VfsNode};

// ─── Type alias for pinned boxed futures ────────────────────────────

type PinnedFuture<T> = Pin<Box<dyn Future<Output = VfsResult<T>> + Send>>;

// ─── Mandatory traits ──────────────────────────────────────────────

/// Lifecycle metadata and capability declaration.
/// Every backend must implement this.
pub trait VfsDriverMeta: Send + Sync + 'static {
    fn driver_name(&self) -> &'static str;
    fn capabilities(&self) -> VfsCapabilities;
}

/// Read operations. Every backend must implement this.
pub trait VfsReader: Send + Sync + 'static {
    fn list_dir(&self, path: String, show_hidden: bool) -> PinnedFuture<Vec<VfsNode>>;
    fn stat(&self, path: String) -> PinnedFuture<VfsNode>;
    fn read_file_raw(&self, path: String) -> PinnedFuture<Vec<u8>>;

    /// Return a pre-signed or direct download link. Default: no link (proxy required).
    fn link(&self, _path: String) -> PinnedFuture<VfsLink> {
        Box::pin(async { Ok(VfsLink::default()) })
    }
}

// ─── Optional write capability traits ──────────────────────────────

pub trait VfsMkdir: Send + Sync + 'static {
    fn mkdir(&self, path: String) -> PinnedFuture<()>;
}

pub trait VfsDeleteFile: Send + Sync + 'static {
    fn delete_file(&self, path: String) -> PinnedFuture<()>;
}

pub trait VfsDeleteDir: Send + Sync + 'static {
    fn delete_dir(&self, path: String) -> PinnedFuture<()>;
}

pub trait VfsRename: Send + Sync + 'static {
    fn rename(&self, src: String, dest: String) -> PinnedFuture<()>;
}

pub trait VfsCopyFile: Send + Sync + 'static {
    fn copy(&self, src: String, dest: String) -> PinnedFuture<()>;
}

pub trait VfsPutFile: Send + Sync + 'static {
    fn put(&self, path: String, data: Vec<u8>) -> PinnedFuture<()>;
}

pub trait VfsPutStream: Send + Sync + 'static {
    fn put_stream(&self, path: String, rx: mpsc::Receiver<Vec<u8>>) -> PinnedFuture<()>;
}

pub trait VfsChmod: Send + Sync + 'static {
    fn chmod(&self, path: String, mode: u32) -> PinnedFuture<()>;
}

pub trait VfsSearch: Send + Sync + 'static {
    fn search(&self, path: String, query: String, max: usize) -> PinnedFuture<Vec<VfsNode>>;
}

/// Resolve a VFS path to a real local filesystem path.
pub trait VfsResolveLocal: Send + Sync + 'static {
    fn resolve_local(&self, path: &str) -> Option<String>;
}

// ─── Aggregation trait ─────────────────────────────────────────────

/// Unified driver trait. Mandatory: meta + reader.
/// Optional write capabilities probed via `as_xxx()` returning `Option`.
pub trait VfsDriver: VfsDriverMeta + VfsReader {
    fn as_mkdir(&self) -> Option<&dyn VfsMkdir> {
        None
    }
    fn as_delete_file(&self) -> Option<&dyn VfsDeleteFile> {
        None
    }
    fn as_delete_dir(&self) -> Option<&dyn VfsDeleteDir> {
        None
    }
    fn as_rename(&self) -> Option<&dyn VfsRename> {
        None
    }
    fn as_copy(&self) -> Option<&dyn VfsCopyFile> {
        None
    }
    fn as_put(&self) -> Option<&dyn VfsPutFile> {
        None
    }
    fn as_put_stream(&self) -> Option<&dyn VfsPutStream> {
        None
    }
    fn as_chmod(&self) -> Option<&dyn VfsChmod> {
        None
    }
    fn as_search(&self) -> Option<&dyn VfsSearch> {
        None
    }
    fn as_resolve_local(&self) -> Option<&dyn VfsResolveLocal> {
        None
    }
}

// ─── Driver construction context ───────────────────────────────────

/// Injection callback for persisting driver configuration changes.
///
/// Some backends (cloud storage, OAuth-based services) may need to refresh
/// tokens or update connection config as a side effect of normal operations.
/// This trait allows the backend to delegate persistence to the storage
/// layer without knowing the details.
///
/// Inspired by tokimo-package-vfs ConfigPersister.
pub trait VfsConfigPersister: Send + Sync + 'static {
    /// Persist a key-value configuration entry.
    fn persist(&self, key: &str, value: &str) -> Result<(), String>;
    /// Load a previously persisted configuration entry.
    fn load(&self, key: &str) -> Option<String>;
}

/// Shared resources passed from VfsManager to driver constructors.
#[derive(Clone)]
pub struct VfsDriverContext {
    pub sftp_pool: SftpPool,
    pub ssh_provider: Option<Arc<dyn SshInfoProvider>>,
    pub ftp_pool: FtpPool,
    pub smb_pool: SmbClientPool,
    /// Optional config persistence callback for token refresh etc.
    pub config_persister: Option<Arc<dyn VfsConfigPersister>>,
}
