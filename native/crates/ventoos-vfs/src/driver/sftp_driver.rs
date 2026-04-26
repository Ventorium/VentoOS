//! SFTP-backed VFS driver.
//!
//! Wraps the existing `crate::sftp` free functions into the driver trait system.
//! Supports connection-ID-based mounts (via `SshInfoProvider`) and inline URL-based
//! mounts (credentials embedded in `sftp://...` URI).

use std::sync::Arc;

use crate::driver::config::VfsDriverFactory;
use crate::driver::*;
use crate::error::VfsError;
use crate::error::VfsResult;
use crate::sftp::{InlineSftpProvider, SftpPool, SshInfoProvider};
use crate::types::{VfsCapabilities, VfsNode};

// ─── Driver struct ─────────────────────────────────────────────────

pub struct SftpDriver {
    mount_id: String,
    root: String,
    sftp_pool: SftpPool,
    ssh_provider: Arc<dyn SshInfoProvider>,
    connection_id: Option<String>,
}

impl SftpDriver {
    /// Obtain an SFTP session, either from the connection-ID provider or by
    /// parsing credentials from the inline `sftp://` URL stored in `root`.
    async fn get_sftp(
        sftp_pool: &SftpPool,
        mount_id: &str,
        root: &str,
        ssh_provider: &Arc<dyn SshInfoProvider>,
        connection_id: &Option<String>,
    ) -> VfsResult<Arc<russh_sftp::client::SftpSession>> {
        if let Some(conn_id) = connection_id {
            sftp_pool
                .get_or_connect(conn_id, &**ssh_provider)
                .await
                .map_err(VfsError::Other)
        } else {
            let (mut conn_info, _) =
                crate::sftp::SshConnInfo::parse_sftp_url(root).map_err(VfsError::Other)?;
            // If private key is a file path (not inline PEM), read the file.
            if let crate::sftp::SshAuth::PrivateKey {
                ref key_pem,
                ref passphrase,
            } = conn_info.auth
            {
                let key_str = key_pem.trim();
                if !key_str.contains("-----BEGIN") {
                    let expanded = expand_tilde(key_str);
                    let content = tokio::fs::read_to_string(&expanded)
                        .await
                        .map_err(|e| VfsError::Other(format!("Failed to read private key file '{expanded}': {e}")))?;
                    conn_info.auth = crate::sftp::SshAuth::PrivateKey {
                        key_pem: content,
                        passphrase: passphrase.clone(),
                    };
                }
            }
            let provider = InlineSftpProvider(conn_info);
            sftp_pool
                .get_or_connect(mount_id, &provider)
                .await
                .map_err(VfsError::Other)
        }
    }
}

/// Expand `~` to the user's home directory in a path string.
fn expand_tilde(path: &str) -> String {
    if path == "~" || path.starts_with("~/") {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
        if path == "~" {
            home
        } else {
            format!("{}/{}", home, &path[2..])
        }
    } else {
        path.to_string()
    }
}

// ─── VfsDriverMeta ─────────────────────────────────────────────────

impl VfsDriverMeta for SftpDriver {
    fn driver_name(&self) -> &'static str {
        "sftp"
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
            chmod: true,
            search: false, // stub
            link: false,
            stream_upload: false,
        }
    }
}

// ─── VfsReader ──────────────────────────────────────────────────────

impl VfsReader for SftpDriver {
    fn list_dir(&self, path: String, show_hidden: bool) -> PinnedFuture<Vec<VfsNode>> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            crate::sftp::list_dir(&sftp, &root, &path, show_hidden)
                .await
                .map_err(VfsError::Other)
        })
    }

    fn stat(&self, path: String) -> PinnedFuture<VfsNode> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            crate::sftp::stat(&sftp, &root, &path)
                .await
                .map_err(VfsError::Other)
        })
    }

    fn read_file_raw(&self, path: String) -> PinnedFuture<Vec<u8>> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            crate::sftp::read_file_raw(&sftp, &root, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsMkdir ───────────────────────────────────────────────────────

impl VfsMkdir for SftpDriver {
    fn mkdir(&self, path: String) -> PinnedFuture<()> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            crate::sftp::mkdir(&sftp, &root, &path)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsDeleteFile ──────────────────────────────────────────────────

impl VfsDeleteFile for SftpDriver {
    fn delete_file(&self, path: String) -> PinnedFuture<()> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            let full_path = sftp_resolve_path(&root, &path);
            sftp.remove_file(&full_path)
                .await
                .map_err(|e| VfsError::Other(format!("SFTP remove failed: {e}")))
        })
    }
}

