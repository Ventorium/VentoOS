//! `LocalMountManager` — manages the lifecycle of FUSE mounts for VFS sources.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use ventoos_vfs::VfsManager;
use ventoos_vfs::types::LocalMountConfig;

use crate::types::{MountError, MountStatus};
use crate::validate::{expand_home, validate_mount_path};

/// Handle to an active mount task. The handle is used to unmount.
struct MountHandle {
    /// The expanded mount point path.
    mount_point: String,
    /// Abort handle for the spawned FUSE task.
    #[allow(dead_code)]
    abort: tokio::task::AbortHandle,
}

/// Manages local FUSE mounts for VFS sources.
pub struct LocalMountManager {
    /// Map of mount_id → (status, optional handle).
    state: Arc<RwLock<HashMap<String, MountState>>>,
}

pub(crate) enum MountState {
    Mounted(MountHandle),
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

    /// Mount the given VFS source at the configured local path.
    pub async fn mount(
        &self,
        mount_id: &str,
        config: &LocalMountConfig,
        vfs: Arc<VfsManager>,
    ) -> Result<(), MountError> {
        if !config.enabled {
            return Ok(());
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
        let mp_clone = mount_point.clone();
        let state_ref = Arc::clone(&self.state);

        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

            let task = tokio::task::spawn(crate::fuse_impl::run_fuse_mount(
                mount_id_owned.clone(),
                mount_id_owned.clone(),
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
                    // FUSE mount failed.
                    tracing::error!("FUSE mount for {mount_id_owned} failed: {e}");
                    Err(MountError::Fuse(e))
                }
                Ok(Err(_)) => {
                    // oneshot sender dropped without sending — mount task panicked.
                    Err(MountError::Fuse("FUSE mount task terminated unexpectedly".to_string()))
                }
                Err(_) => {
                    // Timeout — mount didn't complete in time.
                    task.abort();
                    Err(MountError::Fuse(
                        "FUSE mount timed out after 15 seconds".to_string(),
                    ))
                }
            }
        }

        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        {
            let _ = (vfs, state_ref, mp_clone, mount_id_owned);
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
                    if let Err(e) = self.mount(&mount.id, cfg, Arc::clone(&vfs)).await {
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
