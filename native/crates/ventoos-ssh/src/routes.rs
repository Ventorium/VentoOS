use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::{ApiResponse, Id};

use crate::manager::SshManager;
use crate::types::{
    CreatePortMappingRequest, CreateServiceExposureRequest, CreateSshServerRequest, PortMapping,
    ServiceExposure, SshServer, SshServerStatus, UpdateSshServerRequest,
};

/// Shared state for SSH routes.
#[derive(Clone)]
pub struct SshState {
    pub manager: Arc<SshManager>,
}

/// SSH management application plugin.
pub struct SshPlugin {
    state: SshState,
}

impl SshPlugin {
    pub fn new(manager: Arc<SshManager>) -> Self {
        Self {
            state: SshState { manager },
        }
    }
}

impl AppPlugin for SshPlugin {
    fn app_id(&self) -> &'static str {
        "ssh"
    }

    fn routes(&self) -> Router {
        Router::new()
            // SSH server routes
            .route(
                "/api/ssh/servers",
                get(list_ssh_servers).post(create_ssh_server),
            )
            .route(
                "/api/ssh/servers/{id}",
                get(get_ssh_server)
                    .put(update_ssh_server)
                    .delete(delete_ssh_server),
            )
            .route("/api/ssh/servers/{id}/test", post(test_ssh_server))
            .route("/api/ssh/servers/{id}/metrics", get(get_server_metrics))
            .route("/api/ssh/servers/{id}/status", post(update_server_status))
            // Port mapping routes
            .route(
                "/api/port-mappings",
                get(list_port_mappings).post(create_port_mapping),
            )
            .route(
                "/api/port-mappings/{id}",
                get(get_port_mapping).delete(delete_port_mapping),
            )
            .route("/api/port-mappings/{id}/start", post(start_port_mapping))
            .route("/api/port-mappings/{id}/stop", post(stop_port_mapping))
            // Service exposure routes
            .route(
                "/api/service-exposures",
                get(list_service_exposures).post(create_service_exposure),
            )
            .route(
                "/api/service-exposures/{id}",
                get(get_service_exposure).delete(delete_service_exposure),
            )
            .route(
                "/api/service-exposures/{id}/start",
                post(start_service_exposure),
            )
            .route(
                "/api/service-exposures/{id}/stop",
                post(stop_service_exposure),
            )
            // SSH config import & key file listing
            .route("/api/ssh/config-hosts", get(list_ssh_config_hosts))
            .route("/api/ssh/key-files", get(list_ssh_key_files))
            // Shell detection
            .route("/api/ssh/detect-shells", get(detect_shells))
            .with_state(self.state.clone())
    }
}

// --- SSH Server Routes ---

async fn list_ssh_servers(State(state): State<SshState>) -> Json<ApiResponse<Vec<SshServer>>> {
    let servers = state.manager.list_servers().await;
    Json(ApiResponse::ok(servers))
}

async fn create_ssh_server(
    State(state): State<SshState>,
    Json(req): Json<CreateSshServerRequest>,
) -> (StatusCode, Json<ApiResponse<SshServer>>) {
    let server = state.manager.create_server(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(server)))
}

