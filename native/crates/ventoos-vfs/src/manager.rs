use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use ventoos_persist::{Database, PersistedVfsMount, SettingsManager, VfsMountStore};

use crate::driver::registry::VfsDriverRegistry;
use crate::driver::{VfsDriver, VfsDriverContext};
use crate::ftp::FtpPool;
use crate::sftp::{SftpPool, SshInfoProvider};
use crate::smb::SmbClientPool;
use crate::types::{
    CreateVfsMountReq, VfsCapabilities, VfsCopyReq, VfsDeleteReq, VfsFileContent, VfsLink,
    VfsListReq, VfsMkdirReq, VfsMount, VfsMoveReq, VfsNode, VfsReadReq, VfsSearchReq,
    VfsSourceKind, VfsWriteReq, WebDavServerSettings,
};

/// Virtual file system manager.
/// Supports local, SFTP, FTP, S3, SMB (pure Rust client), and `WebDAV` file systems.
/// Uses capability-based driver dispatch instead of match-on-enum.
pub struct VfsManager {
    mounts: Arc<RwLock<HashMap<String, VfsMount>>>,
    drivers: Arc<RwLock<HashMap<String, Arc<dyn VfsDriver>>>>,
    mount_store: Option<VfsMountStore>,
    settings_mgr: Option<SettingsManager>,
    sftp_pool: SftpPool,
    ssh_provider: Option<Arc<dyn SshInfoProvider>>,
    ftp_pool: FtpPool,
    smb_pool: SmbClientPool,
    webdav_server_settings: Arc<RwLock<WebDavServerSettings>>,
    /// Path prefix → mount_id routing table for unified path lookup.
    prefix_router: Arc<RwLock<PrefixRouter>>,
}

/// Longest-prefix-match router for VFS paths.
///
/// Maps path prefixes (e.g., `/nas/photos`) to mount IDs.
/// When resolving a path like `/nas/photos/hello.txt`, the longest
/// matching prefix (`/nas/photos`) wins over a shorter match (`/nas`).
///
/// Inspired by tokimo-package-vfs StorageManager prefix routing.
struct PrefixRouter {
    entries: Vec<(String, String)>, // (prefix, mount_id), sorted by prefix length desc
}

impl PrefixRouter {
    fn new() -> Self {
        Self { entries: Vec::new() }
    }

    /// Register or update a mount's prefix.
    fn register(&mut self, mount_id: &str, prefix: &str) {
        // Remove old entry if exists
        self.entries.retain(|(_, id)| id != mount_id);
        let normalized = normalize_prefix(prefix);
        self.entries.push((normalized, mount_id.to_string()));
        // Sort by prefix length descending (longest prefix first)
        self.entries.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    }

    /// Remove a mount from the prefix router.
    fn unregister(&mut self, mount_id: &str) {
        self.entries.retain(|(_, id)| id != mount_id);
    }

    /// Find the mount ID for a path using longest prefix match.
    fn resolve(&self, path: &str) -> Option<(String, String)> {
        let normalized = normalize_prefix(path);
        for (prefix, mount_id) in &self.entries {
            if normalized == *prefix || normalized.starts_with(&format!("{prefix}/")) {
                // Return relative path within the mount
                let rel_path = if normalized.len() > prefix.len() {
                    format!("/{}", &normalized[prefix.len() + 1..])
                } else {
                    "/".to_string()
                };
                return Some((mount_id.clone(), rel_path));
            }
        }
        None
    }

    /// List all registered prefixes.
    fn all_prefixes(&self) -> Vec<(String, String)> {
        self.entries.clone()
    }
}

/// Normalize a path for prefix comparison: ensure leading `/`, no trailing `/` (unless root).
fn normalize_prefix(path: &str) -> String {
    let trimmed = path.trim().trim_start_matches('/').trim_end_matches('/');
    if trimmed.is_empty() {
        "/".to_string()
    } else {
        format!("/{trimmed}")
    }
}

/// Check if a filename is a macOS metadata/temp file that should always be hidden.
fn is_macos_junk(name: &str) -> bool {
    // ._  — Apple Double files (extended attributes / resource forks)
    // .~  — SMB spark temp files (e.g. .~lock.docx# or .~文字文稿1.docx)
    // .DS_Store — macOS folder settings
    // .TemporaryItems / .Trashes / .fseventsd / .Spotlight-V100 — macOS volume metadata
    name.starts_with("._")
        || name.starts_with(".~")
        || name == ".DS_Store"
        || name == ".TemporaryItems"
        || name == ".Trashes"
        || name == ".fseventsd"
        || name == ".Spotlight-V100"
}

