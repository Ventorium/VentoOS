use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::ftp::FtpPool;
use crate::sftp::{InlineSftpProvider, SftpPool, SshInfoProvider};
use crate::smb::SmbMountManager;
use crate::types::{
    CreateVfsMountReq, VfsCopyReq, VfsDeleteReq, VfsFileContent, VfsListReq, VfsMkdirReq,
    VfsMount, VfsMoveReq, VfsNode, VfsReadReq, VfsSearchReq, VfsSourceKind, VfsWriteReq,
};

/// Virtual file system manager.
/// Supports local, SFTP, FTP, S3, and SMB (OS-native mount) file systems.
pub struct VfsManager {
    mounts: Arc<RwLock<HashMap<String, VfsMount>>>,
    sftp_pool: SftpPool,
    ssh_provider: Option<Arc<dyn SshInfoProvider>>,
    ftp_pool: FtpPool,
    smb_manager: SmbMountManager,
}

impl VfsManager {
    pub fn new() -> Self {
        Self {
            mounts: Arc::new(RwLock::new(HashMap::new())),
            sftp_pool: SftpPool::new(),
            ssh_provider: None,
            ftp_pool: FtpPool::new(),
            smb_manager: SmbMountManager::new(),
        }
    }

    /// Create a VfsManager with an SSH info provider for SFTP support.
    pub fn with_ssh_provider(provider: Arc<dyn SshInfoProvider>) -> Self {
        Self {
            mounts: Arc::new(RwLock::new(HashMap::new())),
            sftp_pool: SftpPool::new(),
            ssh_provider: Some(provider),
            ftp_pool: FtpPool::new(),
            smb_manager: SmbMountManager::new(),
        }
    }

    /// Get or create an SFTP session for a mount.
    /// Prefers `connection_id` if Some; falls back to parsing credentials from `root` URI.
    async fn get_sftp_for_mount(
        &self,
        mount: &VfsMount,
    ) -> Result<Arc<russh_sftp::client::SftpSession>, String> {
        if let Some(conn_id) = mount.connection_id.as_deref() {
            // Use the external SSH provider
            let provider = self
                .ssh_provider
                .as_deref()
                .ok_or_else(|| "SSH provider not configured".to_string())?;
            return self.sftp_pool.get_or_connect(conn_id, provider).await;
        }
        // Fall back to URL-based credentials stored in mount.root
        let (conn_info, _root) = crate::sftp::SshConnInfo::parse_sftp_url(&mount.root)?;
        let provider = InlineSftpProvider(conn_info);
        self.sftp_pool
            .get_or_connect(&mount.id, &provider)
            .await
    }

