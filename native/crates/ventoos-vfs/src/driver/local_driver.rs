//! Local filesystem VFS driver.
//!
//! Implements the VFS driver trait system for the local filesystem.
//! All path resolution includes canonicalize + starts_with traversal checks
//! to prevent directory traversal attacks.

use crate::chmod;
use crate::driver::config::VfsDriverFactory;
use crate::driver::*;
use crate::error::{VfsError, VfsResult};
use crate::types::{VfsCapabilities, VfsNode};

use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;

// ─── LocalDriver ────────────────────────────────────────────────────

pub struct LocalDriver {
    root: String,
}

impl VfsDriverMeta for LocalDriver {
    fn driver_name(&self) -> &'static str {
        "local"
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
            search: true,
            link: false,
            stream_upload: true,
        }
    }
}

impl VfsReader for LocalDriver {
    fn list_dir(&self, path: String, show_hidden: bool) -> PinnedFuture<Vec<VfsNode>> {
        let root = self.root.clone();
        Box::pin(async move {
            let base = std::path::Path::new(&root);
            let full = if path.is_empty() || path == "/" {
                base.to_path_buf()
            } else {
                let clean = path.trim_start_matches('/');
                let candidate = base.join(clean);
                let canonical_root = base
                    .canonicalize()
                    .map_err(|e| VfsError::Other(format!("Root path error: {e}")))?;
                let canonical_candidate = candidate
                    .canonicalize()
                    .map_err(|e| VfsError::Other(format!("Path error: {e}")))?;
                if !canonical_candidate.starts_with(&canonical_root) {
                    return Err(VfsError::Other("Path traversal denied".into()));
                }
                canonical_candidate
            };

            let mut entries = Vec::new();
            let mut read_dir = tokio::fs::read_dir(&full)
                .await
                .map_err(|e| VfsError::Other(format!("Read dir failed: {e}")))?;

            while let Ok(Some(entry)) = read_dir.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                if !show_hidden && name.starts_with('.') {
                    continue;
                }
                let metadata = tokio::time::timeout(std::time::Duration::from_millis(500), entry.metadata())
                    .await
                    .ok()
                    .and_then(std::result::Result::ok);
                let is_dir = metadata.as_ref().is_some_and(std::fs::Metadata::is_dir);
                let size = metadata.as_ref().and_then(|m| if m.is_file() { Some(m.len()) } else { None });
                let modified = metadata
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        let dt: chrono::DateTime<chrono::Utc> = t.into();
                        dt.to_rfc3339()
                    });

                let entry_path = if path.is_empty() || path == "/" {
                    format!("/{name}")
                } else {
                    format!("{}/{name}", path.trim_end_matches('/'))
                };

                entries.push(VfsNode {
                    name,
                    path: entry_path,
                    is_dir,
                    size,
                    modified,
                    permissions: None,
                });
            }

            entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            });

            Ok(entries)
        })
    }

    fn stat(&self, path: String) -> PinnedFuture<VfsNode> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let target = resolve_local_path(root_path, &path)?;
            let metadata = tokio::time::timeout(
                std::time::Duration::from_secs(2),
                tokio::fs::metadata(&target),
            )
            .await
            .map_err(|_| VfsError::Other("stat timed out (possible unresponsive mount)".into()))?
            .map_err(|e| VfsError::Other(format!("stat failed: {e}")))?;

            let name = target
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let is_dir = metadata.is_dir();
            let size = if is_dir { None } else { Some(metadata.len()) };
            let modified = metadata.modified().ok().map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.to_rfc3339()
            });

            Ok(VfsNode {
                name,
                path,
                is_dir,
                size,
                modified,
                permissions: None,
            })
        })
    }

    fn read_file_raw(&self, path: String) -> PinnedFuture<Vec<u8>> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let canonical = resolve_local_path(root_path, &path)?;
            tokio::fs::read(&canonical)
                .await
                .map_err(|e| VfsError::Other(format!("Read error: {e}")))
        })
    }
}

impl VfsMkdir for LocalDriver {
    fn mkdir(&self, path: String) -> PinnedFuture<()> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let dest = resolve_local_dest(root_path, &path)?;
            tokio::fs::create_dir_all(&dest)
                .await
                .map_err(|e| VfsError::Other(format!("mkdir failed: {e}")))
        })
    }
}

impl VfsDeleteFile for LocalDriver {
    fn delete_file(&self, path: String) -> PinnedFuture<()> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let target = resolve_local_path(root_path, &path)?;
            tokio::fs::remove_file(&target)
                .await
                .map_err(|e| VfsError::Other(format!("remove failed: {e}")))
        })
    }
}