async fn get_ssh_server(State(state): State<SshState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.manager.get_server(id).await {
        Some(server) => Json(ApiResponse::ok(server)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response(),
    }
}

async fn update_ssh_server(
    State(state): State<SshState>,
    Path(id): Path<Id>,
    Json(req): Json<UpdateSshServerRequest>,
) -> impl IntoResponse {
    match state.manager.update_server(id, req).await {
        Some(server) => Json(ApiResponse::ok(server)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response(),
    }
}

async fn delete_ssh_server(State(state): State<SshState>, Path(id): Path<Id>) -> impl IntoResponse {
    if state.manager.delete_server(id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response()
    }
}

async fn test_ssh_server(State(state): State<SshState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.manager.test_server(id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response(),
    }
}

async fn get_server_metrics(
    State(state): State<SshState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.manager.get_server(id).await {
        Some(_server) => {
            // In a real implementation, this would SSH into the server
            // and run system commands to collect metrics.
            // For now, return a stub response indicating the feature is available
            // but requires an active SSH connection.
            Json(ApiResponse::ok(serde_json::json!({
                "status": "not_connected",
                "message": "Connect to the server first to view metrics"
            })))
            .into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response(),
    }
}

// --- Port Mapping Routes ---

#[derive(serde::Deserialize)]
struct UpdateStatusRequest {
    status: String,
}

async fn update_server_status(
    State(state): State<SshState>,
    Path(id): Path<Id>,
    Json(req): Json<UpdateStatusRequest>,
) -> impl IntoResponse {
    let status = match req.status.as_str() {
        "connected" => SshServerStatus::Connected,
        "connecting" => SshServerStatus::Connecting,
        "error" => SshServerStatus::Error,
        _ => SshServerStatus::Disconnected,
    };
    match state.manager.update_server_status(id, status).await {
        Some(server) => Json(ApiResponse::ok(server)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response(),
    }
}

async fn list_port_mappings(State(state): State<SshState>) -> Json<ApiResponse<Vec<PortMapping>>> {
    let mappings = state.manager.list_port_mappings().await;
    Json(ApiResponse::ok(mappings))
}

async fn create_port_mapping(
    State(state): State<SshState>,
    Json(req): Json<CreatePortMappingRequest>,
) -> (StatusCode, Json<ApiResponse<PortMapping>>) {
    let mapping = state.manager.create_port_mapping(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(mapping)))
}

async fn get_port_mapping(State(state): State<SshState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.manager.get_port_mapping(id).await {
        Some(mapping) => Json(ApiResponse::ok(mapping)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Port mapping not found")),
        )
            .into_response(),
    }
}

async fn delete_port_mapping(
    State(state): State<SshState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    if state.manager.delete_port_mapping(id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Port mapping not found")),
        )
            .into_response()
    }
}

async fn start_port_mapping(
    State(state): State<SshState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.manager.start_port_mapping(id).await {
        Some(mapping) => Json(ApiResponse::ok(mapping)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Port mapping not found")),
        )
            .into_response(),
    }
}

async fn stop_port_mapping(State(state): State<SshState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.manager.stop_port_mapping(id).await {
        Some(mapping) => Json(ApiResponse::ok(mapping)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Port mapping not found")),
        )
            .into_response(),
    }
}

// --- Service Exposure Routes ---

async fn list_service_exposures(
    State(state): State<SshState>,
) -> Json<ApiResponse<Vec<ServiceExposure>>> {
    let exposures = state.manager.list_service_exposures().await;
    Json(ApiResponse::ok(exposures))
}

async fn create_service_exposure(
    State(state): State<SshState>,
    Json(req): Json<CreateServiceExposureRequest>,
) -> (StatusCode, Json<ApiResponse<ServiceExposure>>) {
    let exposure = state.manager.create_service_exposure(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(exposure)))
}

async fn get_service_exposure(
    State(state): State<SshState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.manager.get_service_exposure(id).await {
        Some(exposure) => Json(ApiResponse::ok(exposure)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Service exposure not found")),
        )
            .into_response(),
    }
}

async fn delete_service_exposure(
    State(state): State<SshState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    if state.manager.delete_service_exposure(id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Service exposure not found")),
        )
            .into_response()
    }
}

async fn start_service_exposure(
    State(state): State<SshState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.manager.start_service_exposure(id).await {
        Some(exposure) => Json(ApiResponse::ok(exposure)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Service exposure not found")),
        )
            .into_response(),
    }
}

async fn stop_service_exposure(
    State(state): State<SshState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.manager.stop_service_exposure(id).await {
        Some(exposure) => Json(ApiResponse::ok(exposure)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Service exposure not found")),
        )
            .into_response(),
    }
}

// --- SSH Config Import & Key Files ---

/// Default SSH private key file names, in the same order SSH client tries them.
const DEFAULT_SSH_KEY_NAMES: &[&str] = &["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa"];

/// Detect the first existing default private key in `~/.ssh/`.
fn detect_default_key(home: &str) -> Option<String> {
    let ssh_dir = std::path::Path::new(home).join(".ssh");
    for name in DEFAULT_SSH_KEY_NAMES {
        let path = ssh_dir.join(name);
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }
    None
}

/// Parsed SSH config host entry
#[derive(serde::Serialize)]
struct SshConfigHost {
    alias: String,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
    /// Auto-detected default key when no `IdentityFile` is set in config.
    auto_detected_key: Option<String>,
    /// `ProxyJump` host alias (if configured).
    proxy_jump: Option<String>,
}

