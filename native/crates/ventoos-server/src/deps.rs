//! Dependency detection and installation for system-level requirements.
//!
//! This module checks whether platform-specific dependencies (e.g. macFUSE, libfuse3, WinFSP)
//! are installed and provides installation scripts via API routes.

use axum::extract::Query;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

use ventoos_core::types::ApiResponse;

// ── Types ──────────────────────────────────────────────────────────────────

/// A single checkable system dependency.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    /// Unique ID, e.g. "macfuse", "libfuse3", "winfsp"
    pub id: String,
    /// Human-readable display name
    pub name: String,
    /// Description of what this dependency provides
    pub description: String,
    /// Whether it is currently installed
    pub installed: bool,
    /// Platform this dependency applies to
    pub platform: Platform,
    /// Suggested install command (for display/automation)
    pub install_command: Option<String>,
    /// Homepage / download URL
    pub homepage: Option<String>,
}

/// Supported platforms.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Macos,
    Linux,
    Windows,
    All,
}

/// Categories of dependencies.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DepCategory {
    /// Required for VFS local mount (FUSE)
    Fuse,
    /// All categories
    All,
}

// ── Detection logic ────────────────────────────────────────────────────────

fn current_platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Macos
    } else if cfg!(target_os = "linux") {
        Platform::Linux
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else {
        Platform::All
    }
}

/// Check if macFUSE / FUSE-T is installed on macOS.
fn check_macfuse_installed() -> bool {
    // Check for macFUSE kext or FUSE-T
    if std::path::Path::new("/Library/Filesystems/macfuse.fs").exists() {
        return true;
    }
    // FUSE-T installs here
    if std::path::Path::new("/Library/Filesystems/fuse-t.fs").exists() {
        return true;
    }
    // Also check via pkgutil
    Command::new("pkgutil")
        .args(["--pkg-info", "io.macfuse.installer.components.core"])
        .output()
        .is_ok_and(|o| o.status.success())
}

/// Check if libfuse3 is installed on Linux.
fn check_libfuse3_installed() -> bool {
    // Check for the shared library
    if std::path::Path::new("/usr/lib/x86_64-linux-gnu/libfuse3.so").exists()
        || std::path::Path::new("/usr/lib/libfuse3.so").exists()
        || std::path::Path::new("/usr/lib64/libfuse3.so").exists()
    {
        return true;
    }
    // Check via ldconfig
    Command::new("ldconfig")
        .args(["-p"])
        .output()
        .is_ok_and(|o| {
            String::from_utf8_lossy(&o.stdout).contains("libfuse3")
        })
}

/// Check if WinFSP is installed on Windows.
fn check_winfsp_installed() -> bool {
    // WinFSP installs to Program Files
    if std::path::Path::new(r"C:\Program Files (x86)\WinFsp").exists()
        || std::path::Path::new(r"C:\Program Files\WinFsp").exists()
    {
        return true;
    }
    false
}

/// Get all dependencies for the current platform, optionally filtered by category.
fn get_dependencies(category: &DepCategory) -> Vec<Dependency> {
    let platform = current_platform();
    let mut deps = Vec::new();

    let want_fuse = matches!(category, DepCategory::Fuse | DepCategory::All);

    if want_fuse {
        match platform {
            Platform::Macos => {
                deps.push(Dependency {
                    id: "macfuse".into(),
                    name: "macFUSE".into(),
                    description: "macOS FUSE 文件系统支持，用于将远程文件系统挂载到本机目录".into(),
                    installed: check_macfuse_installed(),
                    platform: Platform::Macos,
                    install_command: Some("brew install --cask macfuse".into()),
                    homepage: Some("https://osxfuse.github.io/".into()),
                });
            }
            Platform::Linux => {
                deps.push(Dependency {
                    id: "libfuse3".into(),
                    name: "libfuse3".into(),
                    description: "Linux FUSE3 文件系统支持，用于将远程文件系统挂载到本机目录".into(),
                    installed: check_libfuse3_installed(),
                    platform: Platform::Linux,
                    install_command: Some(detect_linux_install_command()),
                    homepage: Some("https://github.com/libfuse/libfuse".into()),
                });
            }
            Platform::Windows => {
                deps.push(Dependency {
                    id: "winfsp".into(),
                    name: "WinFSP".into(),
                    description: "Windows FUSE 文件系统支持，用于将远程文件系统挂载到本机目录".into(),
                    installed: check_winfsp_installed(),
                    platform: Platform::Windows,
                    install_command: Some("winget install WinFsp.WinFsp".into()),
                    homepage: Some("https://winfsp.dev/".into()),
                });
            }
            Platform::All => {}
        }
    }

    deps
}

/// Detect the appropriate package manager on Linux and return the install command.
fn detect_linux_install_command() -> String {
    if Command::new("apt-get")
        .arg("--version")
        .output()
        .is_ok_and(|o| o.status.success())
    {
        return "sudo apt-get install -y libfuse3-dev fuse3".into();
    }
    if Command::new("dnf")
        .arg("--version")
        .output()
        .is_ok_and(|o| o.status.success())
    {
        return "sudo dnf install -y fuse3 fuse3-devel".into();
    }
    if Command::new("pacman")
        .arg("--version")
        .output()
        .is_ok_and(|o| o.status.success())
    {
        return "sudo pacman -S fuse3".into();
    }
    "sudo apt-get install -y libfuse3-dev fuse3".into()
}

// ── API Routes ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DepQuery {
    /// Filter by category: "fuse" or "all" (default)
    category: Option<String>,
}

/// GET /api/dependencies — list all dependencies for the current platform.
async fn list_dependencies(Query(query): Query<DepQuery>) -> Json<ApiResponse<Vec<Dependency>>> {
    let category = match query.category.as_deref() {
        Some("fuse") => DepCategory::Fuse,
        _ => DepCategory::All,
    };
    let deps = get_dependencies(&category);
    Json(ApiResponse::ok(deps))
}