impl VfsManager {
    pub fn new() -> Self {
        Self {
            mounts: Arc::new(RwLock::new(HashMap::new())),
            drivers: Arc::new(RwLock::new(HashMap::new())),
            mount_store: None,
            settings_mgr: None,
            sftp_pool: SftpPool::new(),
            ssh_provider: None,
            ftp_pool: FtpPool::new(),
            smb_pool: SmbClientPool::new(),
            webdav_server_settings: Arc::new(RwLock::new(WebDavServerSettings::default())),
            prefix_router: Arc::new(RwLock::new(PrefixRouter::new())),
        }
    }

    /// Create a `VfsManager` with an SSH info provider for SFTP support.
    pub fn with_ssh_provider(provider: Arc<dyn SshInfoProvider>) -> Self {
        Self {
            mounts: Arc::new(RwLock::new(HashMap::new())),
            drivers: Arc::new(RwLock::new(HashMap::new())),
            mount_store: None,
            settings_mgr: None,
            sftp_pool: SftpPool::new(),
            ssh_provider: Some(provider),
            ftp_pool: FtpPool::new(),
            smb_pool: SmbClientPool::new(),
            webdav_server_settings: Arc::new(RwLock::new(WebDavServerSettings::default())),
            prefix_router: Arc::new(RwLock::new(PrefixRouter::new())),
        }
    }

    /// Create a `VfsManager` with both an SSH provider and a database for mount persistence.
    pub async fn with_db_and_ssh_provider(
        db: Arc<Database>,
        provider: Arc<dyn SshInfoProvider>,
    ) -> Self {
        let store = VfsMountStore::new(Arc::clone(&db));
        let settings_mgr = SettingsManager::new(Arc::clone(&db));
        // Load persisted mounts from DB
        let mut initial_mounts = HashMap::new();
        match store.load_all() {
            Ok(rows) => {
                for row in rows {
                    let kind = row.kind.parse::<VfsSourceKind>().unwrap_or_else(|_| {
                        tracing::warn!(
                            "Unknown VFS kind '{}' for mount '{}', defaulting to local",
                            row.kind,
                            row.id
                        );
                        VfsSourceKind::Local
                    });
                    let local_mount = row
                        .mount_config
                        .as_deref()
                        .and_then(|j| serde_json::from_str(j).ok());
                    initial_mounts.insert(
                        row.id.clone(),
                        VfsMount {
                            id: row.id,
                            name: row.name,
                            kind,
                            root: row.root,
                            connection_id: row.connection_id,
                            group: row.group_name,
                            local_mount,
                        },
                    );
                }
            }
            Err(e) => tracing::error!("Failed to load VFS mounts from DB: {e}"),
        }
        // Load persisted WebDAV server settings from DB
        let webdav_settings = match settings_mgr.get("webdav_server_settings") {
            Ok(Some(json)) => serde_json::from_str::<WebDavServerSettings>(&json)
                .unwrap_or_else(|e| {
                    tracing::warn!("Failed to parse persisted WebDAV settings: {e}");
                    WebDavServerSettings::default()
                }),
            _ => WebDavServerSettings::default(),
        };
        let mgr = Self {
            mounts: Arc::new(RwLock::new(initial_mounts)),
            drivers: Arc::new(RwLock::new(HashMap::new())),
            mount_store: Some(store),
            settings_mgr: Some(settings_mgr),
            sftp_pool: SftpPool::new(),
            ssh_provider: Some(provider),
            ftp_pool: FtpPool::new(),
            smb_pool: SmbClientPool::new(),
            webdav_server_settings: Arc::new(RwLock::new(webdav_settings)),
            prefix_router: Arc::new(RwLock::new(PrefixRouter::new())),
        };
        // Re-register any SMB mounts loaded from the database
        let smb_ids: Vec<(String, String)> = {
            let m = mgr.mounts.read().await;
            m.values()
                .filter(|mount| matches!(mount.kind, VfsSourceKind::Smb))
                .map(|mount| (mount.id.clone(), mount.root.clone()))
                .collect()
        };
        for (id, root) in smb_ids {
            if let Err(e) = mgr.smb_pool.register(&id, &root).await {
                tracing::warn!("SMB pool register failed on load: {e}");
            }
        }
        // Register prefixes for all loaded mounts
        {
            let mounts = mgr.mounts.read().await;
            let mut router = mgr.prefix_router.write().await;
            for mount in mounts.values() {
                router.register(&mount.id, &format!("/{}", mount.name));
            }
        }
        // Instantiate drivers for all loaded mounts
        mgr.instantiate_all_drivers().await;
        mgr
    }

    // ─── WebDAV server settings ──────────────────────────────────────────────

