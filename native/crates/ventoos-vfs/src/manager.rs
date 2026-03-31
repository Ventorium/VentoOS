use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::sftp::SftpPool;
use crate::types::{
    CreateVfsMountReq, VfsCopyReq, VfsDeleteReq, VfsFileContent, VfsListReq, VfsMkdirReq,
    VfsMount, VfsMoveReq, VfsNode, VfsReadReq, VfsSearchReq, VfsSourceKind, VfsWriteReq,
};

/// Virtual file system manager.
/// Supports local filesystem and SFTP; other sources are stubs.
pub struct VfsManager {
    mounts: Arc<RwLock<HashMap<String, VfsMount>>>,
    sftp_pool: SftpPool,
}

impl VfsManager {
    pub fn new() -> Self {
        Self {
            mounts: Arc::new(RwLock::new(HashMap::new())),
            sftp_pool: SftpPool::new(),
        }
    }

    pub async fn create_mount(&self, req: CreateVfsMountReq) -> VfsMount {
        let id = uuid::Uuid::new_v4().to_string();
        let mount = VfsMount {
            id: id.clone(),
            name: req.name,
            kind: req.kind,
            root: req.root,
            connection_id: req.connection_id,
            group: req.group,
        };
        self.mounts.write().await.insert(id, mount.clone());
        mount
    }

