//! FTP driver for VFS.
//!
//! Implements the VFS driver traits using the FTP connection pool
//! defined in `crate::ftp`. FTP has no native copy or chmod support,
//! so those capabilities are not implemented.

use crate::driver::config::VfsDriverFactory;
use crate::driver::*;
use crate::error::{VfsError, VfsResult};
use crate::ftp::FtpPool;
use crate::types::{VfsCapabilities, VfsNode};
use crate::types::VfsMount;

// ─── Driver struct ──────────────────────────────────────────────────────────────

pub struct FtpDriver {
    mount_id: String,
    root_uri: String,
    ftp_pool: FtpPool,
}

// ─── VfsDriverMeta ──────────────────────────────────────────────────────────────

impl VfsDriverMeta for FtpDriver {
    fn driver_name(&self) -> &'static str {
        "ftp"
    }

    fn capabilities(&self) -> VfsCapabilities {
        VfsCapabilities {
            list: true,
            read: true,
            mkdir: true,
            delete_file: true,
            delete_dir: true,
            rename: true,
            copy: false,
            write: true,
            chmod: false,
            search: true,
            link: false,
            stream_upload: false,
        }
    }
}

// ─── VfsReader ──────────────────────────────────────────────────────────────────

impl VfsReader for FtpDriver {
    fn list_dir(&self, path: String, _show_hidden: bool) -> PinnedFuture<Vec<VfsNode>> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_list_dir(&pool, &mount_id, &root_uri, &path)
                .await
                .map_err(VfsError::Other)
        })
    }

    fn stat(&self, path: String) -> PinnedFuture<VfsNode> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_stat(&pool, &mount_id, &root_uri, &path)
                .await
                .map_err(VfsError::Other)
        })
    }

    fn read_file_raw(&self, path: String) -> PinnedFuture<Vec<u8>> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_read_raw(&pool, &mount_id, &root_uri, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsMkdir ───────────────────────────────────────────────────────────────────

impl VfsMkdir for FtpDriver {
    fn mkdir(&self, path: String) -> PinnedFuture<()> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_mkdir(&pool, &mount_id, &root_uri, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDeleteFile ──────────────────────────────────────────────────────────────

impl VfsDeleteFile for FtpDriver {
    fn delete_file(&self, path: String) -> PinnedFuture<()> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_delete_auto(&pool, &mount_id, &root_uri, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDeleteDir ───────────────────────────────────────────────────────────────

impl VfsDeleteDir for FtpDriver {
    fn delete_dir(&self, path: String) -> PinnedFuture<()> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_delete_auto(&pool, &mount_id, &root_uri, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsRename ──────────────────────────────────────────────────────────────────

impl VfsRename for FtpDriver {
    fn rename(&self, src: String, dest: String) -> PinnedFuture<()> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_rename(&pool, &mount_id, &root_uri, &src, &dest)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsPutFile ─────────────────────────────────────────────────────────────────

impl VfsPutFile for FtpDriver {
    fn put(&self, path: String, data: Vec<u8>) -> PinnedFuture<()> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_write(&pool, &mount_id, &root_uri, &path, data)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsSearch ──────────────────────────────────────────────────────────────────

impl VfsSearch for FtpDriver {
    fn search(&self, path: String, query: String, max: usize) -> PinnedFuture<Vec<VfsNode>> {
        let pool = self.ftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root_uri = self.root_uri.clone();
        Box::pin(async move {
            crate::ftp::ftp_search(&pool, &mount_id, &root_uri, &path, &query, max)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDriver aggregation ──────────────────────────────────────────────────────

impl VfsDriver for FtpDriver {
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
    fn as_put(&self) -> Option<&dyn VfsPutFile> {
        Some(self)
    }
    fn as_search(&self) -> Option<&dyn VfsSearch> {
        Some(self)
    }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

fn ftp_factory(mount: &VfsMount, ctx: &VfsDriverContext) -> VfsResult<Box<dyn VfsDriver>> {
    Ok(Box::new(FtpDriver {
        mount_id: mount.id.clone(),
        root_uri: mount.root.clone(),
        ftp_pool: ctx.ftp_pool.clone(),
    }))
}

inventory::submit!(VfsDriverFactory {
    name: "ftp",
    create: ftp_factory,
});
