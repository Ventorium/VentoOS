use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::middleware;
use axum::response::{Html, IntoResponse};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use rust_embed::Embed;

use crate::auth;
use crate::shell;
use crate::state::AppState;
use crate::websocket;
use ventoos_core::connection::{CreateConnectionRequest, UpdateConnectionRequest};
use ventoos_core::process::CreateProcessRequest;
use ventoos_core::ssh::{
    CreatePortMappingRequest, CreateServiceExposureRequest, CreateSshServerRequest,
    UpdateSshServerRequest,
};
use ventoos_core::task::CreateTaskRequest;
use ventoos_core::types::{ApiResponse, Id};

/// Embedded frontend assets (from vite build output).
#[derive(Embed)]
#[folder = "../../../web/dist/"]
struct FrontendAssets;

/// Create the application router.
pub fn create_router(state: AppState) -> Router {
    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/auth/status", get(auth::auth_status))
        .route("/api/auth/setup", post(auth::auth_setup))
        .route("/api/auth/login", post(auth::auth_login))
        .with_state(state.auth.clone());

    // Protected routes (auth required)
    let protected_routes = Router::new()
        // Auth management
        .route("/api/auth/logout", post(auth::auth_logout))
        .route(
            "/api/auth/change-password",
            post(auth::auth_change_password),
        )
        .with_state(state.auth.clone());

    // System-level protected API routes
    let system_routes = Router::new()
        // Process routes
        .route("/api/processes", get(list_processes).post(create_process))
        .route("/api/processes/{pid}", delete(terminate_process))
        .route("/api/processes/{pid}/suspend", post(suspend_process))
        .route("/api/processes/{pid}/resume", post(resume_process))
        // Connection routes
        .route(
            "/api/connections",
            get(list_connections).post(create_connection),
        )
        .route(
            "/api/connections/{id}",
            get(get_connection)
                .put(update_connection)
                .delete(delete_connection),
        )
        .route("/api/connections/{id}/test", post(test_connection))
        // Task routes
        .route("/api/tasks", get(list_tasks).post(create_task))
        .route("/api/tasks/{id}", get(get_task))
        .route("/api/tasks/{id}/cancel", post(cancel_task))
        // Notification routes
        .route("/api/notifications", get(list_notifications))
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
        // Settings routes
        .route(
            "/api/settings/desktop",
            get(get_desktop_state).put(save_desktop_state),
        )
        .route(
            "/api/settings/windows",
            get(get_window_states).put(save_window_states),
        )
        // SSH config import & key file listing
        .route("/api/ssh/config-hosts", get(list_ssh_config_hosts))
        .route("/api/ssh/key-files", get(list_ssh_key_files))
        // Local filesystem browser (system capability for path picker)
        .route("/api/fs/browse", get(browse_local_fs))
        // WebSocket (task events)
        .route("/ws", get(websocket::ws_handler))
        // WebShell WebSocket
        .route("/ws/shell", get(shell::ws_shell_handler))
        .with_state(state.clone());

    // Start with system routes (Router<()>), then merge plugin routes (also Router<()>)
    let mut protected_api = system_routes;
    for plugin in state.plugins.iter() {
        protected_api = protected_api.merge(plugin.routes());
    }

    let protected_api = protected_api.route_layer(middleware::from_fn_with_state(
        state.auth.clone(),
        auth::auth_middleware,
    ));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .merge(protected_api)
        .fallback(frontend_handler)
}

// --- Health Check ---

async fn health_check() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::ok(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    })))
}

// --- Connection Routes ---

async fn list_connections(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_core::connection::Connection>>> {
    let connections = state.connections.list().await;
    Json(ApiResponse::ok(connections))
}

async fn create_connection(
    State(state): State<AppState>,
    Json(req): Json<CreateConnectionRequest>,
) -> (
    StatusCode,
    Json<ApiResponse<ventoos_core::connection::Connection>>,
) {
    let conn = state.connections.create(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(conn)))
}