    pub async fn list_mounts(&self) -> Vec<VfsMount> {
        let mounts = self.mounts.read().await;
        let mut list: Vec<_> = mounts.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn get_mount(&self, id: &str) -> Option<VfsMount> {
        self.mounts.read().await.get(id).cloned()
    }

    pub async fn delete_mount(&self, id: &str) -> bool {
        self.sftp_pool.remove(id).await;
        self.mounts.write().await.remove(id).is_some()
    }

    /// List directory contents.
    pub async fn list_dir(&self, req: &VfsListReq) -> Result<Vec<VfsNode>, String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(&req.mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => self.list_local_dir(&mount.root, &req.path).await,
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(&req.mount_id, &mount.root).await?;
                conn.list_dir(&req.path).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    async fn list_local_dir(&self, root: &str, rel_path: &str) -> Result<Vec<VfsNode>, String> {
        let base = std::path::Path::new(root);
        let full = if rel_path.is_empty() || rel_path == "/" {
            base.to_path_buf()
        } else {
            // Prevent path traversal: ensure the resolved path stays under root
            let clean = rel_path.trim_start_matches('/');
            let candidate = base.join(clean);
            let canonical_root = base
                .canonicalize()
                .map_err(|e| format!("Root path error: {e}"))?;
            let canonical_candidate = candidate
                .canonicalize()
                .map_err(|e| format!("Path error: {e}"))?;
            if !canonical_candidate.starts_with(&canonical_root) {
                return Err("Path traversal denied".into());
            }
            canonical_candidate
        };

        let mut entries = Vec::new();
        let mut read_dir = tokio::fs::read_dir(&full)
            .await
            .map_err(|e| format!("Read dir failed: {e}"))?;

        while let Ok(Some(entry)) = read_dir.next_entry().await {
            let name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden files by default
            if name.starts_with('.') {
                continue;
            }
            let metadata = entry.metadata().await.ok();
            let is_dir = metadata.as_ref().is_some_and(std::fs::Metadata::is_dir);
            let size = metadata
                .as_ref()
                .and_then(|m| if m.is_file() { Some(m.len()) } else { None });
            let modified = metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.to_rfc3339()
            });

            let entry_path = if rel_path.is_empty() || rel_path == "/" {
                format!("/{name}")
            } else {
                format!("{}/{name}", rel_path.trim_end_matches('/'))
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

        // Sort: directories first, then alphabetical
        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(entries)
    }

    /// Read file content. Returns text for small files, marks binary files.
    pub async fn read_file(&self, req: &VfsReadReq) -> Result<VfsFileContent, String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(&req.mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => {
                self.read_local_file(&mount.root, &req.path, req.max_bytes)
                    .await
            }
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(&req.mount_id, &mount.root).await?;
                conn.read_file(&req.path, req.max_bytes).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Move (rename) a file or directory within the same mount.
    pub async fn move_file(&self, req: &VfsMoveReq) -> Result<(), String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(&req.mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => self.move_local(&mount.root, &req.src, &req.dest).await,
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(&req.mount_id, &mount.root).await?;
                conn.move_file(&req.src, &req.dest).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Copy a file or directory within the same mount.
    pub async fn copy_file(&self, req: &VfsCopyReq) -> Result<(), String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(&req.mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => self.copy_local(&mount.root, &req.src, &req.dest).await,
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(&req.mount_id, &mount.root).await?;
                conn.copy_file(&req.src, &req.dest).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Create a directory (including parent directories).
    pub async fn mkdir(&self, req: &VfsMkdirReq) -> Result<(), String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(&req.mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => self.mkdir_local(&mount.root, &req.path).await,
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(&req.mount_id, &mount.root).await?;
                conn.mkdir(&req.path).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Delete a file or directory.
    pub async fn delete(&self, req: &VfsDeleteReq) -> Result<(), String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(&req.mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => self.delete_local(&mount.root, &req.path).await,
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(&req.mount_id, &mount.root).await?;
                conn.delete(&req.path).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Write string content to a file.
    pub async fn write_file(&self, req: &VfsWriteReq) -> Result<(), String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(&req.mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => {
                self.write_local(&mount.root, &req.path, req.content.as_bytes())
                    .await
            }
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(&req.mount_id, &mount.root).await?;
                conn.write_file(&req.path, req.content.as_bytes()).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Upload binary file content.
    pub async fn upload_file(
        &self,
        mount_id: &str,
        path: &str,
        data: Vec<u8>,
    ) -> Result<(), String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => self.write_local(&mount.root, path, &data).await,
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(mount_id, &mount.root).await?;
                conn.write_file(path, &data).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Get file/directory metadata.
    pub async fn stat(&self, mount_id: &str, path: &str) -> Result<VfsNode, String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => self.stat_local(&mount.root, path).await,
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(mount_id, &mount.root).await?;
                conn.stat(path).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Search files by name pattern.
    pub async fn search(&self, req: &VfsSearchReq) -> Result<Vec<VfsNode>, String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(&req.mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => {
                self.search_local(
                    &mount.root,
                    &req.path,
                    &req.query,
                    req.max_results.unwrap_or(100),
                )
                .await
            }
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(&req.mount_id, &mount.root).await?;
                conn.search(&req.path, &req.query, req.max_results.unwrap_or(100)).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    /// Resolve and validate a path within the mount root, returning the canonical path.
    fn resolve_local_path(
        root: &std::path::Path,
        rel_path: &str,
    ) -> Result<std::path::PathBuf, String> {
        let clean = rel_path.trim_start_matches('/');
        let candidate = root.join(clean);
        let canonical_root = root
            .canonicalize()
            .map_err(|e| format!("Root path error: {e}"))?;
        let canonical = candidate
            .canonicalize()
            .map_err(|e| format!("Path error: {e}"))?;
        if !canonical.starts_with(&canonical_root) {
            return Err("Path traversal denied".into());
        }
        Ok(canonical)
    }

    /// Resolve a destination path that may not exist yet — validate its parent is under root.
    fn resolve_local_dest(
        root: &std::path::Path,
        rel_path: &str,
    ) -> Result<std::path::PathBuf, String> {
        let clean = rel_path.trim_start_matches('/');
        let candidate = root.join(clean);
        // The parent must exist and be under root
        let parent = candidate
            .parent()
            .ok_or_else(|| "Invalid destination path".to_string())?;
        let canonical_root = root
            .canonicalize()
            .map_err(|e| format!("Root path error: {e}"))?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Destination parent not found: {e}"))?;
        if !canonical_parent.starts_with(&canonical_root) {
            return Err("Path traversal denied".into());
        }
        // Return parent_canonical / filename
        let file_name = candidate
            .file_name()
            .ok_or_else(|| "Invalid destination filename".to_string())?;
        Ok(canonical_parent.join(file_name))
    }

    async fn move_local(&self, root: &str, src: &str, dest: &str) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let src_path = Self::resolve_local_path(root_path, src)?;
        let dest_path = Self::resolve_local_dest(root_path, dest)?;

        if src_path == dest_path {
            return Ok(());
        }
        if dest_path.exists() {
            return Err("Destination already exists".into());
        }

        tokio::fs::rename(&src_path, &dest_path)
            .await
            .map_err(|e| format!("Move failed: {e}"))
    }

    async fn copy_local(&self, root: &str, src: &str, dest: &str) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let src_path = Self::resolve_local_path(root_path, src)?;
        let dest_path = Self::resolve_local_dest(root_path, dest)?;

        if dest_path.exists() {
            return Err("Destination already exists".into());
        }

        let metadata = tokio::fs::metadata(&src_path)
            .await
            .map_err(|e| format!("Source not found: {e}"))?;

        if metadata.is_dir() {
            copy_dir_recursive(&src_path, &dest_path).await?;
        } else {
            tokio::fs::copy(&src_path, &dest_path)
                .await
                .map_err(|e| format!("Copy failed: {e}"))?;
        }
        Ok(())
    }

    async fn mkdir_local(&self, root: &str, rel_path: &str) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let canonical_root = root_path
            .canonicalize()
            .map_err(|e| format!("Root path error: {e}"))?;

        let clean = rel_path.trim_start_matches('/');
        let candidate = root_path.join(clean);

        // Walk up to find the first existing ancestor and verify it's under root
        let mut check = candidate.as_path();
        loop {
            if check.exists() {
                let canonical = check
                    .canonicalize()
                    .map_err(|e| format!("Path error: {e}"))?;
                if !canonical.starts_with(&canonical_root) {
                    return Err("Path traversal denied".into());
                }
                break;
            }
            match check.parent() {
                Some(p) => check = p,
                None => return Err("Invalid path".into()),
            }
        }

        tokio::fs::create_dir_all(&candidate)
            .await
            .map_err(|e| format!("Create directory failed: {e}"))
    }

    async fn delete_local(&self, root: &str, rel_path: &str) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let full_path = Self::resolve_local_path(root_path, rel_path)?;

        // Prevent deleting the root itself
        let canonical_root = root_path
            .canonicalize()
            .map_err(|e| format!("Root path error: {e}"))?;
        if full_path == canonical_root {
            return Err("Cannot delete mount root".into());
        }

        let metadata = tokio::fs::metadata(&full_path)
            .await
            .map_err(|e| format!("Path not found: {e}"))?;

        if metadata.is_dir() {
            tokio::fs::remove_dir_all(&full_path)
                .await
                .map_err(|e| format!("Delete directory failed: {e}"))
        } else {
            tokio::fs::remove_file(&full_path)
                .await
                .map_err(|e| format!("Delete file failed: {e}"))
        }
    }

    async fn write_local(&self, root: &str, rel_path: &str, data: &[u8]) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let dest_path = Self::resolve_local_dest(root_path, rel_path)?;

        tokio::fs::write(&dest_path, data)
            .await
            .map_err(|e| format!("Write failed: {e}"))
    }

    async fn stat_local(&self, root: &str, rel_path: &str) -> Result<VfsNode, String> {
        let root_path = std::path::Path::new(root);
        let full_path = Self::resolve_local_path(root_path, rel_path)?;

        let metadata = tokio::fs::metadata(&full_path)
            .await
            .map_err(|e| format!("Metadata error: {e}"))?;

        let name = full_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let is_dir = metadata.is_dir();
        let size = if metadata.is_file() {
            Some(metadata.len())
        } else {
            None
        };
        let modified = metadata.modified().ok().map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.to_rfc3339()
        });

        #[cfg(unix)]
        let permissions = {
            use std::os::unix::fs::PermissionsExt;
            Some(format!("{:o}", metadata.permissions().mode()))
        };
        #[cfg(not(unix))]
        let permissions: Option<String> = None;

        Ok(VfsNode {
            name,
            path: rel_path.to_string(),
            is_dir,
            size,
            modified,
            permissions,
        })
    }

    async fn search_local(
        &self,
        root: &str,
        rel_path: &str,
        query: &str,
        max_results: usize,
    ) -> Result<Vec<VfsNode>, String> {
        let root_path = std::path::Path::new(root);
        let start_path = if rel_path.is_empty() || rel_path == "/" {
            root_path
                .canonicalize()
                .map_err(|e| format!("Root path error: {e}"))?
        } else {
            Self::resolve_local_path(root_path, rel_path)?
        };
        let canonical_root = root_path
            .canonicalize()
            .map_err(|e| format!("Root path error: {e}"))?;

        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        search_dir_recursive(
            &start_path,
            &canonical_root,
            &query_lower,
            max_results,
            0,
            10, // max depth
            &mut results,
        )
        .await;
        Ok(results)
    }

    /// Read raw file bytes for download / image preview.
    pub async fn read_file_raw(&self, mount_id: &str, path: &str) -> Result<Vec<u8>, String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => self.read_local_file_raw(&mount.root, path).await,
            VfsSourceKind::Sftp => {
                let conn = self.sftp_pool.get_or_connect(mount_id, &mount.root).await?;
                conn.read_file_raw(path).await
            }
            _ => Err(format!("{:?} source not yet implemented", mount.kind)),
        }
    }

