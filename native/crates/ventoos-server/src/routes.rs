use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::middleware;
use axum::response::{Html, IntoResponse};
use axum::routing::{delete, get, post, put};
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

    let protected_api = Router::new()
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
        // Database routes
        .route(
            "/api/db/connections",
            get(list_db_connections).post(create_db_connection),
        )
        .route(
            "/api/db/connections/{id}",
            get(get_db_connection).delete(delete_db_connection),
        )
        .route("/api/db/connections/{id}/test", post(test_db_connection))
        .route("/api/db/connections/{id}/connect", post(connect_db))
        .route("/api/db/connections/{id}/disconnect", post(disconnect_db))
        .route("/api/db/connections/{id}/schemas", get(list_db_schemas))
        .route(
            "/api/db/connections/{id}/tables/{table}/structure",
            get(get_db_table_structure),
        )
        .route(
            "/api/db/connections/{id}/tables/{table}/data",
            get(get_db_table_data),
        )
        .route("/api/db/connections/{id}/query", post(execute_db_sql))
        // Redis routes
        .route(
            "/api/redis/connections",
            get(list_redis_connections).post(create_redis_connection),
        )
        .route(
            "/api/redis/connections/{id}",
            get(get_redis_connection).delete(delete_redis_connection),
        )
        .route(
            "/api/redis/connections/{id}/test",
            post(test_redis_connection),
        )
        .route("/api/redis/connections/{id}/connect", post(connect_redis))
        .route(
            "/api/redis/connections/{id}/disconnect",
            post(disconnect_redis),
        )
        .route("/api/redis/connections/{id}/scan", get(scan_redis_keys))
        .route(
            "/api/redis/connections/{id}/keys/{key}",
            get(get_redis_key).delete(delete_redis_key),
        )
        .route("/api/redis/connections/{id}/keys", post(set_redis_key))
        .route(
            "/api/redis/connections/{id}/command",
            post(execute_redis_command),
        )
        .route(
            "/api/redis/connections/{id}/info",
            get(get_redis_server_info),
        )
        // K8s routes
        .route(
            "/api/k8s/clusters",
            get(list_k8s_clusters).post(create_k8s_cluster),
        )
        .route(
            "/api/k8s/clusters/{id}",
            get(get_k8s_cluster).delete(delete_k8s_cluster),
        )
        .route("/api/k8s/clusters/{id}/test", post(test_k8s_cluster))
        .route(
            "/api/k8s/clusters/{id}/namespaces",
            get(list_k8s_namespaces),
        )
        .route("/api/k8s/clusters/{id}/resources", get(list_k8s_resources))
        .route("/api/k8s/kubeconfig/parse", post(parse_kubeconfig))
        // VFS routes
        .route(
            "/api/vfs/mounts",
            get(list_vfs_mounts).post(create_vfs_mount),
        )
        .route(
            "/api/vfs/mounts/{id}",
            get(get_vfs_mount).delete(delete_vfs_mount),
        )
        .route("/api/vfs/mounts/{id}/ls", get(list_vfs_dir))
        .route("/api/vfs/mounts/{id}/read", get(read_vfs_file))
        // Agent routes
        .route("/api/agent/sessions", get(list_agent_sessions))
        .route(
            "/api/agent/sessions/{id}",
            get(get_agent_session).delete(delete_agent_session),
        )
        .route("/api/agent/chat", post(agent_chat))
        .route(
            "/api/agent/config",
            get(get_agent_config).put(update_agent_config),
        )
        // SSH config import
        .route("/api/ssh/config-aliases", get(list_ssh_config_aliases))
        // WebSocket (task events)
        .route("/ws", get(websocket::ws_handler))
        // WebShell WebSocket
        .route("/ws/shell", get(shell::ws_shell_handler))
        .route_layer(middleware::from_fn_with_state(
            state.auth.clone(),
            auth::auth_middleware,
        ))
        .with_state(state);

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