async fn get_connection(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.connections.get(id).await {
        Some(conn) => Json(ApiResponse::ok(conn)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Connection not found")),
        )
            .into_response(),
    }
}

async fn update_connection(
    State(state): State<AppState>,
    Path(id): Path<Id>,
    Json(req): Json<UpdateConnectionRequest>,
) -> impl IntoResponse {
    match state.connections.update(id, req).await {
        Some(conn) => Json(ApiResponse::ok(conn)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Connection not found")),
        )
            .into_response(),
    }
}

async fn delete_connection(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    if state.connections.delete(id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Connection not found")),
        )
            .into_response()
    }
}

async fn test_connection(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.connections.test_connection(id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Connection not found")),
        )
            .into_response(),
    }
}

// --- Task Routes ---

async fn list_tasks(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_core::task::Task>>> {
    let tasks = state.tasks.list_tasks().await;
    Json(ApiResponse::ok(tasks))
}

async fn create_task(
    State(state): State<AppState>,
    Json(req): Json<CreateTaskRequest>,
) -> (StatusCode, Json<ApiResponse<ventoos_core::task::Task>>) {
    let task = state.tasks.create_task(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(task)))
}

async fn get_task(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.tasks.get_task(id).await {
        Some(task) => Json(ApiResponse::ok(task)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Task not found")),
        )
            .into_response(),
    }
}

async fn cancel_task(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.tasks.cancel_task(id).await {
        Some(task) => Json(ApiResponse::ok(task)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Task not found")),
        )
            .into_response(),
    }
}

// --- Notification Routes ---

async fn list_notifications() -> Json<ApiResponse<Vec<ventoos_core::notification::Notification>>> {
    // Stub - return empty list for now
    Json(ApiResponse::ok(vec![]))
}

// --- SSH Server Routes ---

async fn list_ssh_servers(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_core::ssh::SshServer>>> {
    let servers = state.ssh.list_servers().await;
    Json(ApiResponse::ok(servers))
}

async fn create_ssh_server(
    State(state): State<AppState>,
    Json(req): Json<CreateSshServerRequest>,
) -> (StatusCode, Json<ApiResponse<ventoos_core::ssh::SshServer>>) {
    let server = state.ssh.create_server(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(server)))
}

async fn get_ssh_server(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.ssh.get_server(id).await {
        Some(server) => Json(ApiResponse::ok(server)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response(),
    }
}

async fn update_ssh_server(
    State(state): State<AppState>,
    Path(id): Path<Id>,
    Json(req): Json<UpdateSshServerRequest>,
) -> impl IntoResponse {
    match state.ssh.update_server(id, req).await {
        Some(server) => Json(ApiResponse::ok(server)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response(),
    }
}

async fn delete_ssh_server(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    if state.ssh.delete_server(id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response()
    }
}

async fn test_ssh_server(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.ssh.test_server(id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("SSH server not found")),
        )
            .into_response(),
    }
}

// --- Port Mapping Routes ---

async fn list_port_mappings(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_core::ssh::PortMapping>>> {
    let mappings = state.ssh.list_port_mappings().await;
    Json(ApiResponse::ok(mappings))
}

async fn create_port_mapping(
    State(state): State<AppState>,
    Json(req): Json<CreatePortMappingRequest>,
) -> (
    StatusCode,
    Json<ApiResponse<ventoos_core::ssh::PortMapping>>,
) {
    let mapping = state.ssh.create_port_mapping(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(mapping)))
}

async fn get_port_mapping(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.ssh.get_port_mapping(id).await {
        Some(mapping) => Json(ApiResponse::ok(mapping)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Port mapping not found")),
        )
            .into_response(),
    }
}