impl VfsDeleteDir for LocalDriver {
    fn delete_dir(&self, path: String) -> PinnedFuture<()> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let target = resolve_local_path(root_path, &path)?;
            tokio::fs::remove_dir_all(&target)
                .await
                .map_err(|e| VfsError::Other(format!("rmdir failed: {e}")))
        })
    }
}

impl VfsRename for LocalDriver {
    fn rename(&self, src: String, dest: String) -> PinnedFuture<()> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let src_path = resolve_local_path(root_path, &src)?;
            let dest_path = resolve_local_dest(root_path, &dest)?;

            if src_path == dest_path {
                return Ok(());
            }
            if dest_path.exists() {
                return Err(VfsError::Other("Destination already exists".into()));
            }

            tokio::fs::rename(&src_path, &dest_path)
                .await
                .map_err(|e| VfsError::Other(format!("Move failed: {e}")))
        })
    }
}

impl VfsCopyFile for LocalDriver {
    fn copy(&self, src: String, dest: String) -> PinnedFuture<()> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let src_path = resolve_local_path(root_path, &src)?;
            let dest_path = resolve_local_dest(root_path, &dest)?;

            if dest_path.exists() {
                return Err(VfsError::Other("Destination already exists".into()));
            }

            let metadata = tokio::fs::metadata(&src_path)
                .await
                .map_err(|e| VfsError::Other(format!("Source not found: {e}")))?;

            if metadata.is_dir() {
                copy_dir_recursive(&src_path, &dest_path).await?;
            } else {
                tokio::fs::copy(&src_path, &dest_path)
                    .await
                    .map_err(|e| VfsError::Other(format!("Copy failed: {e}")))?;
            }
            Ok(())
        })
    }
}

impl VfsPutFile for LocalDriver {
    fn put(&self, path: String, data: Vec<u8>) -> PinnedFuture<()> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let dest = resolve_local_dest(root_path, &path)?;
            tokio::fs::write(&dest, &data)
                .await
                .map_err(|e| VfsError::Other(format!("upload failed: {e}")))
        })
    }
}

impl VfsPutStream for LocalDriver {
    /// Stream-write file content via channel.
    ///
    /// Receives chunks from the channel and writes them sequentially
    /// to the destination file. Creates parent directories as needed.
    fn put_stream(&self, path: String, mut rx: mpsc::Receiver<Vec<u8>>) -> PinnedFuture<()> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let dest = resolve_local_dest(root_path, &path)?;

            // Create parent directory if needed
            if let Some(parent) = dest.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| VfsError::Other(format!("Create dir failed: {e}")))?;
            }

            let mut file = tokio::fs::File::create(&dest)
                .await
                .map_err(|e| VfsError::Other(format!("Create file failed: {e}")))?;

            while let Some(chunk) = rx.recv().await {
                file.write_all(&chunk)
                    .await
                    .map_err(|e| VfsError::Other(format!("Write chunk failed: {e}")))?;
            }

            file.flush()
                .await
                .map_err(|e| VfsError::Other(format!("Flush failed: {e}")))?;

            Ok(())
        })
    }
}

impl VfsChmod for LocalDriver {
    fn chmod(&self, path: String, mode: u32) -> PinnedFuture<()> {
        let root = self.root.clone();
        Box::pin(async move {
            chmod::chmod_local(&root, &path, mode)
                .await
                .map_err(VfsError::Other)
        })
    }
}

impl VfsSearch for LocalDriver {
    fn search(&self, path: String, query: String, max: usize) -> PinnedFuture<Vec<VfsNode>> {
        let root = self.root.clone();
        Box::pin(async move {
            let root_path = std::path::Path::new(&root);
            let base = if path.is_empty() || path == "/" {
                root_path
                    .canonicalize()
                    .map_err(|e| VfsError::Other(format!("Root path error: {e}")))?
            } else {
                resolve_local_path(root_path, &path)?
            };

            let query_lower = query.to_lowercase();
            let mut results = Vec::new();
            let canonical_root = root_path
                .canonicalize()
                .map_err(|e| VfsError::Other(format!("Root path error: {e}")))?;

            search_local_recursive(&base, &canonical_root, &query_lower, max, &mut results)
                .await?;
            Ok(results)
        })
    }
}

impl VfsResolveLocal for LocalDriver {
    fn resolve_local(&self, path: &str) -> Option<String> {
        let clean = path.trim_start_matches('/');
        let candidate = std::path::Path::new(&self.root).join(clean);
        candidate.canonicalize().ok().map(|p| p.to_string_lossy().into_owned())
    }
}