    async fn read_local_file_raw(&self, root: &str, rel_path: &str) -> Result<Vec<u8>, String> {
        let base = std::path::Path::new(root);
        let clean = rel_path.trim_start_matches('/');
        let candidate = base.join(clean);
        let canonical_root = base
            .canonicalize()
            .map_err(|e| format!("Root path error: {e}"))?;
        let canonical = candidate
            .canonicalize()
            .map_err(|e| format!("Path error: {e}"))?;
        if !canonical.starts_with(&canonical_root) {
            return Err("Path traversal denied".into());
        }
        tokio::fs::read(&canonical)
            .await
            .map_err(|e| format!("Read error: {e}"))
    }

    async fn read_local_file(
        &self,
        root: &str,
        rel_path: &str,
        max_bytes: Option<u64>,
    ) -> Result<VfsFileContent, String> {
        let base = std::path::Path::new(root);
        let clean = rel_path.trim_start_matches('/');
        let candidate = base.join(clean);
        let canonical_root = base
            .canonicalize()
            .map_err(|e| format!("Root path error: {e}"))?;
        let canonical = candidate
            .canonicalize()
            .map_err(|e| format!("Path error: {e}"))?;
        if !canonical.starts_with(&canonical_root) {
            return Err("Path traversal denied".into());
        }

        let metadata = tokio::fs::metadata(&canonical)
            .await
            .map_err(|e| format!("Metadata error: {e}"))?;
        let file_size = metadata.len();
        let limit = max_bytes.unwrap_or(1_048_576); // Default 1 MB

        let bytes = tokio::fs::read(&canonical)
            .await
            .map_err(|e| format!("Read error: {e}"))?;

        let truncated = bytes.len() as u64 > limit;
        let slice = if truncated {
            &bytes[..usize::try_from(limit).unwrap_or(usize::MAX)]
        } else {
            &bytes
        };

        // Check if binary (contains null bytes in first 8KB)
        let check_len = slice.len().min(8192);
        let is_binary = slice[..check_len].contains(&0);

        let content = if is_binary {
            format!("[Binary file, {file_size} bytes]")
        } else {
            String::from_utf8_lossy(slice).into_owned()
        };

        Ok(VfsFileContent {
            path: rel_path.to_string(),
            size: file_size,
            content,
            is_binary,
            truncated,
        })
    }
}