async fn delete_port_mapping(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    if state.ssh.delete_port_mapping(id).await {
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
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.ssh.start_port_mapping(id).await {
        Some(mapping) => Json(ApiResponse::ok(mapping)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Port mapping not found")),
        )
            .into_response(),
    }
}

async fn stop_port_mapping(State(state): State<AppState>, Path(id): Path<Id>) -> impl IntoResponse {
    match state.ssh.stop_port_mapping(id).await {
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
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_core::ssh::ServiceExposure>>> {
    let exposures = state.ssh.list_service_exposures().await;
    Json(ApiResponse::ok(exposures))
}

async fn create_service_exposure(
    State(state): State<AppState>,
    Json(req): Json<CreateServiceExposureRequest>,
) -> (
    StatusCode,
    Json<ApiResponse<ventoos_core::ssh::ServiceExposure>>,
) {
    let exposure = state.ssh.create_service_exposure(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(exposure)))
}

async fn get_service_exposure(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.ssh.get_service_exposure(id).await {
        Some(exposure) => Json(ApiResponse::ok(exposure)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Service exposure not found")),
        )
            .into_response(),
    }
}

async fn delete_service_exposure(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    if state.ssh.delete_service_exposure(id).await {
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
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.ssh.start_service_exposure(id).await {
        Some(exposure) => Json(ApiResponse::ok(exposure)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Service exposure not found")),
        )
            .into_response(),
    }
}

async fn stop_service_exposure(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.ssh.stop_service_exposure(id).await {
        Some(exposure) => Json(ApiResponse::ok(exposure)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Service exposure not found")),
        )
            .into_response(),
    }
}

// --- Settings Routes ---

async fn get_desktop_state() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::ok(serde_json::json!({
        "wallpaper": "/wallpapers/default.jpg",
        "theme": "auto",
    })))
}

async fn save_desktop_state(
    Json(_body): Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::ok(serde_json::json!({"saved": true})))
}

async fn get_window_states() -> Json<ApiResponse<Vec<ventoos_core::window::WindowState>>> {
    Json(ApiResponse::ok(vec![]))
}

async fn save_window_states(
    Json(_body): Json<Vec<ventoos_core::window::WindowState>>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::ok(serde_json::json!({"saved": true})))
}

// --- Frontend Fallback ---

async fn frontend_handler(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');

    // Try exact file match first
    if let Some(file) = FrontendAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
            file.data.into_owned(),
        )
            .into_response();
    }

    // SPA fallback: serve index.html for all other paths
    match FrontendAssets::get("index.html") {
        Some(file) => Html(String::from_utf8_lossy(&file.data).to_string()).into_response(),
        None => (StatusCode::OK, Html("<h1>VentoOS</h1><p>Frontend not built yet. Run <code>cd web && pnpm build</code> first.</p>".to_string())).into_response(),
    }
}

// --- Process Routes ---