impl VfsDriver for LocalDriver {
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
    fn as_put_stream(&self) -> Option<&dyn VfsPutStream> {
        Some(self)
    }
    fn as_chmod(&self) -> Option<&dyn VfsChmod> {
        Some(self)
    }
    fn as_search(&self) -> Option<&dyn VfsSearch> {
        Some(self)
    }
    fn as_resolve_local(&self) -> Option<&dyn VfsResolveLocal> {
        Some(self)
    }
}

// ─── Path helpers (free functions for use in 'static futures) ───────

fn resolve_local_path(
    root: &std::path::Path,
    rel_path: &str,
) -> VfsResult<std::path::PathBuf> {
    let clean = rel_path.trim_start_matches('/');
    let candidate = root.join(clean);
    let canonical_root = root
        .canonicalize()
        .map_err(|e| VfsError::Other(format!("Root path error: {e}")))?;
    let canonical = candidate
        .canonicalize()
        .map_err(|e| VfsError::Other(format!("Path error: {e}")))?;
    if !canonical.starts_with(&canonical_root) {
        return Err(VfsError::Other("Path traversal denied".into()));
    }
    Ok(canonical)
}

fn resolve_local_dest(
    root: &std::path::Path,
    rel_path: &str,
) -> VfsResult<std::path::PathBuf> {
    let clean = rel_path.trim_start_matches('/');
    let candidate = root.join(clean);
    let parent = candidate
        .parent()
        .ok_or_else(|| VfsError::Other("Invalid destination path".into()))?;
    let canonical_root = root
        .canonicalize()
        .map_err(|e| VfsError::Other(format!("Root path error: {e}")))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| VfsError::Other(format!("Destination parent not found: {e}")))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err(VfsError::Other("Path traversal denied".into()));
    }
    let file_name = candidate
        .file_name()
        .ok_or_else(|| VfsError::Other("Invalid destination filename".into()))?;
    Ok(canonical_parent.join(file_name))
}

// ─── Helpers ───────────────────────────────────────────────────────

async fn copy_dir_recursive(
    src: &std::path::Path,
    dest: &std::path::Path,
) -> VfsResult<()> {
    tokio::fs::create_dir_all(dest)
        .await
        .map_err(|e| VfsError::Other(format!("Create dir failed: {e}")))?;

    let mut read_dir = tokio::fs::read_dir(src)
        .await
        .map_err(|e| VfsError::Other(format!("Read dir failed: {e}")))?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let src_child = entry.path();
        let dest_child = dest.join(entry.file_name());
        let file_type = entry
            .file_type()
            .await
            .map_err(|e| VfsError::Other(format!("File type error: {e}")))?;

        if file_type.is_dir() {
            Box::pin(copy_dir_recursive(&src_child, &dest_child)).await?;
        } else {
            tokio::fs::copy(&src_child, &dest_child)
                .await
                .map_err(|e| VfsError::Other(format!("Copy file failed: {e}")))?;
        }
    }
    Ok(())
}

async fn search_local_recursive(
    dir: &std::path::Path,
    root: &std::path::Path,
    query: &str,
    limit: usize,
    results: &mut Vec<VfsNode>,
) -> VfsResult<()> {
    if results.len() >= limit {
        return Ok(());
    }

    let mut read_dir = tokio::fs::read_dir(dir)
        .await
        .map_err(|e| VfsError::Other(format!("Read dir failed: {e}")))?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        if results.len() >= limit {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let metadata = entry.metadata().await.ok();
        let is_dir = metadata.as_ref().is_some_and(std::fs::Metadata::is_dir);

        if name.to_lowercase().contains(query) {
            let full = entry.path();
            let rel = full
                .strip_prefix(root)
                .unwrap_or(&full)
                .to_string_lossy()
                .to_string();
            let rel_path = format!("/{rel}");
            let size = metadata
                .as_ref()
                .and_then(|m| if m.is_file() { Some(m.len()) } else { None });
            let modified = metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                });
            results.push(VfsNode {
                name: name.clone(),
                path: rel_path,
                is_dir,
                size,
                modified,
                permissions: None,
            });
        }

        if is_dir {
            Box::pin(search_local_recursive(
                &entry.path(),
                root,
                query,
                limit,
                results,
            ))
            .await?;
        }
    }
    Ok(())
}

// ─── Factory ───────────────────────────────────────────────────────

fn local_factory(mount: &crate::types::VfsMount, _ctx: &VfsDriverContext) -> VfsResult<Box<dyn VfsDriver>> {
    Ok(Box::new(LocalDriver {
        root: mount.root.clone(),
    }))
}

inventory::submit!(VfsDriverFactory {
    name: "local",
    create: local_factory,
});
