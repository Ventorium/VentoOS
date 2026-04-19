//! Apple FileProvider integration for VentoOS VFS mounts (macOS 12+ only).
//!
//! This module manages FileProvider domains by invoking the companion
//! `VentoFS.app` helper bundled alongside the main executable.  The actual
//! FileProvider extension is implemented in Swift; this Rust code only
//! orchestrates registration, unregistration, status queries, and change
//! signalling through the helper CLI.

#![allow(dead_code)]

use std::path::PathBuf;

use crate::types::{FileProviderAvailability, MountError};

// ---------------------------------------------------------------------------
// Embedded VentoFS.app bundle
// ---------------------------------------------------------------------------

/// When VentoFS.app is built before this crate, build.rs zips it and sets
/// `embedded_ventofs`.  The zip bytes are then baked into the Rust binary.
#[cfg(embedded_ventofs)]
const VENTOFS_APP_ZIP: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/VentoFS.zip"));
#[cfg(not(embedded_ventofs))]
const VENTOFS_APP_ZIP: &[u8] = &[];

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/// Check if the FileProvider framework is available (macOS 12+).
pub fn is_fileprovider_available() -> bool {
    read_macos_version()
        .as_deref()
        .is_some_and(is_macos_version_supported)
}

fn read_macos_version() -> Option<String> {
    let output = match std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
    {
        Ok(o) => o,
        Err(_) => return None,
    };

    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn is_macos_version_supported(version: &str) -> bool {
    let major: u32 = version
        .trim()
        .split('.')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or_default();

    major >= 12
}

// ---------------------------------------------------------------------------
// Extension app discovery
// ---------------------------------------------------------------------------

/// Remote download URL for VentoFS.app.
const VENTOFS_DOWNLOAD_URL: &str = "https://ventoos.erguotou.me/VentoFS/0.1.0/VentoFS.zip";

/// Locate the `VentoFS.app` bundle that contains the FileProvider extension.
///
/// Search order:
/// 1. Next to the current executable (`{exe_dir}/VentoFS.app`)
/// 2. `/Applications/VentoFS.app`
/// 3. `~/Library/VentoOS/VentoFS.app`
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

    // 3. ~/Library/VentoOS/VentoFS.app (install script default / remote install)
    if let Some(home) = dirs_fallback_home() {
        let install_path = home.join("Library/VentoOS/VentoFS.app");
        if install_path.exists() {
            return install_path;
        }
    }

    // 4. Per-user Application Support
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

/// Default install directory for remote-downloaded VentoFS.app.
fn default_install_dir() -> Option<PathBuf> {
    dirs_fallback_home().map(|h| h.join("Library/VentoOS"))
}

/// Resolve the helper binary inside the app bundle.
fn helper_binary() -> PathBuf {
    extension_app_path().join("Contents/MacOS/VentoFS")
}

fn plugin_bundle_id() -> &'static str {
    "io.ventoos.VentoFS.FileProvider"
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

/// Ensure VentoFS.app is installed.
///
/// Priority:
/// 1. If already present in a standard search path → nothing to do.
/// 2. If a zip was embedded at compile time (via build.rs) → extract it.
/// 3. Otherwise → download from `VENTOFS_DOWNLOAD_URL`.
pub async fn ensure_extension_installed() -> Result<(), MountError> {
    if is_extension_installed() {
        tracing::debug!("VentoFS.app already installed");
        return Ok(());
    }

    let install_dir = default_install_dir().ok_or_else(|| {
        MountError::FileProvider("Unable to resolve HOME directory".to_string())
    })?;
    let zip_path = install_dir.join("VentoFS.zip");

    // Ensure install directory exists.
    tokio::fs::create_dir_all(&install_dir).await.map_err(|e| {
        MountError::FileProvider(format!(
            "Failed to create install directory {}: {e}",
            install_dir.display()
        ))
    })?;

    let use_embedded = !VENTOFS_APP_ZIP.is_empty();

    if use_embedded {
        tracing::info!(
            dest = %install_dir.display(),
            "VentoFS.app not found — extracting embedded bundle"
        );
        tokio::fs::write(&zip_path, VENTOFS_APP_ZIP)
            .await
            .map_err(|e| {
                MountError::FileProvider(format!(
                    "Failed to write embedded zip to {}: {e}",
                    zip_path.display()
                ))
            })?;
    } else {
        tracing::info!(
            url = VENTOFS_DOWNLOAD_URL,
            dest = %install_dir.display(),
            "VentoFS.app not found — downloading from remote"
        );

        // Download using curl (available on every macOS).
        let output = tokio::process::Command::new("curl")
            .args([
                "-L",
                "-f",
                "-o",
                zip_path.to_str().unwrap_or("/tmp/VentoFS.zip"),
                VENTOFS_DOWNLOAD_URL,
            ])
            .output()
            .await
            .map_err(|e| {
                MountError::FileProvider(format!("Failed to run curl: {e}"))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(MountError::FileProvider(format!(
                "Failed to download VentoFS.zip: {}",
                stderr.trim()
            )));
        }
    }

    tracing::info!("Extracting VentoFS.zip …");

    // Extract using unzip (available on every macOS).
    let output = tokio::process::Command::new("unzip")
        .args([
            "-o",
            "-q",
            zip_path.to_str().unwrap_or("/tmp/VentoFS.zip"),
            "-d",
            install_dir.to_str().unwrap_or("/tmp"),
        ])
        .output()
        .await
        .map_err(|e| {
            MountError::FileProvider(format!("Failed to run unzip: {e}"))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(MountError::FileProvider(format!(
            "Failed to extract VentoFS.zip: {}",
            stderr.trim()
        )));
    }

    // Clean up zip file.
    let _ = tokio::fs::remove_file(&zip_path).await;

    // Verify extraction succeeded.
    let app_path = install_dir.join("VentoFS.app");
    if !app_path.exists() {
        return Err(MountError::FileProvider(
            "VentoFS.app not found after extraction".to_string(),
        ));
    }

    // Open the app once so macOS registers the FileProvider extension.
    tracing::info!(
        "Opening VentoFS.app to trigger FileProvider extension registration …"
    );
    let _ = tokio::process::Command::new("open")
        .arg(&app_path)
        .output()
        .await;

    // Wait briefly for the system to recognise the new extension.
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    tracing::info!("VentoFS.app installed at {}", app_path.display());
    Ok(())
}

fn pluginkit_output_has_bundle(output: &str, bundle_id: &str) -> bool {
    output.lines().any(|line| line.trim_start().starts_with(bundle_id))
}

fn query_pluginkit_output() -> Result<String, String> {
    let output = std::process::Command::new("pluginkit")
        .args(["-mvv", "-p", "com.apple.fileprovider-nonui"])
        .output()
        .map_err(|e| format!("无法执行 pluginkit: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pluginkit 执行失败: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

async fn run_helper_via_app(args: &[&str]) -> Result<String, MountError> {
    let app_path = extension_app_path();
    let helper = helper_binary();
    let home = dirs_fallback_home().ok_or_else(|| {
        MountError::FileProvider("Unable to resolve HOME for VentoFS app container".to_string())
    })?;
    let result_dir = home
        .join("Library/Containers/io.ventoos.VentoFS/Data/tmp/VentoFSResults");
    tokio::fs::create_dir_all(&result_dir).await.map_err(|e| {
        MountError::FileProvider(format!(
            "Failed to prepare VentoFS result directory at {}: {e}",
            result_dir.display()
        ))
    })?;
    let result_file = result_dir.join(format!("ventoos-fileprovider-{}.txt", uuid::Uuid::new_v4()));

    let output = tokio::process::Command::new("open")
        .arg("-nW")
        .arg(&app_path)
        .arg("--args")
        .args(args)
        .arg("--result-file")
        .arg(&result_file)
        .output()
        .await
        .map_err(|e| {
            MountError::FileProvider(format!(
                "Failed to launch VentoFS app bundle at {} (helper {}): {e}",
                app_path.display(),
                helper.display()
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(MountError::FileProvider(format!(
            "Failed to launch VentoFS app bundle at {}: {}",
            app_path.display(),
            stderr.trim()
        )));
    }

    let result = tokio::fs::read_to_string(&result_file)
        .await
        .map_err(|e| {
            MountError::FileProvider(format!(
                "VentoFS app did not produce a result file at {}: {e}",
                result_file.display()
            ))
        })?;

    let _ = tokio::fs::remove_file(&result_file).await;
    Ok(result.trim().to_string())
}

fn cloudstorage_domain_path(display_name: &str) -> Result<PathBuf, String> {
    let home = dirs_fallback_home().ok_or_else(|| "Unable to resolve HOME".to_string())?;
    Ok(home
        .join("Library/CloudStorage")
        .join(format!("VentoFS-{display_name}")))
}

/// Return structured diagnostics for the local VentoFS FileProvider backend.
pub fn diagnostics() -> FileProviderAvailability {
    let app_path = extension_app_path();
    let helper_path = helper_binary();
    let macos_version = read_macos_version();
    let plugin_bundle_id = plugin_bundle_id().to_string();
    let app_installed = app_path.exists();
    let helper_binary_exists = helper_path.exists();
    let mut details = Vec::new();

    let platform_supported = macos_version
        .as_deref()
        .is_some_and(is_macos_version_supported);
    if !platform_supported {
        details.push("需要 macOS 12 或更高版本才能使用 FileProvider".to_string());
    }

    if !app_installed {
        details.push(format!(
            "未找到 VentoFS.app，当前查找路径为 {}",
            app_path.display()
        ));
    }

    if app_installed && !helper_binary_exists {
        details.push(format!(
            "VentoFS.app 已安装，但缺少 helper binary：{}",
            helper_path.display()
        ));
    }

    let plugin_registered = match query_pluginkit_output() {
        Ok(output) => {
            let registered = pluginkit_output_has_bundle(&output, &plugin_bundle_id);
            if !registered {
                details.push(
                    "macOS 尚未识别 VentoFS FileProvider 扩展，请重新安装或检查系统是否接受该插件"
                        .to_string(),
                );
            }
            registered
        }
        Err(error) => {
            details.push(error);
            false
        }
    };

    let reason = if !platform_supported {
        Some("FileProvider 需要 macOS 12+".to_string())
    } else if !app_installed {
        Some("未安装 VentoFS.app".to_string())
    } else if !helper_binary_exists {
        Some("VentoFS.app 不完整，缺少 helper binary".to_string())
    } else {
        None
    };

    FileProviderAvailability {
        available: platform_supported && app_installed && helper_binary_exists,
        probe_succeeded: None,
        macos_version,
        app_path: app_path.display().to_string(),
        helper_path: helper_path.display().to_string(),
        plugin_bundle_id,
        app_installed,
        helper_binary_exists,
        plugin_registered,
        reason,
        details,
    }
}

/// Verify that the host app can register and unregister a temporary domain.
pub async fn probe_registration() -> Result<(), String> {
    let probe_mount_id = format!("probe-{}", uuid::Uuid::new_v4());
    let probe_name = "VentoFS Probe";
    register_domain(&probe_mount_id, probe_name)
        .await
        .map_err(|e| e.to_string())?;
    probe_domain_access(probe_name).await?;
    unregister_domain(&probe_mount_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Verify that the registered domain shows up in CloudStorage and can be accessed.
pub async fn probe_domain_access(display_name: &str) -> Result<(), String> {
    let target = cloudstorage_domain_path(display_name)?;

    let deadline = std::time::Duration::from_secs(5);
    let poll_interval = std::time::Duration::from_millis(200);
    let started = std::time::Instant::now();

    while !target.exists() && started.elapsed() < deadline {
        tokio::time::sleep(poll_interval).await;
    }

    if !target.exists() {
        return Err(format!(
            "CloudStorage 目录未出现：{}",
            target.display()
        ));
    }

    let target_for_read = target.clone();
    let read_attempt = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut entries = std::fs::read_dir(&target_for_read)
            .map_err(|e| format!("无法读取 CloudStorage 目录 {}: {e}", target_for_read.display()))?;
        let _ = entries.next();
        Ok(())
    });

    // FileProvider extension cold-start can take several seconds (sandbox init,
    // XPC handshake, first HTTP request to localhost).  Use a generous timeout.
    match tokio::time::timeout(std::time::Duration::from_secs(15), read_attempt).await {
        Ok(Ok(Ok(()))) => Ok(()),
        Ok(Ok(Err(error))) => Err(error),
        Ok(Err(join_error)) => Err(format!("CloudStorage 访问探针任务失败: {join_error}")),
        Err(_) => Err(format!(
            "CloudStorage 目录可见但访问超时（15s）：{}。请确认 VentoOS server 正在运行且 FileProvider 扩展已正确构建/签名。",
            target.display()
        )),
    }
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
    tracing::info!(
        mount_id,
        display_name,
        app = %extension_app_path().display(),
        "Registering FileProvider domain"
    );

    let result = run_helper_via_app(&["register", mount_id, display_name]).await?;

    if result != "ok" {
        let msg = format!("VentoFS register failed: {result}");
        tracing::error!(mount_id, msg);
        return Err(MountError::FileProvider(msg));
    }

    tracing::info!(mount_id, "FileProvider domain registered");
    Ok(())
}

/// Unregister a FileProvider domain, removing the mount from Finder.
pub async fn unregister_domain(mount_id: &str) -> Result<(), MountError> {
    tracing::info!(
        mount_id,
        app = %extension_app_path().display(),
        "Unregistering FileProvider domain"
    );

    let result = run_helper_via_app(&["unregister", mount_id]).await?;

    if result != "ok" {
        let msg = format!("VentoFS unregister failed: {result}");
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
    let result = run_helper_via_app(&["status", mount_id]).await?;
    Ok(result.eq_ignore_ascii_case("active"))
}

/// Signal the FileProvider extension to re-enumerate content for a domain.
///
/// This is the Rust-side equivalent of calling
/// `NSFileProviderManager.signalEnumerator(for:)`.
pub async fn signal_changes(mount_id: &str) -> Result<(), MountError> {
    tracing::info!(mount_id, "Signalling FileProvider content changes");

    let result = run_helper_via_app(&["signal", mount_id]).await?;

    if result != "ok" {
        let msg = format!("VentoFS signal failed: {result}");
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
    tracing::info!("Cleaning up all VentoOS FileProvider domains");

    let result = run_helper_via_app(&["cleanup"]).await?;

    if !result.starts_with("cleaned") {
        let msg = format!("VentoFS cleanup failed: {result}");
        tracing::error!(msg);
        return Err(MountError::FileProvider(msg));
    }

    tracing::info!("FileProvider domain cleanup complete");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_supported_macos_versions() {
        assert!(is_macos_version_supported("12.0"));
        assert!(is_macos_version_supported("14.4.1"));
        assert!(!is_macos_version_supported("11.7.10"));
        assert!(!is_macos_version_supported("not-a-version"));
    }

    #[test]
    fn detects_registered_plugin_from_pluginkit_output() {
        let output = r#"
com.tencent.xinWeChat.WeChatFileProviderExtension(4.1.7)
    Path = /Applications/WeChat.app/Contents/PlugIns/WeChatFileProviderExtension.appex
io.ventoos.VentoFS.FileProvider(1.0)
    Path = /Users/demo/Library/VentoOS/VentoFS.app/Contents/PlugIns/VentoFSFileProvider.appex
"#;

        assert!(pluginkit_output_has_bundle(output, "io.ventoos.VentoFS.FileProvider"));
        assert!(!pluginkit_output_has_bundle(output, "io.ventoos.OtherProvider"));
    }
}