    /// Determine the SFTP remote root: if connection_id is set the root is in mount.root;
    /// if URL-based, the root path is embedded in the URL.
    fn sftp_root(mount: &VfsMount) -> Result<String, String> {
        if mount.connection_id.is_some() {
            return Ok(mount.root.clone());
        }
        let (_conn, path) = crate::sftp::SshConnInfo::parse_sftp_url(&mount.root)?;
        Ok(path)
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

    pub async fn update_mount(&self, id: &str, req: CreateVfsMountReq) -> Option<VfsMount> {
        let mut mounts = self.mounts.write().await;
        if let Some(mount) = mounts.get_mut(id) {
            mount.name = req.name;
            mount.kind = req.kind;
            mount.root = req.root;
            mount.connection_id = req.connection_id;
            mount.group = req.group;
            Some(mount.clone())
        } else {
            None
        }
    }

    /// Test whether a mount configuration is accessible by listing its root.
    pub async fn test_connection(&self, req: &CreateVfsMountReq) -> Result<(), String> {
        let temp_id = format!("test-conn-{}", uuid::Uuid::new_v4());
        {
            let mut mounts = self.mounts.write().await;
            mounts.insert(
                temp_id.clone(),
                VfsMount {
                    id: temp_id.clone(),
                    name: "test".to_string(),
                    kind: req.kind.clone(),
                    root: req.root.clone(),
                    connection_id: req.connection_id.clone(),
                    group: None,
                },
            );
        }
        let result = self
            .list_dir(&VfsListReq {
                mount_id: temp_id.clone(),
                path: "/".to_string(),
            })
            .await
            .map(|_| ());
        {
            let mut mounts = self.mounts.write().await;
            mounts.remove(&temp_id);
        }
        result
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
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::list_dir(&sftp, &root, &req.path).await
            }
            VfsSourceKind::Ftp => {
                crate::ftp::ftp_list_dir(&self.ftp_pool, &mount.id, &mount.root, &req.path).await
            }
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client.list_dir(&req.path).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.list_local_dir(&root_str, &req.path).await
            }
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
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::read_file(&sftp, &root, &req.path, req.max_bytes).await
            }
            VfsSourceKind::Ftp => {
                let raw = crate::ftp::ftp_read_raw(
                    &self.ftp_pool,
                    &mount.id,
                    &mount.root,
                    &req.path,
                )
                .await?;
                Ok(bytes_to_file_content(&req.path, raw, req.max_bytes))
            }
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                let raw = client.get_object(&req.path).await?;
                Ok(bytes_to_file_content(&req.path, raw, req.max_bytes))
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.read_local_file(&root_str, &req.path, req.max_bytes).await
            }
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
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::move_file(&sftp, &root, &req.src, &req.dest).await
            }
            VfsSourceKind::Ftp => {
                crate::ftp::ftp_rename(
                    &self.ftp_pool,
                    &mount.id,
                    &mount.root,
                    &req.src,
                    &req.dest,
                )
                .await
            }
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client.copy_object(&req.src, &req.dest).await?;
                client.delete_object(&req.src).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.move_local(&root_str, &req.src, &req.dest).await
            }
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
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::copy_file(&sftp, &root, &req.src, &req.dest).await
            }
            VfsSourceKind::Ftp => {
                // FTP has no native copy; read then write
                let data = crate::ftp::ftp_read_raw(
                    &self.ftp_pool,
                    &mount.id,
                    &mount.root,
                    &req.src,
                )
                .await?;
                crate::ftp::ftp_write(&self.ftp_pool, &mount.id, &mount.root, &req.dest, data)
                    .await
            }
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client.copy_object(&req.src, &req.dest).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.copy_local(&root_str, &req.src, &req.dest).await
            }
        }
    }

    /// Create a directory.
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
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::mkdir(&sftp, &root, &req.path).await
            }
            VfsSourceKind::Ftp => {
                crate::ftp::ftp_mkdir(&self.ftp_pool, &mount.id, &mount.root, &req.path).await
            }
            VfsSourceKind::S3 => {
                // S3 has no real directories; create a placeholder key
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                let dir_key = format!("{}/", req.path.trim_end_matches('/'));
                client.put_object(&dir_key, &[]).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.mkdir_local(&root_str, &req.path).await
            }
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
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::delete(&sftp, &root, &req.path).await
            }
            VfsSourceKind::Ftp => crate::ftp::ftp_delete_auto(
                &self.ftp_pool,
                &mount.id,
                &mount.root,
                &req.path,
            )
            .await,
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client.delete_object(&req.path).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.delete_local(&root_str, &req.path).await
            }
        }
    }

    /// Write text content to a file.
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
                self.write_local_file(&mount.root, &req.path, &req.content)
                    .await
            }
            VfsSourceKind::Sftp => {
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::write_file(&sftp, &root, &req.path, &req.content).await
            }
            VfsSourceKind::Ftp => {
                let data = req.content.as_bytes().to_vec();
                crate::ftp::ftp_write(&self.ftp_pool, &mount.id, &mount.root, &req.path, data)
                    .await
            }
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client.put_object(&req.path, req.content.as_bytes()).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.write_local_file(&root_str, &req.path, &req.content).await
            }
        }
    }

    /// Upload raw binary data to a file.
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
            VfsSourceKind::Local => self.upload_local_file(&mount.root, path, &data).await,
            VfsSourceKind::Sftp => {
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::upload_file(&sftp, &root, path, &data).await
            }
            VfsSourceKind::Ftp => {
                crate::ftp::ftp_write(&self.ftp_pool, &mount.id, &mount.root, path, data).await
            }
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client.put_object(path, &data).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.upload_local_file(&root_str, path, &data).await
            }
        }
    }

    /// Get metadata for a single file or directory.
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
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::stat(&sftp, &root, path).await
            }
            VfsSourceKind::Ftp => {
                crate::ftp::ftp_stat(&self.ftp_pool, &mount.id, &mount.root, path).await
            }
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client.stat(path).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.stat_local(&root_str, path).await
            }
        }
    }

    /// Search for files/directories matching a query.
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
                self.search_local(&mount.root, &req.path, &req.query, req.max_results)
                    .await
            }
            VfsSourceKind::Sftp => {
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::search(&sftp, &root, &req.path, &req.query, req.max_results)
                    .await
            }
            VfsSourceKind::Ftp => crate::ftp::ftp_search(
                &self.ftp_pool,
                &mount.id,
                &mount.root,
                &req.path,
                &req.query,
                req.max_results.unwrap_or(100),
            )
            .await,
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client
                    .search(&req.path, &req.query, req.max_results.unwrap_or(100))
                    .await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.search_local(&root_str, &req.path, &req.query, req.max_results)
                    .await
            }
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
            VfsSourceKind::Sftp => {
                let sftp = self.get_sftp_for_mount(&mount).await?;
                let root = Self::sftp_root(&mount)?;
                crate::sftp::read_file_raw(&sftp, &root, path).await
            }
            VfsSourceKind::Ftp => {
                crate::ftp::ftp_read_raw(&self.ftp_pool, &mount.id, &mount.root, path).await
            }
            VfsSourceKind::S3 => {
                let client =
                    crate::s3::S3Client::new(crate::s3::S3Config::parse(&mount.root)?);
                client.get_object(path).await
            }
            VfsSourceKind::Smb => {
                let local_root =
                    self.smb_manager.get_or_mount(&mount.id, &mount.root).await?;
                let root_str = local_root.to_string_lossy().to_string();
                self.read_local_file_raw(&root_str, path).await
            }
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

    async fn mkdir_local(&self, root: &str, rel_path: &str) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let dest = Self::resolve_local_dest(root_path, rel_path)?;
        tokio::fs::create_dir_all(&dest)
            .await
            .map_err(|e| format!("mkdir failed: {e}"))
    }

    async fn delete_local(&self, root: &str, rel_path: &str) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let target = Self::resolve_local_path(root_path, rel_path)?;
        let metadata = tokio::fs::metadata(&target)
            .await
            .map_err(|e| format!("stat failed: {e}"))?;
        if metadata.is_dir() {
            tokio::fs::remove_dir_all(&target)
                .await
                .map_err(|e| format!("rmdir failed: {e}"))
        } else {
            tokio::fs::remove_file(&target)
                .await
                .map_err(|e| format!("remove failed: {e}"))
        }
    }

    async fn write_local_file(
        &self,
        root: &str,
        rel_path: &str,
        content: &str,
    ) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let dest = Self::resolve_local_dest(root_path, rel_path)?;
        tokio::fs::write(&dest, content.as_bytes())
            .await
            .map_err(|e| format!("write failed: {e}"))
    }

    async fn upload_local_file(
        &self,
        root: &str,
        rel_path: &str,
        data: &[u8],
    ) -> Result<(), String> {
        let root_path = std::path::Path::new(root);
        let dest = Self::resolve_local_dest(root_path, rel_path)?;
        tokio::fs::write(&dest, data)
            .await
            .map_err(|e| format!("upload failed: {e}"))
    }

    async fn stat_local(&self, root: &str, rel_path: &str) -> Result<VfsNode, String> {
        let root_path = std::path::Path::new(root);
        let target = Self::resolve_local_path(root_path, rel_path)?;
        let metadata = tokio::fs::metadata(&target)
            .await
            .map_err(|e| format!("stat failed: {e}"))?;

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
            path: rel_path.to_string(),
            is_dir,
            size,
            modified,
            permissions: None,
        })
    }

    async fn search_local(
        &self,
        root: &str,
        rel_path: &str,
        query: &str,
        max_results: Option<usize>,
    ) -> Result<Vec<VfsNode>, String> {
        let root_path = std::path::Path::new(root);
        let base = if rel_path.is_empty() || rel_path == "/" {
            root_path
                .canonicalize()
                .map_err(|e| format!("Root path error: {e}"))?
        } else {
            Self::resolve_local_path(root_path, rel_path)?
        };

        let limit = max_results.unwrap_or(100);
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        let canonical_root = root_path
            .canonicalize()
            .map_err(|e| format!("Root path error: {e}"))?;

        search_local_recursive(&base, &canonical_root, &query_lower, limit, &mut results).await?;
        Ok(results)
    }
}