#[derive(Deserialize)]
pub struct InstallQuery {
    /// Dependency ID to install
    id: String,
}

#[derive(Serialize)]
pub struct InstallResult {
    pub success: bool,
    pub output: String,
    pub dependency: Dependency,
}

/// POST /api/dependencies/install?id=macfuse — attempt to install a dependency.
async fn install_dependency(Query(query): Query<InstallQuery>) -> impl IntoResponse {
    let deps = get_dependencies(&DepCategory::All);
    let Some(dep) = deps.iter().find(|d| d.id == query.id) else {
        return Json(ApiResponse::<InstallResult>::err(format!(
            "Unknown dependency: {}",
            query.id
        )))
        .into_response();
    };

    let Some(cmd) = &dep.install_command else {
        return Json(ApiResponse::<InstallResult>::err(
            "No install command available for this dependency",
        ))
        .into_response();
    };

    // Execute the install command
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", cmd]).output()
    } else {
        Command::new("sh").args(["-c", cmd]).output()
    };

    match output {
        Ok(result) => {
            let stdout = String::from_utf8_lossy(&result.stdout).to_string();
            let stderr = String::from_utf8_lossy(&result.stderr).to_string();
            let combined = if stderr.is_empty() {
                stdout
            } else {
                format!("{stdout}\n{stderr}")
            };

            // Re-check after install
            let updated_deps = get_dependencies(&DepCategory::All);
            let updated = updated_deps
                .into_iter()
                .find(|d| d.id == query.id)
                .unwrap_or_else(|| dep.clone());

            Json(ApiResponse::ok(InstallResult {
                success: result.status.success(),
                output: combined,
                dependency: updated,
            }))
            .into_response()
        }
        Err(e) => Json(ApiResponse::<InstallResult>::err(format!(
            "Failed to execute install command: {e}"
        )))
        .into_response(),
    }
}

/// GET /api/dependencies/check-fuse — quick check if FUSE is available for local mount.
async fn check_fuse() -> Json<ApiResponse<serde_json::Value>> {
    let deps = get_dependencies(&DepCategory::Fuse);
    let all_ok = deps.iter().all(|d| d.installed);
    let platform = current_platform();

    Json(ApiResponse::ok(serde_json::json!({
        "available": all_ok,
        "platform": platform,
        "dependencies": deps,
    })))
}

/// GET /api/dependencies/check-fileprovider — check if `FileProvider` backend is available.
async fn check_fileprovider() -> Json<ApiResponse<serde_json::Value>> {
    let available = ventoos_mount::LocalMountManager::is_fileprovider_available();
    let platform = current_platform();

    Json(ApiResponse::ok(serde_json::json!({
        "available": available,
        "platform": platform,
    })))
}

/// POST /api/system/install-fileprovider — build and install VentoFS.app.
async fn install_fileprovider_handler() -> impl IntoResponse {
    // Locate build.sh relative to the executable or source dir env var
    let build_sh = find_fileprovider_build_sh();
    let Some(build_sh) = build_sh else {
        return Json(ApiResponse::<serde_json::Value>::err(
            "FileProvider source not found",
        ))
        .into_response();
    };

    let dir = build_sh.parent().unwrap().to_path_buf();

    // Run build then install, collecting combined output
    let mut combined = String::new();

    for step in &["build", "install"] {
        let result = Command::new("bash")
            .arg("build.sh")
            .arg(step)
            .current_dir(&dir)
            .output();

        match result {
            Ok(output) => {
                combined.push_str(&String::from_utf8_lossy(&output.stdout));
                combined.push_str(&String::from_utf8_lossy(&output.stderr));
                if !output.status.success() {
                    return Json(ApiResponse::<serde_json::Value>::err(format!(
                        "build.sh {step} failed:\n{combined}"
                    )))
                    .into_response();
                }
            }
            Err(e) => {
                return Json(ApiResponse::<serde_json::Value>::err(format!(
                    "Failed to run build.sh {step}: {e}"
                )))
                .into_response();
            }
        }
    }

    Json(ApiResponse::ok(serde_json::json!({
        "success": true,
        "message": "VentoFS.app installed",
        "output": combined,
    })))
    .into_response()
}

/// Find the `build.sh` for the FileProvider companion app.
fn find_fileprovider_build_sh() -> Option<PathBuf> {
    // 1. Dev layout: exe is at native/target/debug/ventoos, source is native/fileprovider/
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // native/target/debug/ -> ../../fileprovider/
            let candidate = exe_dir.join("../../fileprovider/build.sh");
            if candidate.exists() {
                return Some(candidate.canonicalize().unwrap_or(candidate));
            }
            // One level up
            let candidate = exe_dir.join("../fileprovider/build.sh");
            if candidate.exists() {
                return Some(candidate.canonicalize().unwrap_or(candidate));
            }
        }
    }

    // 3. Explicit source dir env var
    if let Ok(source_dir) = std::env::var("VENTOOS_SOURCE_DIR") {
        let candidate = PathBuf::from(&source_dir).join("native/fileprovider/build.sh");
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

/// Build the dependency management routes.
pub fn dependency_routes() -> Router<crate::state::AppState> {
    Router::new()
        .route("/api/dependencies", get(list_dependencies))
        .route(
            "/api/dependencies/install",
            axum::routing::post(install_dependency),
        )
        .route("/api/dependencies/check-fuse", get(check_fuse))
        .route("/api/dependencies/check-fileprovider", get(check_fileprovider))
        .route(
            "/api/system/install-fileprovider",
            axum::routing::post(install_fileprovider_handler),
        )
}
