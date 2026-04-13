//! Apple FileProvider integration for VentoOS VFS mounts (macOS 12+ only).
//!
//! This module manages FileProvider domains by invoking the companion
//! `VentoFS.app` helper bundled alongside the main executable.  The actual
//! FileProvider extension is implemented in Swift; this Rust code only
//! orchestrates registration, unregistration, status queries, and change
//! signalling through the helper CLI.

#![allow(dead_code)]

use std::path::PathBuf;

use crate::types::MountError;

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/// Check if the FileProvider framework is available (macOS 12+).
pub fn is_fileprovider_available() -> bool {
    let output = match std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
    {
        Ok(o) => o,
        Err(_) => return false,
    };

    let version = String::from_utf8_lossy(&output.stdout);
    let major: u32 = version
        .trim()
        .split('.')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    major >= 12
}

// ---------------------------------------------------------------------------
// Extension app discovery
// ---------------------------------------------------------------------------

/// Locate the `VentoFS.app` bundle that contains the FileProvider extension.
///
/// Search order:
/// 1. Next to the current executable (`{exe_dir}/VentoFS.app`)
/// 2. `/Applications/VentoFS.app`
/// 3. `~/Library/Application Support/VentoOS/VentoFS.app`
fn extension_app_path() -> PathBuf {
    // 1. Beside the current executable
    if let Ok(exe) = std::env::current_exe()
        && let Some(dir) = exe.parent()
    {
        let candidate = dir.join("VentoFS.app");
        if candidate.exists() {
            return candidate;
        }
    }

    // 2. Global Applications folder
    let global = PathBuf::from("/Applications/VentoFS.app");
    if global.exists() {
        return global;
    }

    // 3. Per-user Application Support
    if let Some(home) = dirs_fallback_home() {
        let user_path = home
            .join("Library/Application Support/VentoOS/VentoFS.app");
        if user_path.exists() {
            return user_path;
        }
    }

    // Fallback – return the most likely path even if it doesn't exist yet.
    PathBuf::from("/Applications/VentoFS.app")
}

/// Resolve the helper binary inside the app bundle.
fn helper_binary() -> PathBuf {
    extension_app_path().join("Contents/MacOS/VentoFS")
}

/// Simple home-directory fallback (avoids pulling in the `dirs` crate).
fn dirs_fallback_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/// Check if the FileProvider extension app bundle is installed.
pub fn is_extension_installed() -> bool {
    extension_app_path().exists()
}

// ---------------------------------------------------------------------------
// Domain lifecycle
// ---------------------------------------------------------------------------

/// Register a FileProvider domain for a VFS mount.
///
/// The domain identifier will be `io.ventoos.vfs.{mount_id}`.
/// On success the mount appears in Finder's sidebar.
pub async fn register_domain(
    mount_id: &str,
    display_name: &str,
) -> Result<(), MountError> {
    let binary = helper_binary();
    tracing::info!(
        mount_id,
        display_name,
        binary = %binary.display(),
        "Registering FileProvider domain"
    );

    let output = tokio::process::Command::new(&binary)
        .args(["register", mount_id, display_name])
        .output()
        .await
        .map_err(|e| {
            MountError::FileProvider(format!(
                "Failed to launch VentoFS helper at {}: {e}",
                binary.display()
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!(
            "VentoFS register failed (exit {}): {}",
            output.status,
            stderr.trim()
        );
        tracing::error!(mount_id, msg);
        return Err(MountError::FileProvider(msg));
    }

    tracing::info!(mount_id, "FileProvider domain registered");
    Ok(())
}

/// Unregister a FileProvider domain, removing the mount from Finder.
pub async fn unregister_domain(mount_id: &str) -> Result<(), MountError> {
    let binary = helper_binary();
    tracing::info!(
        mount_id,
        binary = %binary.display(),
        "Unregistering FileProvider domain"
    );

    let output = tokio::process::Command::new(&binary)
        .args(["unregister", mount_id])
        .output()
        .await
        .map_err(|e| {
            MountError::FileProvider(format!(
                "Failed to launch VentoFS helper at {}: {e}",
                binary.display()
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!(
            "VentoFS unregister failed (exit {}): {}",
            output.status,
            stderr.trim()
        );
        tracing::error!(mount_id, msg);
        return Err(MountError::FileProvider(msg));
    }

    tracing::info!(mount_id, "FileProvider domain unregistered");
    Ok(())
}

/// Query whether a FileProvider domain is currently active.
///
/// Returns `true` if the domain is registered and healthy.
pub async fn domain_status(mount_id: &str) -> Result<bool, MountError> {
    let binary = helper_binary();

    let output = tokio::process::Command::new(&binary)
        .args(["status", mount_id])
        .output()
        .await
        .map_err(|e| {
            MountError::FileProvider(format!(
                "Failed to launch VentoFS helper at {}: {e}",
                binary.display()
            ))
        })?;

    if !output.status.success() {
        // Non-zero exit means the domain is not registered / not active.
        return Ok(false);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().eq_ignore_ascii_case("active"))
}

/// Signal the FileProvider extension to re-enumerate content for a domain.
///
/// This is the Rust-side equivalent of calling
/// `NSFileProviderManager.signalEnumerator(for:)`.
pub async fn signal_changes(mount_id: &str) -> Result<(), MountError> {
    let binary = helper_binary();
    tracing::info!(mount_id, "Signalling FileProvider content changes");

    let output = tokio::process::Command::new(&binary)
        .args(["signal", mount_id])
        .output()
        .await
        .map_err(|e| {
            MountError::FileProvider(format!(
                "Failed to launch VentoFS helper at {}: {e}",
                binary.display()
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!(
            "VentoFS signal failed (exit {}): {}",
            output.status,
            stderr.trim()
        );
        tracing::error!(mount_id, msg);
        return Err(MountError::FileProvider(msg));
    }

    Ok(())
}

/// Force-remove **all** VentoOS FileProvider domains (matching the
/// `io.ventoos.vfs.*` prefix).
///
/// Useful during cleanup or application shutdown.
pub async fn cleanup_all_domains() -> Result<(), MountError> {
    let binary = helper_binary();
    tracing::info!("Cleaning up all VentoOS FileProvider domains");

    let output = tokio::process::Command::new(&binary)
        .args(["cleanup"])
        .output()
        .await
        .map_err(|e| {
            MountError::FileProvider(format!(
                "Failed to launch VentoFS helper at {}: {e}",
                binary.display()
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!(
            "VentoFS cleanup failed (exit {}): {}",
            output.status,
            stderr.trim()
        );
        tracing::error!(msg);
        return Err(MountError::FileProvider(msg));
    }

    tracing::info!("FileProvider domain cleanup complete");
    Ok(())
}