/// Recursively copy a directory.
async fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    tokio::fs::create_dir_all(dest)
        .await
        .map_err(|e| format!("Create dir failed: {e}"))?;

    let mut read_dir = tokio::fs::read_dir(src)
        .await
        .map_err(|e| format!("Read dir failed: {e}"))?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let src_child = entry.path();
        let dest_child = dest.join(entry.file_name());
        let file_type = entry
            .file_type()
            .await
            .map_err(|e| format!("File type error: {e}"))?;

        if file_type.is_dir() {
            Box::pin(copy_dir_recursive(&src_child, &dest_child)).await?;
        } else {
            tokio::fs::copy(&src_child, &dest_child)
                .await
                .map_err(|e| format!("Copy file failed: {e}"))?;
        }
    }
    Ok(())
}

/// Recursively search a directory for files matching a query.
async fn search_dir_recursive(
    dir: &std::path::Path,
    root: &std::path::Path,
    query: &str,
    max_results: usize,
    depth: usize,
    max_depth: usize,
    results: &mut Vec<VfsNode>,
) {
    if depth > max_depth || results.len() >= max_results {
        return;
    }

    let Ok(mut read_dir) = tokio::fs::read_dir(dir).await else {
        return;
    };

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        if results.len() >= max_results {
            return;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }

        let Ok(metadata) = entry.metadata().await else {
            continue;
        };
        let is_dir = metadata.is_dir();

        if name.to_lowercase().contains(query) {
            let entry_path = entry.path();
            let rel_path = entry_path
                .strip_prefix(root)
                .map(|p| format!("/{}", p.to_string_lossy()))
                .unwrap_or_default();
            let size = if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            };
            let modified = metadata.modified().ok().map(|t| {
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
            Box::pin(search_dir_recursive(
                &entry.path(),
                root,
                query,
                max_results,
                depth + 1,
                max_depth,
                results,
            ))
            .await;
        }
    }
}