async fn list_ssh_config_hosts() -> impl IntoResponse {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let config_path = std::path::Path::new(&home).join(".ssh/config");
    match tokio::fs::read_to_string(&config_path).await {
        Ok(content) => {
            let mut hosts: Vec<SshConfigHost> = Vec::new();
            let mut current: Option<SshConfigHost> = None;

            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                // Case-insensitive keyword matching
                let lower = trimmed.to_lowercase();
                if lower.starts_with("host ") {
                    // Save previous entry
                    if let Some(entry) = current.take()
                        && !entry.alias.contains('*')
                    {
                        hosts.push(entry);
                    }
                    let alias = trimmed[5..].trim().to_string();
                    current = Some(SshConfigHost {
                        alias,
                        hostname: None,
                        user: None,
                        port: None,
                        identity_file: None,
                        auto_detected_key: None,
                        proxy_jump: None,
                    });
                } else if let Some(entry) = current.as_mut() {
                    // Parse key-value (split at first whitespace or '=')
                    let value = if let Some(pos) = trimmed.find([' ', '=']) {
                        trimmed[pos + 1..].trim().to_string()
                    } else {
                        continue;
                    };

                    if lower.starts_with("hostname") {
                        entry.hostname = Some(value);
                    } else if lower.starts_with("user ") || lower.starts_with("user=") {
                        entry.user = Some(value);
                    } else if lower.starts_with("port") {
                        entry.port = value.parse().ok();
                    } else if lower.starts_with("identityfile") {
                        // Expand ~ to home dir
                        let expanded = if let Some(rest) = value.strip_prefix("~/") {
                            format!("{home}/{rest}")
                        } else {
                            value
                        };
                        entry.identity_file = Some(expanded);
                    } else if lower.starts_with("proxyjump") {
                        entry.proxy_jump = Some(value);
                    }
                }
            }
            // Don't forget the last entry
            if let Some(entry) = current.take()
                && !entry.alias.contains('*')
            {
                hosts.push(entry);
            }
            // Auto-detect default keys for hosts without explicit IdentityFile
            for host in &mut hosts {
                if host.identity_file.is_none() {
                    host.auto_detected_key = detect_default_key(&home);
                }
            }
            Json(ApiResponse::ok(hosts)).into_response()
        }
        Err(_) => Json(ApiResponse::ok(Vec::<SshConfigHost>::new())).into_response(),
    }
}

/// SSH key file entry
#[derive(serde::Serialize)]
struct SshKeyFile {
    name: String,
    path: String,
    is_public: bool,
}

async fn list_ssh_key_files() -> impl IntoResponse {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let ssh_dir = std::path::Path::new(&home).join(".ssh");
    let mut files: Vec<SshKeyFile> = Vec::new();

    if let Ok(mut entries) = tokio::fs::read_dir(&ssh_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name().to_string_lossy().to_string();
            // Skip known non-key files
            if matches!(
                name.as_str(),
                "config" | "known_hosts" | "known_hosts.old" | "authorized_keys"
            ) {
                continue;
            }
            // Only include regular files
            if let Ok(meta) = entry.metadata().await
                && meta.is_file()
            {
                let is_public = std::path::Path::new(&name)
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("pub"));
                files.push(SshKeyFile {
                    path: entry.path().to_string_lossy().to_string(),
                    name,
                    is_public,
                });
            }
        }
    }
    // Sort: private keys first, then public
    files.sort_by(|a, b| a.is_public.cmp(&b.is_public).then(a.name.cmp(&b.name)));
    Json(ApiResponse::ok(files))
}

// --- Shell Detection ---

/// Detected shell info.
#[derive(serde::Serialize)]
struct DetectedShell {
    name: String,
    path: String,
    is_default: bool,
}

/// Detect available shells on the local system.
async fn detect_shells() -> impl IntoResponse {
    let mut shells: Vec<DetectedShell> = Vec::new();
    let current_shell = std::env::var("SHELL").unwrap_or_default();

    // On macOS/Linux, parse /etc/shells
    if let Ok(content) = tokio::fs::read_to_string("/etc/shells").await {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            let path = std::path::Path::new(trimmed);
            if path.exists() {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let is_default = trimmed == current_shell;
                // Deduplicate: if this name already exists, only override if this path is the default
                if let Some(existing) = shells.iter_mut().find(|s| s.name == name) {
                    if is_default {
                        existing.path = trimmed.to_string();
                        existing.is_default = true;
                    }
                } else {
                    shells.push(DetectedShell {
                        name,
                        path: trimmed.to_string(),
                        is_default,
                    });
                }
            }
        }
    }

    // If no shells found (e.g. /etc/shells not available), try common paths
    if shells.is_empty() {
        let common = ["/bin/bash", "/bin/sh", "/bin/zsh", "/usr/bin/fish", "/usr/local/bin/fish"];
        for path_str in &common {
            let path = std::path::Path::new(path_str);
            if path.exists() {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if shells.iter().any(|s| s.name == name) {
                    continue;
                }
                let is_default = *path_str == current_shell;
                shells.push(DetectedShell {
                    name,
                    path: path_str.to_string(),
                    is_default,
                });
            }
        }
    }

    // Ensure the default shell is marked
    if !shells.iter().any(|s| s.is_default)
        && let Some(first) = shells.first_mut() {
            first.is_default = true;
        }

    Json(ApiResponse::ok(shells))
}
