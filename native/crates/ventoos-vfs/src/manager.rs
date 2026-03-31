use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::types::{
    CreateVfsMountReq, VfsCopyReq, VfsFileContent, VfsListReq, VfsMount, VfsMoveReq, VfsNode,
    VfsReadReq, VfsSourceKind,
};

/// Virtual file system manager.
/// Currently supports local filesystem; remote sources (SFTP, S3, SMB) are stubs.
pub struct VfsManager {
    mounts: Arc<RwLock<HashMap<String, VfsMount>>>,
}

impl VfsManager {
    pub fn new() -> Self {
        Self {
            mounts: Arc::new(RwLock::new(HashMap::new())),
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
}