// ─── VfsDeleteDir ───────────────────────────────────────────────────

impl VfsDeleteDir for SftpDriver {
    fn delete_dir(&self, path: String) -> PinnedFuture<()> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            let full_path = sftp_resolve_path(&root, &path);
            sftp.remove_dir(&full_path)
                .await
                .map_err(|e| VfsError::Other(format!("SFTP rmdir failed: {e}")))
        })
    }
}

// ─── VfsRename ──────────────────────────────────────────────────────

impl VfsRename for SftpDriver {
    fn rename(&self, src: String, dest: String) -> PinnedFuture<()> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            crate::sftp::move_file(&sftp, &root, &src, &dest)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsCopyFile ────────────────────────────────────────────────────

impl VfsCopyFile for SftpDriver {
    fn copy(&self, src: String, dest: String) -> PinnedFuture<()> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            crate::sftp::copy_file(&sftp, &root, &src, &dest)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsPutFile ─────────────────────────────────────────────────────

impl VfsPutFile for SftpDriver {
    fn put(&self, path: String, data: Vec<u8>) -> PinnedFuture<()> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            crate::sftp::upload_file(&sftp, &root, &path, &data)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsChmod ───────────────────────────────────────────────────────

impl VfsChmod for SftpDriver {
    fn chmod(&self, path: String, mode: u32) -> PinnedFuture<()> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            crate::chmod::chmod_sftp(&sftp, &root, &path, mode)
                .await
                .map_err(VfsError::Other)
        })
    }
}

// ─── VfsSearch ──────────────────────────────────────────────────────

impl VfsSearch for SftpDriver {
    fn search(&self, path: String, query: String, max: usize) -> PinnedFuture<Vec<VfsNode>> {
        let sftp_pool = self.sftp_pool.clone();
        let mount_id = self.mount_id.clone();
        let root = self.root.clone();
        let ssh_provider = self.ssh_provider.clone();
        let connection_id = self.connection_id.clone();
        Box::pin(async move {
            let _sftp = Self::get_sftp(&sftp_pool, &mount_id, &root, &ssh_provider, &connection_id).await?;
            let _ = (&path, &query, max);
            // SFTP search is expensive over high-latency connections; return empty for now.
            Ok(vec![])
        })
    }
}

// ─── VfsDriver aggregation ─────────────────────────────────────────

impl VfsDriver for SftpDriver {
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
    fn as_chmod(&self) -> Option<&dyn VfsChmod> {
        Some(self)
    }
    fn as_search(&self) -> Option<&dyn VfsSearch> {
        Some(self)
    }
}

// ─── Path helper ────────────────────────────────────────────────────

/// Resolve a relative path within a remote root.
/// Mirrors the private `resolve_remote_path` in `crate::sftp`.
fn sftp_resolve_path(root: &str, rel_path: &str) -> String {
    let root = root.trim_end_matches('/');
    if rel_path.is_empty() || rel_path == "/" {
        if root.is_empty() {
            "/".to_string()
        } else {
            root.to_string()
        }
    } else {
        let clean: Vec<&str> = rel_path
            .split('/')
            .filter(|s| !s.is_empty() && *s != "." && *s != "..")
            .collect();
        if clean.is_empty() {
            root.to_string()
        } else {
            format!("{}/{}", root, clean.join("/"))
        }
    }
}

// ─── Factory ────────────────────────────────────────────────────────

fn sftp_factory(mount: &crate::types::VfsMount, ctx: &VfsDriverContext) -> VfsResult<Box<dyn VfsDriver>> {
    let ssh_provider = ctx.ssh_provider.clone().ok_or_else(|| {
        VfsError::InvalidConfig("SSH provider required for SFTP".into())
    })?;
    let root = if mount.connection_id.is_some() {
        mount.root.clone()
    } else {
        let (_, path) =
            crate::sftp::SshConnInfo::parse_sftp_url(&mount.root).map_err(VfsError::Other)?;
        path
    };
    Ok(Box::new(SftpDriver {
        mount_id: mount.id.clone(),
        root,
        sftp_pool: ctx.sftp_pool.clone(),
        ssh_provider,
        connection_id: mount.connection_id.clone(),
    }))
}

inventory::submit!(VfsDriverFactory {
    name: "sftp",
    create: sftp_factory,
});
