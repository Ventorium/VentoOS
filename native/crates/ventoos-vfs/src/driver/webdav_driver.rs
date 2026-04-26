//! WebDAV driver for VFS.
//!
//! Implements the VFS driver traits using the WebDAV client
//! defined in `crate::webdav`. WebDAV supports copy (via COPY method)
//! but has no native chmod, streaming upload, or search capabilities.
//!
//! The `link()` method returns a direct URL with HTTP Basic auth headers,
//! allowing clients to download files directly from the WebDAV server.

use std::collections::HashMap;

use base64::Engine;
use crate::driver::config::VfsDriverFactory;
use crate::driver::*;
use crate::error::{VfsError, VfsResult};
use crate::types::{VfsCapabilities, VfsLink, VfsNode};
use crate::types::VfsMount;

// ─── Driver struct ──────────────────────────────────────────────────────────────

pub struct WebDavDriver {
    config: crate::webdav::WebDavConfig,
}

// ─── VfsDriverMeta ──────────────────────────────────────────────────────────────

impl VfsDriverMeta for WebDavDriver {
    fn driver_name(&self) -> &'static str {
        "webdav"
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
            search: false,
            link: true,
            stream_upload: false,
        }
    }
}

// ─── VfsReader ──────────────────────────────────────────────────────────────────

impl VfsReader for WebDavDriver {
    fn list_dir(&self, path: String, _show_hidden: bool) -> PinnedFuture<Vec<VfsNode>> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.list_dir(&path).await.map_err(VfsError::Other)
        })
    }

    fn stat(&self, path: String) -> PinnedFuture<VfsNode> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.stat(&path).await.map_err(VfsError::Other)
        })
    }

    fn read_file_raw(&self, path: String) -> PinnedFuture<Vec<u8>> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.read_file(&path, None).await.map_err(VfsError::Other)
        })
    }

    fn link(&self, path: String) -> PinnedFuture<VfsLink> {
        let config = self.config.clone();
        Box::pin(async move {
            let url = config.url_for(&path);
            let mut header = HashMap::new();
            if let (Some(user), Some(pass)) = (&config.username, &config.password) {
                let credentials =
                    base64::engine::general_purpose::STANDARD.encode(format!("{user}:{pass}"));
                header.insert(
                    "Authorization".to_string(),
                    format!("Basic {credentials}"),
                );
            }
            Ok(VfsLink {
                url: Some(url),
                header,
                expiry: None,
            })
        })
    }
}

// ─── VfsMkdir ───────────────────────────────────────────────────────────────────

impl VfsMkdir for WebDavDriver {
    fn mkdir(&self, path: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.mkdir(&path).await.map_err(VfsError::Other)
        })
    }
}

// ─── VfsDeleteFile ──────────────────────────────────────────────────────────────

impl VfsDeleteFile for WebDavDriver {
    fn delete_file(&self, path: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.delete(&path).await.map_err(VfsError::Other)
        })
    }
}

// ─── VfsDeleteDir ───────────────────────────────────────────────────────────────

impl VfsDeleteDir for WebDavDriver {
    fn delete_dir(&self, path: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.delete(&path).await.map_err(VfsError::Other)
        })
    }
}

// ─── VfsRename ──────────────────────────────────────────────────────────────────

impl VfsRename for WebDavDriver {
    fn rename(&self, src: String, dest: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.move_file(&src, &dest).await.map_err(VfsError::Other)
        })
    }
}

// ─── VfsCopyFile ────────────────────────────────────────────────────────────────

impl VfsCopyFile for WebDavDriver {
    fn copy(&self, src: String, dest: String) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.copy_file(&src, &dest).await.map_err(VfsError::Other)
        })
    }
}

// ─── VfsPutFile ─────────────────────────────────────────────────────────────────

impl VfsPutFile for WebDavDriver {
    fn put(&self, path: String, data: Vec<u8>) -> PinnedFuture<()> {
        let config = self.config.clone();
        Box::pin(async move {
            let client = crate::webdav::WebDavClient::new(config);
            client.write_file(&path, data).await.map_err(VfsError::Other)
        })
    }
}

// ─── VfsDriver aggregation ──────────────────────────────────────────────────────

impl VfsDriver for WebDavDriver {
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
}

// ─── Factory ────────────────────────────────────────────────────────────────────

fn webdav_factory(mount: &VfsMount, _ctx: &VfsDriverContext) -> VfsResult<Box<dyn VfsDriver>> {
    let config = crate::webdav::WebDavConfig::parse(&mount.root).map_err(VfsError::Other)?;
    Ok(Box::new(WebDavDriver { config }))
}

inventory::submit!(VfsDriverFactory {
    name: "webdav",
    create: webdav_factory,
});