/// Recursively copy a directory.
async fn copy_dir_recursive(
    src: &std::path::Path,
    dest: &std::path::Path,
) -> Result<(), String> {
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

/// Recursively search local filesystem for files matching a query by name.
async fn search_local_recursive(
    dir: &std::path::Path,
    root: &std::path::Path,
    query: &str,
    limit: usize,
    results: &mut Vec<VfsNode>,
) -> Result<(), String> {
    if results.len() >= limit {
        return Ok(());
    }

    let mut read_dir = tokio::fs::read_dir(dir)
        .await
        .map_err(|e| format!("Read dir failed: {e}"))?;

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
            let modified = metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| {
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

impl Default for VfsManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert raw bytes into a `VfsFileContent` response, applying the same
/// binary-detection and max-bytes truncation logic as the local file reader.
fn bytes_to_file_content(path: &str, raw: Vec<u8>, max_bytes: Option<u64>) -> VfsFileContent {
    let file_size = raw.len() as u64;
    let limit = max_bytes.unwrap_or(1_048_576);
    let truncated = file_size > limit;
    let slice = if truncated {
        &raw[..usize::try_from(limit).unwrap_or(usize::MAX)]
    } else {
        &raw
    };
    let check_len = slice.len().min(8192);
    let is_binary = slice[..check_len].contains(&0);
    let content = if is_binary {
        format!("[Binary file, {file_size} bytes]")
    } else {
        String::from_utf8_lossy(slice).into_owned()
    };
    VfsFileContent {
        path: path.to_string(),
        size: file_size,
        content,
        is_binary,
        truncated,
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
        assert_eq!(std::fs::read_to_string(dir.path().join("b.txt")).unwrap(), "hello");
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
        assert_eq!(std::fs::read_to_string(dir.path().join("copy.txt")).unwrap(), "data");
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