impl Default for VfsManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_list_mounts() {
        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "home".into(),
                kind: VfsSourceKind::Local,
                root: "/tmp".into(),
                connection_id: None,
                group: None,
            })
            .await;
        assert_eq!(mount.name, "home");
        let list = mgr.list_mounts().await;
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_list_local_dir() {
        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "tmp".into(),
                kind: VfsSourceKind::Local,
                root: "/tmp".into(),
                connection_id: None,
                group: None,
            })
            .await;
        // Should be able to list /tmp without error
        let result = mgr
            .list_dir(&VfsListReq {
                mount_id: mount.id,
                path: "/".into(),
            })
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_path_traversal_blocked() {
        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "tmp".into(),
                kind: VfsSourceKind::Local,
                root: "/tmp".into(),
                connection_id: None,
                group: None,
            })
            .await;
        let result = mgr
            .list_dir(&VfsListReq {
                mount_id: mount.id,
                path: "/../etc".into(),
            })
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_move_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        // Create a test file
        std::fs::write(dir.path().join("a.txt"), "hello").unwrap();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root: root.clone(),
                connection_id: None,
                group: None,
            })
            .await;

        let result = mgr
            .move_file(&VfsMoveReq {
                mount_id: mount.id.clone(),
                src: "/a.txt".into(),
                dest: "/b.txt".into(),
            })
            .await;
        assert!(result.is_ok());
        assert!(!dir.path().join("a.txt").exists());
        assert!(dir.path().join("b.txt").exists());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("b.txt")).unwrap(),
            "hello"
        );
    }

    #[tokio::test]
    async fn test_copy_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        std::fs::write(dir.path().join("orig.txt"), "data").unwrap();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root: root.clone(),
                connection_id: None,
                group: None,
            })
            .await;

        let result = mgr
            .copy_file(&VfsCopyReq {
                mount_id: mount.id.clone(),
                src: "/orig.txt".into(),
                dest: "/copy.txt".into(),
            })
            .await;
        assert!(result.is_ok());
        assert!(dir.path().join("orig.txt").exists());
        assert!(dir.path().join("copy.txt").exists());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("copy.txt")).unwrap(),
            "data"
        );
    }

    #[tokio::test]
    async fn test_move_path_traversal_blocked() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        std::fs::write(dir.path().join("file.txt"), "secret").unwrap();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root: root.clone(),
                connection_id: None,
                group: None,
            })
            .await;

        // Attempt to move outside root
        let result = mgr
            .move_file(&VfsMoveReq {
                mount_id: mount.id,
                src: "/file.txt".into(),
                dest: "/../../../tmp/evil.txt".into(),
            })
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_move_dest_exists_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        std::fs::write(dir.path().join("a.txt"), "a").unwrap();
        std::fs::write(dir.path().join("b.txt"), "b").unwrap();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root,
                connection_id: None,
                group: None,
            })
            .await;

        let result = mgr
            .move_file(&VfsMoveReq {
                mount_id: mount.id,
                src: "/a.txt".into(),
                dest: "/b.txt".into(),
            })
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[tokio::test]
    async fn test_mkdir() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root,
                connection_id: None,
                group: None,
            })
            .await;

        let result = mgr
            .mkdir(&VfsMkdirReq {
                mount_id: mount.id.clone(),
                path: "/sub/deep/dir".into(),
            })
            .await;
        assert!(result.is_ok());
        assert!(dir.path().join("sub/deep/dir").is_dir());
    }

    #[tokio::test]
    async fn test_delete_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        std::fs::write(dir.path().join("to_delete.txt"), "bye").unwrap();
        assert!(dir.path().join("to_delete.txt").exists());

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root,
                connection_id: None,
                group: None,
            })
            .await;

        let result = mgr
            .delete(&VfsDeleteReq {
                mount_id: mount.id.clone(),
                path: "/to_delete.txt".into(),
            })
            .await;
        assert!(result.is_ok());
        assert!(!dir.path().join("to_delete.txt").exists());
    }

    #[tokio::test]
    async fn test_delete_dir() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        std::fs::create_dir_all(dir.path().join("subdir")).unwrap();
        std::fs::write(dir.path().join("subdir/a.txt"), "a").unwrap();
        std::fs::write(dir.path().join("subdir/b.txt"), "b").unwrap();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root,
                connection_id: None,
                group: None,
            })
            .await;

        let result = mgr
            .delete(&VfsDeleteReq {
                mount_id: mount.id.clone(),
                path: "/subdir".into(),
            })
            .await;
        assert!(result.is_ok());
        assert!(!dir.path().join("subdir").exists());
    }

    #[tokio::test]
    async fn test_delete_root_blocked() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root,
                connection_id: None,
                group: None,
            })
            .await;

        // Trying to delete "/" (root) should be denied
        let result = mgr
            .delete(&VfsDeleteReq {
                mount_id: mount.id.clone(),
                path: "/".into(),
            })
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_write_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root,
                connection_id: None,
                group: None,
            })
            .await;

        let result = mgr
            .write_file(&VfsWriteReq {
                mount_id: mount.id.clone(),
                path: "/hello.txt".into(),
                content: "Hello, VFS!".into(),
            })
            .await;
        assert!(result.is_ok());

        let content = std::fs::read_to_string(dir.path().join("hello.txt")).unwrap();
        assert_eq!(content, "Hello, VFS!");
    }

    #[tokio::test]
    async fn test_stat() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        std::fs::write(dir.path().join("info.txt"), "some data").unwrap();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root,
                connection_id: None,
                group: None,
            })
            .await;

        let node = mgr.stat(&mount.id, "/info.txt").await.unwrap();
        assert_eq!(node.name, "info.txt");
        assert!(!node.is_dir);
        assert_eq!(node.size, Some(9));
        assert!(node.modified.is_some());
    }

    #[tokio::test]
    async fn test_search() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        std::fs::write(dir.path().join("readme.md"), "# Hello").unwrap();
        std::fs::write(dir.path().join("notes.txt"), "notes").unwrap();
        std::fs::create_dir_all(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub/readme.txt"), "sub readme").unwrap();

        let mgr = VfsManager::new();
        let mount = mgr
            .create_mount(CreateVfsMountReq {
                name: "test".into(),
                kind: VfsSourceKind::Local,
                root,
                connection_id: None,
                group: None,
            })
            .await;

        let results = mgr
            .search(&VfsSearchReq {
                mount_id: mount.id.clone(),
                path: "/".into(),
                query: "readme".into(),
                max_results: None,
            })
            .await
            .unwrap();
        assert_eq!(results.len(), 2);

        // Test case-insensitive
        let results = mgr
            .search(&VfsSearchReq {
                mount_id: mount.id.clone(),
                path: "/".into(),
                query: "README".into(),
                max_results: Some(1),
            })
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
    }
}
