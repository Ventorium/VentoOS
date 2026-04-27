//! `LocalMountManager` — manages the lifecycle of FUSE and FileProvider mounts
//! for VFS sources.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use ventoos_vfs::VfsManager;
use ventoos_vfs::types::{LocalMountConfig, MountBackend};

use crate::types::{FileProviderAvailability, MountError, MountStatus};
use crate::validate::{expand_home, validate_mount_path};

/// Handle to an active FUSE mount task.
pub(crate) struct MountHandle {
    /// The expanded mount point path.
    mount_point: String,
    /// Abort handle for the spawned FUSE task.
    #[allow(dead_code)]
    abort: tokio::task::AbortHandle,
}

/// Manages local FUSE / FileProvider mounts for VFS sources.
pub struct LocalMountManager {
    /// Map of mount_id → (status, optional handle).
    state: Arc<RwLock<HashMap<String, MountState>>>,
}

pub(crate) enum MountState {
    Mounted(MountHandle),
    /// Mount managed by the macOS FileProvider extension.
    MountedFileProvider { display_name: String },
    /// Mount managed by macOS `mount_webdav` pointed at our built-in WebDAV server.
    MountedWebDav { mount_point: String },
    Error(String),
}

impl Default for LocalMountManager {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalMountManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Check whether the platform FUSE dependency is installed.
    pub fn is_fuse_available() -> bool {
        #[cfg(target_os = "macos")]
        {
            std::path::Path::new("/Library/Filesystems/macfuse.fs").exists()
                || std::path::Path::new("/Library/Filesystems/fuse-t.fs").exists()
                || std::process::Command::new("pkgutil")
                    .args(["--pkg-info", "io.macfuse.installer.components.core"])
                    .status()
                    .is_ok_and(|s| s.success())
        }
        #[cfg(target_os = "linux")]
        {
            std::path::Path::new("/usr/lib/x86_64-linux-gnu/libfuse3.so").exists()
                || std::path::Path::new("/usr/lib/libfuse3.so").exists()
                || std::path::Path::new("/usr/lib64/libfuse3.so").exists()
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        {
            false
        }
    }

    /// Check whether the macOS FileProvider extension is available.
    pub fn is_fileprovider_available() -> bool {
        Self::fileprovider_availability().available
    }

    /// Return structured diagnostics for the macOS FileProvider backend.
    pub fn fileprovider_availability() -> FileProviderAvailability {
        #[cfg(target_os = "macos")]
        {
            crate::fileprovider_impl::diagnostics()
        }
        #[cfg(not(target_os = "macos"))]
        {
            FileProviderAvailability {
                available: false,
                probe_succeeded: Some(false),
                macos_version: None,
                app_path: String::new(),
                helper_path: String::new(),
                plugin_bundle_id: "io.ventoos.VentoFS.FileProvider".to_string(),
                app_installed: false,
                helper_binary_exists: false,
                plugin_registered: false,
                reason: Some("FileProvider 仅支持 macOS 12+".to_string()),
                details: vec!["当前平台不是 macOS，无法使用 FileProvider 挂载".to_string()],
            }
        }
    }

    /// Run a deeper health-check that verifies FileProvider domain registration works.
    pub async fn fileprovider_healthcheck() -> FileProviderAvailability {
        #[cfg(target_os = "macos")]
        {
            let mut diagnostics = crate::fileprovider_impl::diagnostics();
            if !diagnostics.available {
                diagnostics.probe_succeeded = Some(false);
                return diagnostics;
            }

            match crate::fileprovider_impl::probe_registration().await {
                Ok(()) => {
                    diagnostics.probe_succeeded = Some(true);
                    diagnostics
                }
                Err(error) => {
                    diagnostics.available = false;
                    diagnostics.probe_succeeded = Some(false);
                    diagnostics.reason = Some("FileProvider 注册探针失败".to_string());
                    diagnostics
                        .details
                        .push(format!("注册探针失败：{error}"));
                    diagnostics
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            Self::fileprovider_availability()
        }
    }

    /// Mount the given VFS source at the configured local path.
    pub async fn mount(
        &self,
        mount_id: &str,
        mount_name: &str,
        config: &LocalMountConfig,
        vfs: Arc<VfsManager>,
    ) -> Result<(), MountError> {
        if !config.enabled {
            return Ok(());
        }

        match config.backend {
            MountBackend::FileProvider => {
                self.mount_fileprovider(mount_id, mount_name).await
            }
            MountBackend::Fuse => {
                self.mount_fuse(mount_id, mount_name, config, vfs).await
            }
            MountBackend::WebDav => {
                self.mount_webdav_server(mount_id, mount_name, config).await
            }
        }
    }

    /// Mount using the FUSE backend (macFUSE / libfuse3).
    async fn mount_fuse(
        &self,
        mount_id: &str,
        mount_name: &str,
        config: &LocalMountConfig,
        vfs: Arc<VfsManager>,
    ) -> Result<(), MountError> {
        // Check FUSE availability before attempting mount.
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        if !Self::is_fuse_available() {
            return Err(MountError::Fuse(
                #[cfg(target_os = "macos")]
                "macFUSE 未安装，请先安装 macFUSE 后重试".to_string(),
                #[cfg(target_os = "linux")]
                "libfuse3 未安装，请先安装 libfuse3 后重试".to_string(),
            ));
        }

        // Validate and expand path.
        validate_mount_path(&config.mount_point).map_err(MountError::PathError)?;
        let mount_point = expand_home(&config.mount_point);

        // Ensure mount point directory exists.
        tokio::fs::create_dir_all(&mount_point).await?;

        // Clean up any stale mount at the same point.
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        crate::fuse_impl::force_unmount(&mount_point);

        let mount_id_owned = mount_id.to_string();
        let name_owned = mount_name.to_string();
        let mp_clone = mount_point.clone();
        let state_ref = Arc::clone(&self.state);

        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

            let task = tokio::task::spawn(crate::fuse_impl::run_fuse_mount(
                mount_id_owned.clone(),
                name_owned,
                mp_clone.clone(),
                Arc::clone(&vfs),
                Arc::clone(&state_ref),
                tx,
            ));

            // Wait for the FUSE init callback or mount failure (with timeout).
            let mount_result = tokio::time::timeout(std::time::Duration::from_secs(15), rx).await;

            match mount_result {
                Ok(Ok(Ok(()))) => {
                    // FUSE init succeeded — mount is live.
                    let abort = task.abort_handle();
                    self.state.write().await.insert(
                        mount_id_owned,
                        MountState::Mounted(MountHandle {
                            mount_point: mp_clone,
                            abort,
                        }),
                    );
                    Ok(())
                }
                Ok(Ok(Err(e))) => {
                    // FUSE mount failed with an error message.
                    tracing::error!("FUSE mount for {mount_id_owned} failed: {e}");
                    let _ = tokio::fs::remove_dir(&mp_clone).await;
                    Err(MountError::Fuse(e))
                }
                Ok(Err(_)) => {
                    // oneshot sender dropped without sending — mount task panicked.
                    let err = "FUSE mount task terminated unexpectedly".to_string();
                    tracing::error!("FUSE mount for {mount_id_owned}: {err}");
                    let _ = tokio::fs::remove_dir(&mp_clone).await;
                    Err(MountError::Fuse(err))
                }
                Err(_) => {
                    // Timeout — mount didn't complete in time.
                    task.abort();
                    tracing::error!("FUSE mount for {mount_id_owned} timed out");
                    let _ = tokio::fs::remove_dir(&mp_clone).await;
                    Err(MountError::Fuse(
                        "FUSE mount timed out after 15 seconds".to_string(),
                    ))
                }
            }
        }

        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        {
            let _ = (vfs, state_ref, mp_clone, mount_id_owned, name_owned);
            Err(MountError::Unsupported)
        }
    }

    /// Mount using the macOS FileProvider backend.
    async fn mount_fileprovider(
        &self,
        mount_id: &str,
        mount_name: &str,
    ) -> Result<(), MountError> {
        #[cfg(target_os = "macos")]
        {
            // Auto-download and install VentoFS.app if it is missing.
            crate::fileprovider_impl::ensure_extension_installed().await?;

            let diagnostics = Self::fileprovider_availability();
            if !diagnostics.available {
                return Err(MountError::FileProvider(
                    diagnostics.reason.unwrap_or_else(|| {
                        "FileProvider 当前不可用，请检查 VentoFS 扩展安装状态".to_string()
                    }),
                ));
            }

            crate::fileprovider_impl::register_domain(mount_id, mount_name).await?;
            if let Err(error) = crate::fileprovider_impl::probe_domain_access(mount_name).await {
                let _ = crate::fileprovider_impl::unregister_domain(mount_id).await;
                return Err(MountError::FileProvider(error));
            }

            self.state.write().await.insert(
                mount_id.to_string(),
                MountState::MountedFileProvider {
                    display_name: mount_name.to_string(),
                },
            );
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (mount_id, mount_name);
            Err(MountError::FileProvider(
                "FileProvider is only supported on macOS".to_string(),
            ))
        }
    }

    /// Mount using the built-in VentoOS WebDAV server (macOS).
    ///
    /// Strategy (tried in order):
    /// 1. `mount_webdav -S` — mounts at user-configured path (works on macOS ≤14)
    /// 2. `osascript` Finder mount volume + symlink — fallback for macOS 15+
    ///    (mount_webdav was tightened/broken on macOS 15, exit 22 "接口")
    async fn mount_webdav_server(
        &self,
        mount_id: &str,
        mount_name: &str,
        config: &LocalMountConfig,
    ) -> Result<(), MountError> {
        #[cfg(target_os = "macos")]
        {
            use crate::validate::expand_home;
            let mount_point = expand_home(&config.mount_point);
            let webdav_url = format!("http://localhost:5454/dav/{mount_id}/");

            // Strategy 1: try mount_webdav -S (mounts at user-configured path)
            // Create mount point directory first (mount_webdav needs it to exist).
            std::fs::create_dir_all(&mount_point).map_err(|e| {
                MountError::WebDav(format!("无法创建挂载目录 {mount_point}: {e}"))
            })?;

            let mount_webdav_result = tokio::process::Command::new("mount_webdav")
                .args(["-S", &webdav_url, &mount_point])
                .output()
                .await;

            match mount_webdav_result {
                Ok(output) if output.status.success() => {
                    self.state.write().await.insert(
                        mount_id.to_string(),
                        MountState::MountedWebDav {
                            mount_point: mount_point.clone(),
                        },
                    );
                    tracing::info!("WebDAV mounted '{mount_name}' at '{mount_point}' via mount_webdav");
                    return Ok(());
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    tracing::warn!(
                        "mount_webdav failed (exit {}), falling back to Finder: {stderr}",
                        output.status.code().unwrap_or(-1)
                    );
                }
                Err(e) => {
                    tracing::warn!("mount_webdav not available, falling back to Finder: {e}");
                }
            }

            // Strategy 2: fallback — use osascript to mount via Finder.
            // Finder mounts to /Volumes/<mount_name>, then we create a symlink
            // at the user-configured mount_point pointing to /Volumes/<mount_name>.
            //
            // Before creating the symlink, remove any existing directory or stale
            // symlink at mount_point (it was created by create_dir_all above, but
            // we need a symlink here, not a directory).
            let _ = std::fs::remove_dir_all(&mount_point);
            let _ = std::fs::remove_file(&mount_point);

            let script = format!(
                "tell application \"Finder\" to mount volume \"{webdav_url}\""
            );

            let osa_output = tokio::process::Command::new("osascript")
                .args(["-e", &script])
                .output()
                .await
                .map_err(|e| MountError::WebDav(format!("无法执行 osascript: {e}")))?;

            if !osa_output.status.success() {
                let stderr = String::from_utf8_lossy(&osa_output.stderr);
                return Err(MountError::WebDav(format!(
                    "Finder 挂载 WebDAV 失败: {stderr}"
                )));
            }

            // Finder mounts to /Volumes/<name>
            let finder_mount = format!("/Volumes/{}", mount_name);

            // Create symlink at mount_point → /Volumes/<name>
            let mp = mount_point.clone();
            let fm = finder_mount.clone();
            tokio::task::spawn_blocking(move || {
                std::os::unix::fs::symlink(&fm, &mp)
                    .map_err(|e| format!("创建符号链接失败 {mp} → {fm}: {e}"))
            })
            .await
            .map_err(|e| MountError::WebDav(format!("symlink task failed: {e}")))?
            .map_err(MountError::WebDav)?;

            self.state.write().await.insert(
                mount_id.to_string(),
                MountState::MountedWebDav {
                    mount_point: mount_point.clone(),
                },
            );
            tracing::info!(
                "WebDAV mounted '{mount_name}' via Finder at '{finder_mount}', symlinked to '{mount_point}'"
            );
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (mount_id, mount_name, config);
            Err(MountError::Unsupported)
        }
    }

    /// Unmount the VFS source identified by `mount_id`.
    pub async fn unmount(&self, mount_id: &str) -> Result<(), MountError> {
        let handle = {
            let mut state = self.state.write().await;
            state.remove(mount_id)
        };

        match handle {
            Some(MountState::Mounted(h)) => {
                h.abort.abort();
                // Platform-level unmount call to clean up FUSE
                #[cfg(any(target_os = "linux", target_os = "macos"))]
                crate::fuse_impl::force_unmount(&h.mount_point);
                Ok(())
            }
            Some(MountState::MountedFileProvider { .. }) => {
                #[cfg(target_os = "macos")]
                {
                    crate::fileprovider_impl::unregister_domain(mount_id).await?;
                }
                Ok(())
            }
            Some(MountState::MountedWebDav { mount_point }) => {
                // Use `umount` (or `diskutil unmount`) to detach the WebDAV volume,
                // then clean up the symlink if one exists.
                #[cfg(target_os = "macos")]
                {
                    // Check if mount_point is a symlink (Finder mount fallback)
                    let mp = mount_point.clone();
                    let is_symlink = tokio::task::spawn_blocking(move || {
                        std::fs::read_link(&mp).ok()
                    })
                    .await
                    .unwrap_or(None);
                    if let Some(target) = is_symlink {
                        // Symlink → unmount the target first, then remove symlink
                        let _ = tokio::process::Command::new("diskutil")
                            .args(["unmount", target.to_str().unwrap_or_default()])
                            .output()
                            .await;
                        let _ = tokio::fs::remove_file(&mount_point).await;
                    } else {
                        // Direct mount_webdav mount
                        let _ = tokio::process::Command::new("diskutil")
                            .args(["unmount", &mount_point])
                            .output()
                            .await;
                    }
                }
                Ok(())
            }
            Some(MountState::Error(_)) | None => Ok(()),
        }
    }

    /// Query the current mount status of a VFS source.
    pub async fn status(&self, mount_id: &str) -> MountStatus {
        let state = self.state.read().await;
        match state.get(mount_id) {
            Some(MountState::Mounted(h)) => MountStatus::Mounted {
                mount_point: h.mount_point.clone(),
            },
            Some(MountState::MountedFileProvider { display_name }) => MountStatus::Mounted {
                mount_point: format!("FileProvider:{display_name}"),
            },
            Some(MountState::MountedWebDav { mount_point }) => MountStatus::Mounted {
                mount_point: mount_point.clone(),
            },
            Some(MountState::Error(e)) => MountStatus::Error { error: e.clone() },
            None => MountStatus::Unmounted,
        }
    }

    /// Query mount status, falling back to real platform checks for FileProvider
    /// when the in-memory state is empty (e.g. after a server restart).
    pub async fn status_with_config(
        &self,
        mount_id: &str,
        mount_name: &str,
        config: Option<&LocalMountConfig>,
    ) -> MountStatus {
        let in_memory = self.status(mount_id).await;
        if !matches!(in_memory, MountStatus::Unmounted) {
            return in_memory;
        }

        // In-memory state is empty — check if the platform actually has a live mount.
        if let Some(cfg) = config {
            match cfg.backend {
                MountBackend::FileProvider => {
                    #[cfg(target_os = "macos")]
                    {
                        if let Ok(true) = crate::fileprovider_impl::domain_status(mount_id).await {
                            // Domain is registered at macOS level but not tracked in memory.
                            // Re-register in memory so future calls are fast.
                            self.state.write().await.insert(
                                mount_id.to_string(),
                                MountState::MountedFileProvider {
                                    display_name: mount_name.to_string(),
                                },
                            );
                            return MountStatus::Mounted {
                                mount_point: format!("FileProvider:{mount_name}"),
                            };
                        }
                    }
                }
                MountBackend::WebDav => {
                    // Check if the mount point directory is actually a WebDAV mount.
                    #[cfg(target_os = "macos")]
                    {
                        let mp = crate::validate::expand_home(&cfg.mount_point);
                        if std::path::Path::new(&mp).exists() {
                            // Check if it's actually mounted via mount_webdav
                            if let Ok(output) = std::process::Command::new("mount")
                                .output()
                            {
                                let stdout = String::from_utf8_lossy(&output.stdout);
                                if stdout.contains(&mp) {
                                    self.state.write().await.insert(
                                        mount_id.to_string(),
                                        MountState::MountedWebDav {
                                            mount_point: mp.clone(),
                                        },
                                    );
                                    return MountStatus::Mounted {
                                        mount_point: mp,
                                    };
                                }
                            }
                        }
                    }
                }
                MountBackend::Fuse => {
                    // FUSE mounts don't survive process restart — nothing to recover.
                }
            }
        }

        MountStatus::Unmounted
    }

    /// Mount all VFS sources that have `local_mount.enabled = true`.
    /// Errors are logged but not propagated.
    pub async fn mount_all_enabled(
        &self,
        mounts: &[ventoos_vfs::types::VfsMount],
        vfs: Arc<VfsManager>,
    ) {
        for mount in mounts {
            if let Some(cfg) = &mount.local_mount
                && cfg.enabled {
                    if let Err(e) = self.mount(&mount.id, &mount.name, cfg, Arc::clone(&vfs)).await
                    {
                        tracing::warn!(
                            "Auto-mount failed for '{}' (id={}): {e}",
                            mount.name,
                            mount.id
                        );
                    } else {
                        tracing::info!(
                            "Auto-mounted '{}' at '{}'",
                            mount.name,
                            cfg.mount_point
                        );
                    }
                }
        }
    }
}