async fn list_processes(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_core::process::VProcess>>> {
    let processes = state.processes.list().await;
    Json(ApiResponse::ok(processes))
}

async fn create_process(
    State(state): State<AppState>,
    Json(req): Json<CreateProcessRequest>,
) -> (
    StatusCode,
    Json<ApiResponse<ventoos_core::process::CreateProcessResponse>>,
) {
    let proc = state.processes.create(req).await;
    let response = ventoos_core::process::CreateProcessResponse { pid: proc.pid };
    (StatusCode::CREATED, Json(ApiResponse::ok(response)))
}

async fn terminate_process(
    State(state): State<AppState>,
    Path(pid): Path<u32>,
) -> Json<ApiResponse<()>> {
    state.processes.terminate(pid).await;
    Json(ApiResponse::ok(()))
}

async fn suspend_process(
    State(state): State<AppState>,
    Path(pid): Path<u32>,
) -> Json<ApiResponse<()>> {
    state.processes.suspend(pid).await;
    Json(ApiResponse::ok(()))
}

async fn resume_process(
    State(state): State<AppState>,
    Path(pid): Path<u32>,
) -> Json<ApiResponse<()>> {
    state.processes.resume(pid).await;
    Json(ApiResponse::ok(()))
}

// --- SSH Config Import & Key Files ---

/// Parsed SSH config host entry
#[derive(serde::Serialize)]
struct SshConfigHost {
    alias: String,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
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
                    if let Some(entry) = current.take() {
                        if !entry.alias.contains('*') {
                            hosts.push(entry);
                        }
                    }
                    let alias = trimmed[5..].trim().to_string();
                    current = Some(SshConfigHost {
                        alias,
                        hostname: None,
                        user: None,
                        port: None,
                        identity_file: None,
                    });
                } else if let Some(entry) = current.as_mut() {
                    // Parse key-value (split at first whitespace or '=')
                    let value = if let Some(pos) = trimmed.find(|c: char| c == ' ' || c == '=') {
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
                        let expanded = if value.starts_with("~/") {
                            format!("{}/{}", home, &value[2..])
                        } else {
                            value
                        };
                        entry.identity_file = Some(expanded);
                    }
                }
            }
            // Don't forget the last entry
            if let Some(entry) = current.take() {
                if !entry.alias.contains('*') {
                    hosts.push(entry);
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
            if let Ok(meta) = entry.metadata().await {
                if meta.is_file() {
                    let is_public = name.ends_with(".pub");
                    files.push(SshKeyFile {
                        path: entry.path().to_string_lossy().to_string(),
                        name,
                        is_public,
                    });
                }
            }
        }
    }
    // Sort: private keys first, then public
    files.sort_by(|a, b| a.is_public.cmp(&b.is_public).then(a.name.cmp(&b.name)));
    Json(ApiResponse::ok(files))
}

// ─── Local filesystem browse (system capability) ────────────────────────────

#[derive(serde::Deserialize)]
struct FsBrowseQuery {
    path: Option<String>,
    /// If true, only return directories
    dirs_only: Option<bool>,
}

#[derive(serde::Serialize)]
struct LocalFsNode {
    name: String,
    path: String,
    is_dir: bool,
    size: Option<u64>,
    modified: Option<String>,
}

async fn browse_local_fs(Query(query): Query<FsBrowseQuery>) -> impl IntoResponse {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    let raw_path = query.path.unwrap_or_else(|| home.clone());
    let dirs_only = query.dirs_only.unwrap_or(false);

    // Expand ~ to home directory
    let expanded = if raw_path == "~" || raw_path.starts_with("~/") {
        raw_path.replacen('~', &home, 1)
    } else {
        raw_path.clone()
    };

    let target = std::path::Path::new(&expanded);

    if !target.exists() || !target.is_dir() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<Vec<LocalFsNode>>::err(
                "Path does not exist or is not a directory",
            )),
        )
            .into_response();
    }

    let mut nodes: Vec<LocalFsNode> = Vec::new();

    match tokio::fs::read_dir(target).await {
        Ok(mut entries) => {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                // Skip hidden files/dirs
                if name.starts_with('.') {
                    continue;
                }
                if let Ok(meta) = entry.metadata().await {
                    let is_dir = meta.is_dir();
                    if dirs_only && !is_dir {
                        continue;
                    }
                    let size = if !is_dir { Some(meta.len()) } else { None };
                    let modified = meta.modified().ok().map(|t| {
                        let dt: chrono::DateTime<chrono::Utc> = t.into();
                        dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
                    });
                    nodes.push(LocalFsNode {
                        name,
                        path: entry.path().to_string_lossy().to_string(),
                        is_dir,
                        size,
                        modified,
                    });
                }
            }
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Vec<LocalFsNode>>::err(&e.to_string())),
            )
                .into_response();
        }
    }

    // Sort: directories first, then files, both alphabetically
    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Json(ApiResponse::ok(nodes)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn test_app() -> Router {
        let state = AppState::new_test().unwrap();
        create_router(state)
    }

    #[tokio::test]
    async fn test_health_check() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_list_connections_empty() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/connections")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_list_tasks_empty() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/tasks")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_frontend_fallback() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/nonexistent")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Should return 200 (SPA fallback or placeholder)
        assert_eq!(response.status(), StatusCode::OK);
    }
}
