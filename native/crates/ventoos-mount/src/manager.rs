//! `LocalMountManager` — manages the lifecycle of FUSE and FileProvider mounts
//! for VFS sources.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use ventoos_vfs::VfsManager;
use ventoos_vfs::types::{LocalMountConfig, MountBackend};

use crate::types::{MountError, MountStatus};
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
        #[cfg(target_os = "macos")]
        {
            crate::fileprovider_impl::is_fileprovider_available()
                && crate::fileprovider_impl::is_extension_installed()
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
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
            if !Self::is_fileprovider_available() {
                return Err(MountError::FileProvider(
                    "FileProvider 不可用：需要 macOS 12+ 并安装 VentoFS.app".to_string(),
                ));
            }

            crate::fileprovider_impl::register_domain(mount_id, mount_name).await?;

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
            Some(MountState::Error(e)) => MountStatus::Error { error: e.clone() },
            None => MountStatus::Unmounted,
        }
    }

    /// Mount all VFS sources that have `local_mount.enabled = true`.
    /// Errors are logged but not propagated.
    pub async fn mount_all_enabled(
        &self,
        mounts: &[ventoos_vfs::types::VfsMount],
        vfs: Arc<VfsManager>,
    ) {
        for mount in mounts {
            if let Some(cfg) = &mount.local_mount {
                if cfg.enabled {
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
}