// --- Database Routes ---

async fn list_db_connections(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_db::DbConnectionConfig>>> {
    let list = state.db_manager.list_connections().await;
    Json(ApiResponse::ok(list))
}

async fn create_db_connection(
    State(state): State<AppState>,
    Json(req): Json<ventoos_db::CreateDbConnectionReq>,
) -> (
    StatusCode,
    Json<ApiResponse<ventoos_db::DbConnectionConfig>>,
) {
    let conn = state.db_manager.create_connection(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(conn)))
}

async fn get_db_connection(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.db_manager.get_connection(&id).await {
        Some(conn) => Json(ApiResponse::ok(conn)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("DB connection not found")),
        )
            .into_response(),
    }
}

async fn delete_db_connection(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if state.db_manager.delete_connection(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("DB connection not found")),
        )
            .into_response()
    }
}

async fn test_db_connection(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.db_manager.test_connection(&id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("DB connection not found")),
        )
            .into_response(),
    }
}

async fn connect_db(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.db_manager.connect(&id).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"connected": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn disconnect_db(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    state.db_manager.disconnect(&id).await;
    Json(ApiResponse::ok(serde_json::json!({"disconnected": true})))
}

async fn list_db_schemas(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.db_manager.list_schemas(&id).await {
        Ok(schemas) => Json(ApiResponse::ok(schemas)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn get_db_table_structure(
    State(state): State<AppState>,
    Path((id, table)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.db_manager.table_structure(&id, None, &table).await {
        Ok(structure) => Json(ApiResponse::ok(structure)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct TableDataQuery {
    page: Option<u32>,
    page_size: Option<u32>,
    order_by: Option<String>,
    order_dir: Option<String>,
    filter: Option<String>,
}

async fn get_db_table_data(
    State(state): State<AppState>,
    Path((id, table)): Path<(String, String)>,
    Query(query): Query<TableDataQuery>,
) -> impl IntoResponse {
    let req = ventoos_db::TableDataReq {
        schema: None,
        table,
        page: query.page.unwrap_or(1),
        page_size: query.page_size.unwrap_or(50),
        order_by: query.order_by,
        order_dir: query.order_dir,
        filter: query.filter,
    };
    match state.db_manager.table_data(&id, &req).await {
        Ok(data) => Json(ApiResponse::ok(data)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct SqlBody {
    sql: String,
}

async fn execute_db_sql(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SqlBody>,
) -> impl IntoResponse {
    match state.db_manager.execute_sql(&id, &body.sql).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// --- Redis Routes ---

async fn list_redis_connections(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_redis::RedisConnectionConfig>>> {
    let list = state.redis_manager.list_connections().await;
    Json(ApiResponse::ok(list))
}

async fn create_redis_connection(
    State(state): State<AppState>,
    Json(req): Json<ventoos_redis::CreateRedisConnectionReq>,
) -> (
    StatusCode,
    Json<ApiResponse<ventoos_redis::RedisConnectionConfig>>,
) {
    let conn = state.redis_manager.create_connection(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(conn)))
}

async fn get_redis_connection(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.redis_manager.get_connection(&id).await {
        Some(conn) => Json(ApiResponse::ok(conn)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Redis connection not found")),
        )
            .into_response(),
    }
}

async fn delete_redis_connection(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if state.redis_manager.delete_connection(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Redis connection not found")),
        )
            .into_response()
    }
}

async fn test_redis_connection(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.redis_manager.test_connection(&id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Redis connection not found")),
        )
            .into_response(),
    }
}

async fn connect_redis(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.redis_manager.connect(&id).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"connected": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn disconnect_redis(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    state.redis_manager.disconnect(&id).await;
    Json(ApiResponse::ok(serde_json::json!({"disconnected": true})))
}

#[derive(serde::Deserialize)]
struct RedisScanQuery {
    cursor: Option<String>,
    pattern: Option<String>,
    count: Option<u32>,
    key_type: Option<String>,
}

async fn scan_redis_keys(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<RedisScanQuery>,
) -> impl IntoResponse {
    let req = ventoos_redis::RedisScanReq {
        cursor: query.cursor.unwrap_or_else(|| "0".into()),
        pattern: query.pattern,
        count: query.count,
        key_type: query.key_type,
    };
    match state.redis_manager.scan_keys(&id, &req).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn get_redis_key(
    State(state): State<AppState>,
    Path((id, key)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.redis_manager.get_key_value(&id, &key).await {
        Ok(val) => Json(ApiResponse::ok(val)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn delete_redis_key(
    State(state): State<AppState>,
    Path((id, key)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.redis_manager.delete_key(&id, &key).await {
        Ok(deleted) => {
            Json(ApiResponse::ok(serde_json::json!({"deleted": deleted}))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct RedisSetKeyBody {
    key: String,
    value: String,
    ttl: Option<i64>,
}

async fn set_redis_key(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RedisSetKeyBody>,
) -> impl IntoResponse {
    match state
        .redis_manager
        .set_key(&id, &body.key, &body.value, body.ttl)
        .await
    {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"ok": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct RedisCommandBody {
    command: String,
}

async fn execute_redis_command(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RedisCommandBody>,
) -> impl IntoResponse {
    match state
        .redis_manager
        .execute_command(&id, &body.command)
        .await
    {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn get_redis_server_info(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.redis_manager.server_info(&id).await {
        Ok(info) => Json(ApiResponse::ok(info)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// --- K8s Routes ---

async fn list_k8s_clusters(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_k8s::K8sCluster>>> {
    let list = state.k8s_manager.list_clusters().await;
    Json(ApiResponse::ok(list))
}

async fn create_k8s_cluster(
    State(state): State<AppState>,
    Json(req): Json<ventoos_k8s::CreateK8sClusterReq>,
) -> (StatusCode, Json<ApiResponse<ventoos_k8s::K8sCluster>>) {
    let cluster = state.k8s_manager.create_cluster(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(cluster)))
}

async fn get_k8s_cluster(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.k8s_manager.get_cluster(&id).await {
        Some(cluster) => Json(ApiResponse::ok(cluster)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response(),
    }
}

async fn delete_k8s_cluster(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if state.k8s_manager.delete_cluster(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response()
    }
}

async fn test_k8s_cluster(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.k8s_manager.test_cluster(&id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response(),
    }
}

async fn list_k8s_namespaces(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.k8s_manager.list_namespaces(&id).await {
        Ok(ns) => Json(ApiResponse::ok(ns)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct K8sResourceQuery {
    namespace: Option<String>,
    kind: String,
    label_selector: Option<String>,
}

async fn list_k8s_resources(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<K8sResourceQuery>,
) -> impl IntoResponse {
    let kind: ventoos_k8s::K8sResourceKind =
        serde_json::from_value(serde_json::Value::String(query.kind.to_lowercase()))
            .unwrap_or(ventoos_k8s::K8sResourceKind::Pod);
    let req = ventoos_k8s::K8sResourceListReq {
        cluster_id: id,
        namespace: query.namespace,
        kind,
        label_selector: query.label_selector,
    };
    match state.k8s_manager.list_resources(&req).await {
        Ok(resources) => Json(ApiResponse::ok(resources)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct KubeconfigParseBody {
    path: Option<String>,
    content: Option<String>,
}

async fn parse_kubeconfig(
    State(state): State<AppState>,
    Json(body): Json<KubeconfigParseBody>,
) -> impl IntoResponse {
    let result = if let Some(ref path) = body.path {
        state.k8s_manager.parse_kubeconfig_contexts(path).await
    } else if let Some(ref content) = body.content {
        ventoos_k8s::K8sManager::parse_kubeconfig_yaml(content)
    } else {
        Err("Either path or content is required".into())
    };
    match result {
        Ok(contexts) => Json(ApiResponse::ok(contexts)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// --- VFS Routes ---

async fn list_vfs_mounts(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_vfs::VfsMount>>> {
    let list = state.vfs_manager.list_mounts().await;
    Json(ApiResponse::ok(list))
}

async fn create_vfs_mount(
    State(state): State<AppState>,
    Json(req): Json<ventoos_vfs::CreateVfsMountReq>,
) -> (StatusCode, Json<ApiResponse<ventoos_vfs::VfsMount>>) {
    let mount = state.vfs_manager.create_mount(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(mount)))
}

async fn get_vfs_mount(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.vfs_manager.get_mount(&id).await {
        Some(mount) => Json(ApiResponse::ok(mount)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Mount not found")),
        )
            .into_response(),
    }
}

async fn delete_vfs_mount(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if state.vfs_manager.delete_mount(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Mount not found")),
        )
            .into_response()
    }
}

#[derive(serde::Deserialize)]
struct VfsPathQuery {
    path: Option<String>,
}

async fn list_vfs_dir(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<VfsPathQuery>,
) -> impl IntoResponse {
    let req = ventoos_vfs::VfsListReq {
        mount_id: id,
        path: query.path.unwrap_or_else(|| "/".into()),
    };
    match state.vfs_manager.list_dir(&req).await {
        Ok(nodes) => Json(ApiResponse::ok(nodes)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct VfsReadQuery {
    path: String,
    max_bytes: Option<u64>,
}

async fn read_vfs_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<VfsReadQuery>,
) -> impl IntoResponse {
    let req = ventoos_vfs::VfsReadReq {
        mount_id: id,
        path: query.path,
        max_bytes: query.max_bytes,
    };
    match state.vfs_manager.read_file(&req).await {
        Ok(content) => Json(ApiResponse::ok(content)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// --- Agent Routes ---

async fn list_agent_sessions(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_agent::ChatSession>>> {
    let sessions = state.agent_manager.list_sessions().await;
    Json(ApiResponse::ok(sessions))
}

async fn get_agent_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.agent_manager.get_session(&id).await {
        Some(session) => Json(ApiResponse::ok(session)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Session not found")),
        )
            .into_response(),
    }
}

async fn delete_agent_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if state.agent_manager.delete_session(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Session not found")),
        )
            .into_response()
    }
}

async fn agent_chat(
    State(state): State<AppState>,
    Json(req): Json<ventoos_agent::ChatRequest>,
) -> impl IntoResponse {
    match state.agent_manager.chat(req).await {
        Ok(resp) => Json(ApiResponse::ok(resp)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(&e)),
        )
            .into_response(),
    }
}

async fn get_agent_config(
    State(state): State<AppState>,
) -> Json<ApiResponse<ventoos_agent::AgentConfig>> {
    let config = state.agent_manager.get_config().await;
    Json(ApiResponse::ok(config))
}

async fn update_agent_config(
    State(state): State<AppState>,
    Json(config): Json<ventoos_agent::AgentConfig>,
) -> Json<ApiResponse<serde_json::Value>> {
    state.agent_manager.update_config(config).await;
    Json(ApiResponse::ok(serde_json::json!({"updated": true})))
}

// --- SSH Config Import ---

async fn list_ssh_config_aliases() -> impl IntoResponse {
    // Parse ~/.ssh/config for Host aliases
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let config_path = std::path::Path::new(&home).join(".ssh/config");
    match tokio::fs::read_to_string(&config_path).await {
        Ok(content) => {
            let mut aliases = Vec::new();
            for line in content.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("Host ") {
                    let host = rest.trim();
                    // Skip wildcards
                    if !host.contains('*') && !host.is_empty() {
                        aliases.push(host.to_string());
                    }
                }
            }
            Json(ApiResponse::ok(aliases)).into_response()
        }
        Err(_) => Json(ApiResponse::ok(Vec::<String>::new())).into_response(),
    }
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