    pub async fn webdav_server_settings(&self) -> WebDavServerSettings {
        self.webdav_server_settings.read().await.clone()
    }

    pub async fn update_webdav_server_settings(&self, settings: WebDavServerSettings) {
        *self.webdav_server_settings.write().await = settings.clone();
        // Persist to database
        if let Some(mgr) = &self.settings_mgr
            && let Ok(json) = serde_json::to_string(&settings)
                && let Err(e) = mgr.set("webdav_server_settings", &json) {
                    tracing::error!("Failed to persist WebDAV server settings: {e}");
                }
    }

    /// Expand `~` to the user's home directory in a path string.
    /// Only applies to paths starting with `~` or `~/`.
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

    // ─── Driver management ─────────────────────────────────────────────

    /// Build a driver context from current pool state.
    fn driver_context(&self) -> VfsDriverContext {
        VfsDriverContext {
            sftp_pool: self.sftp_pool.clone(),
            ssh_provider: self.ssh_provider.clone(),
            ftp_pool: self.ftp_pool.clone(),
            smb_pool: self.smb_pool.clone(),
            config_persister: None,
        }
    }

    /// Instantiate a driver for a mount and store it.
    async fn instantiate_driver(&self, mount: &VfsMount) {
        let ctx = self.driver_context();
        match VfsDriverRegistry::create(mount.kind.as_db_str(), mount, &ctx) {
            Ok(driver) => {
                self.drivers
                    .write()
                    .await
                    .insert(mount.id.clone(), Arc::from(driver));
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to instantiate driver for mount '{}' (kind={}): {e}",
                    mount.id,
                    mount.kind.as_db_str()
                );
            }
        }
    }

    /// Instantiate drivers for all currently loaded mounts.
    async fn instantiate_all_drivers(&self) {
        let mounts: Vec<VfsMount> = self.mounts.read().await.values().cloned().collect();
        for mount in &mounts {
            self.instantiate_driver(mount).await;
        }
    }

    /// Get the driver for a mount.
    async fn get_driver(&self, mount_id: &str) -> Result<Arc<dyn VfsDriver>, String> {
        self.drivers
            .read()
            .await
            .get(mount_id)
            .cloned()
            .ok_or_else(|| "Mount not found".to_string())
    }

    /// Query backend capabilities for a mount.
    pub async fn capabilities(&self, mount_id: &str) -> Result<VfsCapabilities, String> {
        let driver = self.get_driver(mount_id).await?;
        Ok(driver.capabilities())
    }

    /// Get a pre-signed download link for a file.
    pub async fn link(&self, mount_id: &str, path: &str) -> Result<VfsLink, String> {
        let driver = self.get_driver(mount_id).await?;
        driver
            .link(path.to_string())
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn create_mount(&self, req: CreateVfsMountReq) -> VfsMount {
        let id = uuid::Uuid::new_v4().to_string();
        let root = Self::expand_tilde(&req.root);
        let mount = VfsMount {
            id: id.clone(),
            name: req.name,
            kind: req.kind,
            root: root.clone(),
            connection_id: req.connection_id,
            group: req.group,
            local_mount: req.local_mount,
        };

        // Register SMB connections in the pool for lazy connect
        if matches!(mount.kind, VfsSourceKind::Smb)
            && let Err(e) = self.smb_pool.register(&id, &root).await {
                tracing::warn!("SMB pool register failed: {e}");
            }

        self.mounts.write().await.insert(id.clone(), mount.clone());
        // Register prefix for unified path routing (by mount name)
        self.prefix_router
            .write()
            .await
            .register(&id, &format!("/{}", mount.name));
        // Instantiate driver for the new mount
        self.instantiate_driver(&mount).await;
        // Persist to database
        if let Some(store) = &self.mount_store {
            let mount_config = mount
                .local_mount
                .as_ref()
                .and_then(|c| serde_json::to_string(c).ok());
            let record = PersistedVfsMount {
                id: mount.id.clone(),
                name: mount.name.clone(),
                kind: mount.kind.as_db_str().to_string(),
                root: mount.root.clone(),
                connection_id: mount.connection_id.clone(),
                group_name: mount.group.clone(),
                mount_config,
            };
            if let Err(e) = store.insert(&record) {
                tracing::error!("Failed to persist VFS mount '{}': {e}", mount.id);
            }
        }
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
        self.smb_pool.remove(id).await;
        self.sftp_pool.remove(id).await;
        self.ftp_pool.remove(id).await;
        self.drivers.write().await.remove(id);
        self.prefix_router.write().await.unregister(id);
        let removed = self.mounts.write().await.remove(id).is_some();
        if removed
            && let Some(store) = &self.mount_store
                && let Err(e) = store.delete(id) {
                    tracing::error!("Failed to delete VFS mount '{}' from DB: {e}", id);
                }
        removed
    }

    pub async fn update_mount(&self, id: &str, req: CreateVfsMountReq) -> Option<VfsMount> {
        let root = Self::expand_tilde(&req.root);
        // Invalidate all cached connections for this mount so next access uses new config
        self.smb_pool.remove(id).await;
        self.sftp_pool.remove(id).await;
        self.ftp_pool.remove(id).await;
        let updated = {
            let mut mounts = self.mounts.write().await;
            if let Some(mount) = mounts.get_mut(id) {
                mount.name = req.name;
                mount.kind = req.kind;
                mount.root.clone_from(&root);
                mount.connection_id = req.connection_id;
                mount.group = req.group;
                mount.local_mount = req.local_mount;

                if matches!(mount.kind, VfsSourceKind::Smb)
                    && let Err(e) = self.smb_pool.register(id, &root).await {
                        tracing::warn!("SMB pool register failed: {e}");
                    }

                Some(mount.clone())
            } else {
                None
            }
        };
        if let Some(ref mount) = updated {
            self.persist_mount_update(mount);
            // Re-register prefix (name may have changed)
            self.prefix_router
                .write()
                .await
                .register(&mount.id, &format!("/{}", mount.name));
            // Re-instantiate driver with new config
            self.instantiate_driver(mount).await;
        }
        updated
    }

    fn persist_mount_update(&self, mount: &VfsMount) {
        if let Some(store) = &self.mount_store {
            let mount_config = mount
                .local_mount
                .as_ref()
                .and_then(|c| serde_json::to_string(c).ok());
            let record = PersistedVfsMount {
                id: mount.id.clone(),
                name: mount.name.clone(),
                kind: mount.kind.as_db_str().to_string(),
                root: mount.root.clone(),
                connection_id: mount.connection_id.clone(),
                group_name: mount.group.clone(),
                mount_config,
            };
            if let Err(e) = store.update(&record) {
                tracing::error!("Failed to update VFS mount '{}' in DB: {e}", mount.id);
            }
        }
    }

    /// Test whether a mount configuration is accessible by listing its root.
    pub async fn test_connection(&self, req: &CreateVfsMountReq) -> Result<(), String> {
        let temp_id = format!("test-conn-{}", uuid::Uuid::new_v4());
        let root = Self::expand_tilde(&req.root);
        {
            let mut mounts = self.mounts.write().await;
            mounts.insert(
                temp_id.clone(),
                VfsMount {
                    id: temp_id.clone(),
                    name: "test".to_string(),
                    kind: req.kind,
                    root: root.clone(),
                    connection_id: req.connection_id.clone(),
                    group: None,
                    local_mount: None,
                },
            );
        }
        // SMB requires explicit pool registration before first use.
        // Server-root mounts are valid and will enumerate shares through srvsvc.
        if matches!(req.kind, VfsSourceKind::Smb)
            && let Err(e) = self.smb_pool.register(&temp_id, &root).await
        {
            // Clean up and return the error early.
            self.mounts.write().await.remove(&temp_id);
            return Err(format!("SMB pool register failed: {e}"));
        }
        let result = self
            .list_dir(&VfsListReq {
                mount_id: temp_id.clone(),
                path: "/".to_string(),
                show_hidden: false,
            })
            .await
            .map(|_| ());
        // Clean up temp entries
        self.mounts.write().await.remove(&temp_id);
        self.smb_pool.remove(&temp_id).await;
        self.sftp_pool.remove(&temp_id).await;
        self.ftp_pool.remove(&temp_id).await;
        result
    }

    /// List directory contents.
    pub async fn list_dir(&self, req: &VfsListReq) -> Result<Vec<VfsNode>, String> {
        let driver = self.get_driver(&req.mount_id).await?;
        let mut nodes = driver
            .list_dir(req.path.clone(), req.show_hidden)
            .await
            .map_err(|e| e.to_string())?;
        // VFS-level filter: always hide macOS metadata/temp files regardless of backend or show_hidden
        nodes.retain(|n| !is_macos_junk(&n.name));
        Ok(nodes)
    }

    /// Read file content. Returns text for small files, marks binary files.
    pub async fn read_file(&self, req: &VfsReadReq) -> Result<VfsFileContent, String> {
        let driver = self.get_driver(&req.mount_id).await?;
        let raw = driver
            .read_file_raw(req.path.clone())
            .await
            .map_err(|e| e.to_string())?;
        Ok(bytes_to_file_content(&req.path, &raw, req.max_bytes))
    }

    /// Move (rename) a file or directory within the same mount.
    pub async fn move_file(&self, req: &VfsMoveReq) -> Result<(), String> {
        let driver = self.get_driver(&req.mount_id).await?;
        let rename = driver.as_rename().ok_or("rename not supported for this backend")?;
        rename.rename(req.src.clone(), req.dest.clone()).await.map_err(|e| e.to_string())
    }

    /// Copy a file or directory within the same mount.
    pub async fn copy_file(&self, req: &VfsCopyReq) -> Result<(), String> {
        let driver = self.get_driver(&req.mount_id).await?;
        let copy = driver.as_copy().ok_or("copy not supported for this backend")?;
        copy.copy(req.src.clone(), req.dest.clone()).await.map_err(|e| e.to_string())
    }

    /// Create a directory.
    pub async fn mkdir(&self, req: &VfsMkdirReq) -> Result<(), String> {
        let driver = self.get_driver(&req.mount_id).await?;
        let mkdir = driver.as_mkdir().ok_or("mkdir not supported for this backend")?;
        mkdir.mkdir(req.path.clone()).await.map_err(|e| e.to_string())
    }

    /// Delete a file or directory.
    pub async fn delete(&self, req: &VfsDeleteReq) -> Result<(), String> {
        let driver = self.get_driver(&req.mount_id).await?;
        // Try delete_file first, fall back to delete_dir
        let stat = driver.stat(req.path.clone()).await.map_err(|e| e.to_string())?;
        if stat.is_dir {
            let dd = driver.as_delete_dir().ok_or("delete_dir not supported for this backend")?;
            dd.delete_dir(req.path.clone()).await.map_err(|e| e.to_string())
        } else {
            let df = driver.as_delete_file().ok_or("delete_file not supported for this backend")?;
            df.delete_file(req.path.clone()).await.map_err(|e| e.to_string())
        }
    }

    /// Write text content to a file.
    pub async fn write_file(&self, req: &VfsWriteReq) -> Result<(), String> {
        let driver = self.get_driver(&req.mount_id).await?;
        let put = driver.as_put().ok_or("write not supported for this backend")?;
        put.put(req.path.clone(), req.content.as_bytes().to_vec())
            .await
            .map_err(|e| e.to_string())
    }

    /// Upload raw binary data to a file.
    pub async fn upload_file(&self, mount_id: &str, path: &str, data: Vec<u8>) -> Result<(), String> {
        let driver = self.get_driver(mount_id).await?;
        let put = driver.as_put().ok_or("upload not supported for this backend")?;
        put.put(path.to_string(), data).await.map_err(|e| e.to_string())
    }

    /// Get metadata for a single file or directory.
    pub async fn stat(&self, mount_id: &str, path: &str) -> Result<VfsNode, String> {
        let driver = self.get_driver(mount_id).await?;
        driver.stat(path.to_string()).await.map_err(|e| e.to_string())
    }

    /// Search for files/directories matching a query.
    pub async fn search(&self, req: &VfsSearchReq) -> Result<Vec<VfsNode>, String> {
        let driver = self.get_driver(&req.mount_id).await?;
        let search = driver.as_search().ok_or("search not supported for this backend")?;
        search
            .search(req.path.clone(), req.query.clone(), req.max_results.unwrap_or(100))
            .await
            .map_err(|e| e.to_string())
    }

    /// Change file permissions.
    pub async fn chmod(&self, mount_id: &str, path: &str, mode: u32) -> Result<(), String> {
        let driver = self.get_driver(mount_id).await?;
        let chmod = driver.as_chmod().ok_or_else(|| format!("chmod not supported for {} backend", driver.driver_name()))?;
        chmod.chmod(path.to_string(), mode).await.map_err(|e| e.to_string())
    }

    /// Create an archive from files within a mount.
    /// For local mounts, operates directly on the filesystem.
    /// For remote mounts, downloads files to a temp dir, creates archive, then uploads.
    pub async fn create_archive(
        &self,
        mount_id: &str,
        req: &crate::archive::ArchiveRequest,
    ) -> Result<(), String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => {
                let root = std::path::Path::new(&mount.root);
                let dest = Self::resolve_local_dest(root, &req.dest)?;
                // Run blocking archive operation in spawn_blocking
                let root_owned = mount.root.clone();
                let paths = req.paths.clone();
                let format = req.format;
                let password = req.password.clone();
                tokio::task::spawn_blocking(move || {
                    let root_path = std::path::Path::new(&root_owned);
                    match format {
                        crate::archive::ArchiveFormat::TarGz => {
                            crate::archive::create_tar_gz(root_path, &paths, &dest)
                        }
                        crate::archive::ArchiveFormat::Zip => crate::archive::create_zip(
                            root_path,
                            &paths,
                            &dest,
                            password.as_deref(),
                        ),
                        crate::archive::ArchiveFormat::SevenZ => crate::archive::create_sevenz(
                            root_path,
                            &paths,
                            &dest,
                            password.as_deref(),
                        ),
                        crate::archive::ArchiveFormat::Rar => {
                            Err("Creating RAR archives is not supported. Use zip or 7z instead.".to_string())
                        }
                    }
                })
                .await
                .map_err(|e| format!("Archive task failed: {e}"))?
            }
            _ => {
                // Remote mount: download files → create archive locally → upload result
                self.create_archive_remote(mount_id, &mount, req).await
            }
        }
    }

    /// Create archive for remote mounts by downloading to temp, archiving, and uploading.
    async fn create_archive_remote(
        &self,
        mount_id: &str,
        mount: &VfsMount,
        req: &crate::archive::ArchiveRequest,
    ) -> Result<(), String> {
        let temp_dir =
            tempfile::TempDir::new().map_err(|e| format!("Failed to create temp dir: {e}"))?;
        let temp_root = temp_dir.path().to_path_buf();

        // Download all source files/dirs to temp
        for rel_path in &req.paths {
            self.download_recursive(mount_id, mount, rel_path, &temp_root)
                .await?;
        }

        // Create archive in temp
        let archive_name = std::path::Path::new(&req.dest)
            .file_name()
            .ok_or("Invalid archive destination")?
            .to_string_lossy()
            .to_string();
        let temp_archive = temp_root.join(&archive_name);
        let paths = req.paths.clone();
        let format = req.format;
        let password = req.password.clone();
        let temp_root_clone = temp_root.clone();
        let temp_archive_clone = temp_archive.clone();
        tokio::task::spawn_blocking(move || match format {
            crate::archive::ArchiveFormat::TarGz => {
                crate::archive::create_tar_gz(&temp_root_clone, &paths, &temp_archive_clone)
            }
            crate::archive::ArchiveFormat::Zip => crate::archive::create_zip(
                &temp_root_clone,
                &paths,
                &temp_archive_clone,
                password.as_deref(),
            ),
            crate::archive::ArchiveFormat::SevenZ => crate::archive::create_sevenz(
                &temp_root_clone,
                &paths,
                &temp_archive_clone,
                password.as_deref(),
            ),
            crate::archive::ArchiveFormat::Rar => {
                Err("Creating RAR archives is not supported. Use zip or 7z instead.".to_string())
            }
        })
        .await
        .map_err(|e| format!("Archive task failed: {e}"))??;

        // Upload the archive to remote mount
        let archive_data = tokio::fs::read(&temp_archive)
            .await
            .map_err(|e| format!("Failed to read temp archive: {e}"))?;
        self.upload_file(mount_id, &req.dest, archive_data).await?;

        // Temp dir is automatically cleaned up when dropped
        Ok(())
    }

    /// Recursively download a file or directory from a remote mount to a local temp path.
    async fn download_recursive(
        &self,
        mount_id: &str,
        mount: &VfsMount,
        rel_path: &str,
        temp_root: &std::path::Path,
    ) -> Result<(), String> {
        // List the path to determine if it's a file or directory
        // Try listing the path as directory first
        let list_req = VfsListReq {
            mount_id: mount_id.to_string(),
            path: format!("/{}", rel_path.trim_start_matches('/')),
            show_hidden: true,
        };
        let children = self.list_dir(&list_req).await;

        match children {
            Ok(nodes) if !nodes.is_empty() => {
                // It's a directory — recurse into children
                let dir_local = temp_root.join(rel_path.trim_start_matches('/'));
                tokio::fs::create_dir_all(&dir_local)
                    .await
                    .map_err(|e| format!("Failed to create temp dir: {e}"))?;

                for node in nodes {
                    let child_path = format!("{}/{}", rel_path.trim_end_matches('/'), node.name);
                    // Box::pin the future to allow recursion in async
                    Box::pin(self.download_recursive(mount_id, mount, &child_path, temp_root))
                        .await?;
                }
                Ok(())
            }
            _ => {
                // It's a file (or listing failed) — download it
                let data = self
                    .read_file_raw(mount_id, &format!("/{}", rel_path.trim_start_matches('/')))
                    .await?;
                let local_path = temp_root.join(rel_path.trim_start_matches('/'));
                if let Some(parent) = local_path.parent() {
                    tokio::fs::create_dir_all(parent)
                        .await
                        .map_err(|e| format!("Failed to create parent dir: {e}"))?;
                }
                tokio::fs::write(&local_path, &data)
                    .await
                    .map_err(|e| format!("Failed to write temp file: {e}"))?;
                Ok(())
            }
        }
    }

    /// Extract an archive within a mount.
    /// For local mounts, operates directly on the filesystem.
    /// For remote mounts, downloads archive to temp, extracts, then uploads files.
    pub async fn extract_archive(
        &self,
        mount_id: &str,
        req: &crate::archive::ExtractRequest,
    ) -> Result<(), String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        match mount.kind {
            VfsSourceKind::Local => {
                let root = std::path::Path::new(&mount.root);
                let archive_path = Self::resolve_local_path(root, &req.archive_path)?;
                let dest_dir = Self::resolve_local_dest(root, &req.dest_dir)?;
                let format = crate::archive::ArchiveFormat::from_path(&req.archive_path)
                    .ok_or("Unknown archive format")?;
                let password = req.password.clone();
                tokio::task::spawn_blocking(move || match format {
                    crate::archive::ArchiveFormat::TarGz => {
                        crate::archive::extract_tar_gz(&archive_path, &dest_dir)
                    }
                    crate::archive::ArchiveFormat::Zip => {
                        crate::archive::extract_zip(&archive_path, &dest_dir, password.as_deref())
                    }
                    crate::archive::ArchiveFormat::SevenZ => crate::archive::extract_sevenz(
                        &archive_path,
                        &dest_dir,
                        password.as_deref(),
                    ),
                    crate::archive::ArchiveFormat::Rar => crate::archive::extract_rar(
                        &archive_path,
                        &dest_dir,
                        password.as_deref(),
                    ),
                })
                .await
                .map_err(|e| format!("Extract task failed: {e}"))?
            }
            _ => {
                // Remote mount: download archive → extract locally → upload files
                self.extract_archive_remote(mount_id, &mount, req).await
            }
        }
    }

    /// Extract archive for remote mounts by downloading, extracting locally, and uploading.
    async fn extract_archive_remote(
        &self,
        mount_id: &str,
        _mount: &VfsMount,
        req: &crate::archive::ExtractRequest,
    ) -> Result<(), String> {
        let temp_dir =
            tempfile::TempDir::new().map_err(|e| format!("Failed to create temp dir: {e}"))?;
        let temp_root = temp_dir.path().to_path_buf();

        // Download the archive file
        let archive_data = self.read_file_raw(mount_id, &req.archive_path).await?;
        let temp_archive = temp_root.join("archive_file");
        tokio::fs::write(&temp_archive, &archive_data)
            .await
            .map_err(|e: std::io::Error| format!("Failed to write temp archive: {e}"))?;

        // Extract locally
        let temp_extract = temp_root.join("extracted");
        tokio::fs::create_dir_all(&temp_extract)
            .await
            .map_err(|e: std::io::Error| format!("Failed to create extract dir: {e}"))?;

        let format = crate::archive::ArchiveFormat::from_path(&req.archive_path)
            .ok_or("Unknown archive format")?;
        let password = req.password.clone();
        let temp_archive_clone = temp_archive.clone();
        let temp_extract_clone = temp_extract.clone();
        tokio::task::spawn_blocking(move || match format {
            crate::archive::ArchiveFormat::TarGz => {
                crate::archive::extract_tar_gz(&temp_archive_clone, &temp_extract_clone)
            }
            crate::archive::ArchiveFormat::Zip => crate::archive::extract_zip(
                &temp_archive_clone,
                &temp_extract_clone,
                password.as_deref(),
            ),
            crate::archive::ArchiveFormat::SevenZ => crate::archive::extract_sevenz(
                &temp_archive_clone,
                &temp_extract_clone,
                password.as_deref(),
            ),
            crate::archive::ArchiveFormat::Rar => crate::archive::extract_rar(
                &temp_archive_clone,
                &temp_extract_clone,
                password.as_deref(),
            ),
        })
        .await
        .map_err(|e| format!("Extract task failed: {e}"))??;

        // Upload all extracted files to the remote mount
        self.upload_dir_recursive(mount_id, &temp_extract, &req.dest_dir)
            .await?;

        Ok(())
    }

    /// Recursively upload a local directory to a remote mount.
    async fn upload_dir_recursive(
        &self,
        mount_id: &str,
        local_dir: &std::path::Path,
        remote_base: &str,
    ) -> Result<(), String> {
        let mut entries = tokio::fs::read_dir(local_dir)
            .await
            .map_err(|e| format!("Failed to read dir: {e}"))?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| format!("Read dir error: {e}"))?
        {
            let file_type = entry
                .file_type()
                .await
                .map_err(|e| format!("File type error: {e}"))?;
            let name = entry.file_name().to_string_lossy().to_string();
            let remote_path = format!("{}/{}", remote_base.trim_end_matches('/'), name);

            if file_type.is_dir() {
                // Create remote directory
                let mkdir_req = VfsMkdirReq {
                    mount_id: mount_id.to_string(),
                    path: remote_path.clone(),
                };
                let _ = self.mkdir(&mkdir_req).await; // Ignore "already exists"
                Box::pin(self.upload_dir_recursive(mount_id, &entry.path(), &remote_path)).await?;
            } else {
                let data = tokio::fs::read(entry.path())
                    .await
                    .map_err(|e| format!("Failed to read file: {e}"))?;
                self.upload_file(mount_id, &remote_path, data).await?;
            }
        }
        Ok(())
    }

    /// List contents of an archive file within a mount.
    /// For remote mounts, downloads the archive to a temp file first.
    pub async fn list_archive_contents(
        &self,
        mount_id: &str,
        path: &str,
        password: Option<String>,
    ) -> Result<crate::archive::ArchiveListResult, String> {
        let mount = self
            .mounts
            .read()
            .await
            .get(mount_id)
            .cloned()
            .ok_or("Mount not found")?;

        if mount.kind == VfsSourceKind::Local {
            let root = std::path::Path::new(&mount.root);
            let archive_path = Self::resolve_local_path(root, path)?;
            tokio::task::spawn_blocking(move || {
                crate::archive::list_archive(&archive_path, password.as_deref())
            })
            .await
            .map_err(|e| format!("List archive task failed: {e}"))?
        } else {
            // Remote mount: download archive to temp, then list
            let data = self.read_file_raw(mount_id, path).await?;
            let temp_dir =
                tempfile::TempDir::new().map_err(|e| format!("Failed to create temp dir: {e}"))?;
            let temp_file = temp_dir
                .path()
                .join(std::path::Path::new(path).file_name().unwrap_or_default());
            tokio::fs::write(&temp_file, &data)
                .await
                .map_err(|e: std::io::Error| format!("Failed to write temp file: {e}"))?;

            tokio::task::spawn_blocking(move || {
                crate::archive::list_archive(&temp_file, password.as_deref())
            })
            .await
            .map_err(|e| format!("List archive task failed: {e}"))?
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

    // ─── Prefix routing ───────────────────────────────────────────────────

    /// Resolve a unified VFS path to a (mount_id, relative_path) pair.
    ///
    /// Uses longest-prefix matching against registered mount names.
    /// Example: `vfs://my_sftp/home/file.txt` → (`<mount_id>`, `/home/file.txt`)
    pub async fn resolve_mount_by_path(&self, path: &str) -> Result<(String, String), String> {
        let router = self.prefix_router.read().await;
        router
            .resolve(path)
            .ok_or_else(|| format!("No mount found for path: {path}"))
    }

    /// List all registered prefix → mount_id mappings.
    pub async fn list_prefixes(&self) -> Vec<(String, String)> {
        let router = self.prefix_router.read().await;
        router.all_prefixes()
    }

    /// Read raw file bytes for download / image preview.
    pub async fn read_file_raw(&self, mount_id: &str, path: &str) -> Result<Vec<u8>, String> {
        let driver = self.get_driver(mount_id).await?;
        driver.read_file_raw(path.to_string()).await.map_err(|e| e.to_string())
    }

}

impl Default for VfsManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert raw bytes into a `VfsFileContent` response, applying the same
/// binary-detection and max-bytes truncation logic as the local file reader.
fn bytes_to_file_content(path: &str, raw: &[u8], max_bytes: Option<u64>) -> VfsFileContent {
    let file_size = raw.len() as u64;
    let limit = max_bytes.unwrap_or(1_048_576);
    let truncated = file_size > limit;
    let slice = if truncated {
        &raw[..usize::try_from(limit).unwrap_or(usize::MAX)]
    } else {
        raw
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
                    local_mount: None,
                }
)
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
                    local_mount: None,
                }
)
            .await;
        // Should be able to list /tmp without error
        let result = mgr
            .list_dir(&VfsListReq {
                mount_id: mount.id,
                path: "/".into(),
                show_hidden: false,
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
                    local_mount: None,
                }
)
            .await;
        let result = mgr
            .list_dir(&VfsListReq {
                mount_id: mount.id,
                path: "/../etc".into(),
                show_hidden: false,
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
                    local_mount: None,
                }
)
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
                    local_mount: None,
                }
)
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
                    local_mount: None,
                }
)
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
                    local_mount: None,
                }
)
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
