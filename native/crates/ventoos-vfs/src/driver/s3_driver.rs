//! S3-compatible object storage VFS driver.
//!
//! Implements the VFS driver trait system for S3 backends (AWS S3, MinIO, R2, etc.).
//! S3 has no real directories, so `mkdir` creates a placeholder empty key with a
//! trailing `/`, and `rename` is implemented as copy-then-delete.
//!
//! Not implemented:
//! - `VfsDeleteDir` (S3 has no directories)
//! - `VfsChmod` (object storage has no POSIX permissions)
//! - `VfsPutStream` (not yet needed for S3)
//! - `VfsResolveLocal` (S3 objects are remote-only)

use crate::driver::config::VfsDriverFactory;
use crate::driver::*;
use crate::error::{VfsError, VfsResult};
use crate::types::{VfsCapabilities, VfsLink, VfsNode};

// ─── Driver struct ───────────────────────────────────────────────────────────

pub struct S3Driver {
    config: crate::s3::S3Config,
}

// ─── VfsDriverMeta ──────────────────────────────────────────────────────────

impl VfsDriverMeta for S3Driver {
    fn driver_name(&self) -> &'static str {
        "s3"
    }

    fn capabilities(&self) -> VfsCapabilities {
        VfsCapabilities {
            list: true,
            read: true,
            mkdir: true,          // placeholder empty key with trailing /
            delete_file: true,
            delete_dir: false,    // S3 has no directories
            rename: true,         // copy + delete
            copy: true,
            write: true,
            chmod: false,
            search: true,
            link: true,           // presigned GET URL via SigV4 query auth
            stream_upload: true,
        }
    }
}

// ─── VfsReader ──────────────────────────────────────────────────────────────

impl VfsReader for S3Driver {
    fn list_dir(&self, path: String, show_hidden: bool) -> PinnedFuture<Vec<VfsNode>> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            let mut nodes = client.list_dir(&path).await.map_err(VfsError::Other)?;
            if !show_hidden {
                nodes.retain(|n| !n.name.starts_with('.'));
            }
            Ok(nodes)
        })
    }

    fn stat(&self, path: String) -> PinnedFuture<VfsNode> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            client.stat(&path).await.map_err(VfsError::Other)
        })
    }

    fn read_file_raw(&self, path: String) -> PinnedFuture<Vec<u8>> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            client.get_object(&path).await.map_err(VfsError::Other)
        })
    }

    /// Generate a pre-signed GET URL with 1-hour expiry using SigV4 query auth.
    /// The presigned URL approach avoids proxying large downloads through the VentoOS server.
    fn link(&self, path: String) -> PinnedFuture<VfsLink> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            let (url, expiry) = client
                .presign_get_url(&path, 3600)
                .await
                .map_err(VfsError::Other)?;
            Ok(VfsLink {
                url: Some(url),
                header: std::collections::HashMap::new(),
                expiry: Some(expiry),
            })
        })
    }
}

// ─── VfsMkdir ───────────────────────────────────────────────────────────────

impl VfsMkdir for S3Driver {
    /// S3 has no real directories; create a placeholder empty key with trailing `/`.
    fn mkdir(&self, path: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            let dir_key = format!("{}/", path.trim_end_matches('/'));
            client
                .put_object(&dir_key, &[])
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDeleteFile ──────────────────────────────────────────────────────────

impl VfsDeleteFile for S3Driver {
    fn delete_file(&self, path: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            client.delete_object(&path).await.map_err(VfsError::Other)
        })
    }
}

// ─── VfsRename ──────────────────────────────────────────────────────────────

impl VfsRename for S3Driver {
    /// S3 has no native rename; implemented as copy-then-delete.
    fn rename(&self, src: String, dest: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            client
                .copy_object(&src, &dest)
                .await
                .map_err(VfsError::Other)?;
            client.delete_object(&src).await.map_err(VfsError::Other)
        })
    }
}

// ─── VfsCopyFile ────────────────────────────────────────────────────────────

impl VfsCopyFile for S3Driver {
    fn copy(&self, src: String, dest: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            client
                .copy_object(&src, &dest)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsPutFile ─────────────────────────────────────────────────────────────

impl VfsPutFile for S3Driver {
    fn put(&self, path: String, data: Vec<u8>) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            client
                .put_object(&path, &data)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsSearch ──────────────────────────────────────────────────────────────

impl VfsSearch for S3Driver {
    fn search(&self, path: String, query: String, max: usize) -> PinnedFuture<Vec<VfsNode>> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::s3::S3Client::new(config);
            client
                .search(&path, &query, max)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsPutStream ───────────────────────────────────────────────────────────

impl VfsPutStream for S3Driver {
    /// Stream-write file content to S3 via channel.
    ///
    /// Collects chunks from the channel and uploads as a single PutObject.
    /// For large files, this could be optimized to use multipart upload.
    fn put_stream(&self, path: String, mut rx: tokio::sync::mpsc::Receiver<Vec<u8>>) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let mut all_data = Vec::new();
            while let Some(chunk) = rx.recv().await {
                all_data.extend_from_slice(&chunk);
            }
            let client = crate::s3::S3Client::new(config);
            client
                .put_object(&path, &all_data)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDriver aggregation ──────────────────────────────────────────────────

impl VfsDriver for S3Driver {
    fn as_mkdir(&self) -> Option<&dyn VfsMkdir> {
        Some(self)
    }
    fn as_delete_file(&self) -> Option<&dyn VfsDeleteFile> {
        Some(self)
    }
    // No VfsDeleteDir -- S3 has no directories.
    fn as_rename(&self) -> Option<&dyn VfsRename> {
        Some(self)
    }
    fn as_copy(&self) -> Option<&dyn VfsCopyFile> {
        Some(self)
    }
    fn as_put(&self) -> Option<&dyn VfsPutFile> {
        Some(self)
    }
    fn as_put_stream(&self) -> Option<&dyn VfsPutStream> {
        Some(self)
    }
    fn as_search(&self) -> Option<&dyn VfsSearch> {
        Some(self)
    }
}

// ─── Factory ────────────────────────────────────────────────────────────────

fn s3_factory(
    mount: &crate::types::VfsMount,
    _ctx: &VfsDriverContext,
) -> VfsResult<Box<dyn VfsDriver>> {
    let config = crate::s3::S3Config::parse(&mount.root).map_err(VfsError::Other)?;
    Ok(Box::new(S3Driver { config }))
}

inventory::submit!(VfsDriverFactory {
    name: "s3",
    create: s3_factory,
});
