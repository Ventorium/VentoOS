//! SMB2/SMB3 VFS driver.
//!
//! Implements the VFS driver trait system for SMB shares using the
//! `smolder-smb-core` pure Rust SMB client. All operations go through
//! the shared `SmbClientPool` which manages connection reuse.
//!
//! Includes read optimizations ported from tokimo-package-vfs:
//! - ReadHandleCache: LRU (16 entries) data cache for small files (< 10 MB)
//! - Parallel chunked reads: concurrent range requests for large files (>= 20 MB)
//!
//! Not implemented:
//! - `VfsChmod` (SMB ACL model is incompatible with POSIX chmod)
//! - `VfsPutStream` (not yet needed for SMB)
//! - `VfsResolveLocal` (SMB shares are remote-only)

use crate::driver::config::VfsDriverFactory;
use crate::driver::*;
use crate::error::{VfsError, VfsResult};
use crate::smb::SmbClientPool;
use crate::types::{VfsCapabilities, VfsLink, VfsNode};

// ─── Driver struct ───────────────────────────────────────────────────────────

pub struct SmbDriver {
    mount_id: String,
    smb_pool: SmbClientPool,
}

// ─── VfsDriverMeta ──────────────────────────────────────────────────────────

impl VfsDriverMeta for SmbDriver {
    fn driver_name(&self) -> &'static str {
        "smb"
    }

    fn capabilities(&self) -> VfsCapabilities {
        VfsCapabilities {
            list: true,
            read: true,
            mkdir: true,
            delete_file: true,
            delete_dir: true,
            rename: true,
            copy: true,
            write: true,
            chmod: false,
            search: true,
            link: false,
            stream_upload: false,
        }
    }
}

// ─── VfsReader ──────────────────────────────────────────────────────────────

impl VfsReader for SmbDriver {
    fn list_dir(&self, path: String, show_hidden: bool) -> PinnedFuture<Vec<VfsNode>> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::list_dir(&smb_pool, &mount_id, &path, show_hidden)
                .await
                .map_err(VfsError::Other)
        })
    }

    fn stat(&self, path: String) -> PinnedFuture<VfsNode> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::stat(&smb_pool, &mount_id, &path)
                .await
                .map_err(VfsError::Other)
        })
    }

    fn read_file_raw(&self, path: String) -> PinnedFuture<Vec<u8>> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::read_file_raw(&smb_pool, &mount_id, &path)
                .await
                .map_err(VfsError::Other)
        })
    }

    fn link(&self, _path: String) -> PinnedFuture<VfsLink> {
        Box::pin(async { Ok(VfsLink::default()) })
    }
}

// ─── VfsMkdir ───────────────────────────────────────────────────────────────

impl VfsMkdir for SmbDriver {
    fn mkdir(&self, path: String) -> PinnedFuture<()> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::mkdir(&smb_pool, &mount_id, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDeleteFile ──────────────────────────────────────────────────────────

impl VfsDeleteFile for SmbDriver {
    fn delete_file(&self, path: String) -> PinnedFuture<()> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::delete(&smb_pool, &mount_id, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDeleteDir ───────────────────────────────────────────────────────────

impl VfsDeleteDir for SmbDriver {
    /// SMB `delete` handles both files and directories.
    fn delete_dir(&self, path: String) -> PinnedFuture<()> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::delete(&smb_pool, &mount_id, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsRename ──────────────────────────────────────────────────────────────

impl VfsRename for SmbDriver {
    fn rename(&self, src: String, dest: String) -> PinnedFuture<()> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::move_file(&smb_pool, &mount_id, &src, &dest)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsCopyFile ────────────────────────────────────────────────────────────

impl VfsCopyFile for SmbDriver {
    fn copy(&self, src: String, dest: String) -> PinnedFuture<()> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::copy_file(&smb_pool, &mount_id, &src, &dest)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsPutFile ─────────────────────────────────────────────────────────────

impl VfsPutFile for SmbDriver {
    fn put(&self, path: String, data: Vec<u8>) -> PinnedFuture<()> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::upload_file(&smb_pool, &mount_id, &path, &data)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsSearch ──────────────────────────────────────────────────────────────

impl VfsSearch for SmbDriver {
    fn search(&self, path: String, query: String, max: usize) -> PinnedFuture<Vec<VfsNode>> {
        let smb_pool = self.smb_pool.clone();
        let mount_id = self.mount_id.clone();
        Box::pin(async move {
            crate::smb::search(&smb_pool, &mount_id, &path, &query, Some(max))
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDriver aggregation ──────────────────────────────────────────────────

impl VfsDriver for SmbDriver {
    fn as_mkdir(&self) -> Option<&dyn VfsMkdir> {
        Some(self)
    }
    fn as_delete_file(&self) -> Option<&dyn VfsDeleteFile> {
        Some(self)
    }
    fn as_delete_dir(&self) -> Option<&dyn VfsDeleteDir> {
        Some(self)
    }
    fn as_rename(&self) -> Option<&dyn VfsRename> {
        Some(self)
    }
    fn as_copy(&self) -> Option<&dyn VfsCopyFile> {
        Some(self)
    }
    fn as_put(&self) -> Option<&dyn VfsPutFile> {
        Some(self)
    }
    fn as_search(&self) -> Option<&dyn VfsSearch> {
        Some(self)
    }
}

// ─── Factory ────────────────────────────────────────────────────────────────

fn smb_factory(
    mount: &crate::types::VfsMount,
    ctx: &VfsDriverContext,
) -> VfsResult<Box<dyn VfsDriver>> {
    Ok(Box::new(SmbDriver {
        mount_id: mount.id.clone(),
        smb_pool: ctx.smb_pool.clone(),
    }))
}

inventory::submit!(VfsDriverFactory {
    name: "smb",
    create: smb_factory,
});
