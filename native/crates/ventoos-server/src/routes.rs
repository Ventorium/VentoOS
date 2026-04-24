use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::middleware;
use axum::response::{Html, IntoResponse};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use chrono::NaiveDate;
use rust_embed::Embed;
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex;

use crate::auth;
use crate::deps;
use crate::monitor;
use crate::process_killer;
use crate::shell;
use crate::state::AppState;
use crate::webdav;
use crate::websocket;
use ventoos_core::process::CreateProcessRequest;
use ventoos_core::task::CreateTaskRequest;
use ventoos_core::types::{ApiResponse, Id};

/// Embedded frontend assets (from vite build output).
#[derive(Embed)]
#[folder = "../../../web/dist/"]
struct FrontendAssets;

// ─── Bing Wallpaper Daily Cache ───────────────────────────────────────────

struct BingCache {
    date: NaiveDate,
    urls: Vec<String>,
}

static BING_CACHE: OnceLock<Arc<Mutex<Option<BingCache>>>> = OnceLock::new();

fn bing_cache() -> Arc<Mutex<Option<BingCache>>> {
    BING_CACHE
        .get_or_init(|| Arc::new(Mutex::new(None)))
        .clone()
}

async fn fetch_bing_wallpapers_from_api() -> anyhow::Result<Vec<String>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let resp = client
        .get("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=6&mkt=zh-CN")
        .send()
        .await?;
    let body: serde_json::Value = resp.json().await?;
    let images = body["images"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Bing API: missing 'images' field"))?;
    let urls = images
        .iter()
        .filter_map(|img| img["url"].as_str())
        .map(|url| {
            if url.starts_with("http") {
                url.to_string()
            } else {
                format!("https://www.bing.com{url}")
            }
        })
        .collect();
    Ok(urls)
}

async fn get_bing_wallpapers() -> impl IntoResponse {
    let cache = bing_cache();
    let mut guard = cache.lock().await;
    let today = chrono::Local::now().date_naive();

    if let Some(cached) = guard.as_ref()
        && cached.date == today {
            return Json(ApiResponse::ok(cached.urls.clone())).into_response();
        }

    match fetch_bing_wallpapers_from_api().await {
        Ok(urls) => {
            *guard = Some(BingCache {
                date: today,
                urls: urls.clone(),
            });
            Json(ApiResponse::ok(urls)).into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(ApiResponse::<Vec<String>>::err(format!(
                "Failed to fetch Bing wallpapers: {e}"
            ))),
        )
            .into_response(),
    }
}

/// Create the application router.
pub fn create_router(state: &AppState) -> Router {
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
        // Task routes
        .route("/api/tasks", get(list_tasks).post(create_task))
        .route("/api/tasks/{id}", get(get_task))
        .route("/api/tasks/{id}/cancel", post(cancel_task))
        // Notification routes
        .route("/api/notifications", get(list_notifications).post(create_notification))
        .route("/api/notifications/mark-all-read", post(mark_all_notifications_read))
        .route("/api/notifications/clear", post(clear_all_notifications))
        .route(
            "/api/notifications/{id}",
            get(get_notification).delete(delete_notification).put(mark_notification_read),
        )
        // Settings routes
        .route(
            "/api/settings/desktop",
            get(get_desktop_state).put(save_desktop_state),
        )
        .route(
            "/api/settings/windows",
            get(get_window_states)
                .post(create_window_state)
                .put(save_window_states),
        )
        .route(
            "/api/settings/windows/{id}",
            put(update_window_state).delete(delete_window_state),
        )
        .route(
            "/api/settings/system",
            get(get_system_settings).put(save_system_settings),
        )
        // Bing daily wallpapers (cached per-day)
        .route("/api/bing-wallpapers", get(get_bing_wallpapers))
        // Per-app storage routes
        .route("/api/storage/{app_id}", get(list_storage_keys))
        .route(
            "/api/storage/{app_id}/{key}",
            get(get_storage_value)
                .put(set_storage_value)
                .delete(delete_storage_value),
        )
        // Local filesystem browser (system capability for path picker)
        .route("/api/fs/browse", get(browse_local_fs))
        // Monitor routes
        .route("/api/monitor/system", get(monitor::get_system_metrics))
        .route("/api/monitor/process", get(monitor::get_process_metrics))
        .route("/api/monitor/network", get(monitor::get_network_info))
        // Process Killer routes
        .route("/api/process-killer/processes", get(process_killer::list_processes))
        .route("/api/process-killer/processes/by-port", get(process_killer::find_processes_by_port))
        .route("/api/process-killer/processes/{pid}/kill", post(process_killer::kill_process))
        // Local FUSE mount routes
        .route(
            "/api/vfs/mounts/{id}/local-mount",
            post(fuse_mount_handler).delete(fuse_unmount_handler).get(fuse_status_handler),
        )
        // WebSocket (task events)
        .route("/ws", get(websocket::ws_handler))
        // WebShell WebSocket
        .route("/ws/shell", get(shell::ws_shell_handler))
        // Dependency management routes (no state needed)
        .merge(deps::dependency_routes())
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

/// `WebDAV` routes — returned separately so callers can apply layers selectively.
/// These routes must NOT go through the CORS layer (CORS intercepts OPTIONS,
/// which breaks the DAV: header required by `mount_webdav`).
pub fn create_webdav_router(state: &AppState) -> Router {
    Router::new()
        // exact /dav/{id}  — no trailing slash
        .route(
            "/dav/{mount_id}",
            axum::routing::any(webdav::webdav_root_handler),
        )
        // /dav/{id}/  — trailing slash (Finder and mount_webdav add one)
        .route(
            "/dav/{mount_id}/",
            axum::routing::any(webdav::webdav_root_handler),
        )
        // /dav/{id}/some/path
        .route(
            "/dav/{mount_id}/{*path}",
            axum::routing::any(webdav::webdav_handler),
        )
        .with_state(state.clone())
}

// --- Health Check ---

async fn health_check() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::ok(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    })))
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

async fn list_notifications(State(state): State<AppState>) -> Json<ApiResponse<Vec<ventoos_core::notification::Notification>>> {
    match state.notification_mgr.list() {
        Ok(list) => Json(ApiResponse::ok(list)),
        Err(e) => Json(ApiResponse::err(format!("Failed to list notifications: {e}"))),
    }
}

async fn get_notification(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.notification_mgr.get(&id) {
        Ok(Some(n)) => Json(ApiResponse::ok(n)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Notification not found")),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(format!("Failed to get notification: {e}"))),
        )
            .into_response(),
    }
}

#[derive(serde::Deserialize)]
struct CreateNotificationRequest {
    title: String,
    message: String,
    level: Option<String>,
    source: Option<String>,
    dedup_key: Option<String>,
}

async fn create_notification(
    State(state): State<AppState>,
    Json(body): Json<CreateNotificationRequest>,
) -> impl IntoResponse {
    let level = match body.level.as_deref() {
        Some("success") => ventoos_core::notification::NotificationLevel::Success,
        Some("warning") => ventoos_core::notification::NotificationLevel::Warning,
        Some("error") => ventoos_core::notification::NotificationLevel::Error,
        _ => ventoos_core::notification::NotificationLevel::Info,
    };
    let source = match body.source.as_deref() {
        Some("connection") => ventoos_core::notification::NotificationSource::Connection,
        Some("task") => ventoos_core::notification::NotificationSource::Task,
        Some("agent") => ventoos_core::notification::NotificationSource::Agent,
        Some("app") => ventoos_core::notification::NotificationSource::App,
        _ => ventoos_core::notification::NotificationSource::System,
    };
    match state.notification_mgr.create(&body.title, &body.message, &level, &source, body.dedup_key.as_deref()) {
        Ok(id) => Json(ApiResponse::ok(serde_json::json!({ "id": id.to_string() }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(format!("Failed to create notification: {e}"))),
        )
            .into_response(),
    }
}

async fn mark_notification_read(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.notification_mgr.mark_read(&id) {
        Ok(true) => Json(ApiResponse::ok(serde_json::json!({ "marked": true }))).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Notification not found")),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(format!("Failed to mark as read: {e}"))),
        )
            .into_response(),
    }
}

async fn mark_all_notifications_read(State(state): State<AppState>) -> Json<ApiResponse<serde_json::Value>> {
    match state.notification_mgr.mark_all_read() {
        Ok(count) => Json(ApiResponse::ok(serde_json::json!({ "count": count }))),
        Err(e) => Json(ApiResponse::err(format!("Failed to mark all as read: {e}"))),
    }
}

async fn delete_notification(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.notification_mgr.delete(&id) {
        Ok(true) => Json(ApiResponse::ok(serde_json::json!({ "deleted": true }))).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Notification not found")),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(format!("Failed to delete notification: {e}"))),
        )
            .into_response(),
    }
}

async fn clear_all_notifications(State(state): State<AppState>) -> Json<ApiResponse<serde_json::Value>> {
    match state.notification_mgr.clear_all() {
        Ok(count) => Json(ApiResponse::ok(serde_json::json!({ "count": count }))),
        Err(e) => Json(ApiResponse::err(format!("Failed to clear notifications: {e}"))),
    }
}

// --- Settings Routes ---

async fn get_desktop_state(State(state): State<AppState>) -> Json<ApiResponse<serde_json::Value>> {
    let keys = &[
        "wallpaper",
        "theme_mode",
        "accent_color",
        "dock_icon_size",
        "dock_position",
        "dock_magnification",
        "dock_auto_hide",
    ];
    match state.settings_mgr.get_batch(keys) {
        Ok(settings) => {
            let result = serde_json::json!({
                "wallpaper": settings.get("wallpaper").unwrap_or(&"/wallpapers/dark-mountain.jpg".to_string()),
                "theme_mode": settings.get("theme_mode").unwrap_or(&"dark".to_string()),
                "accent_color": settings.get("accent_color").cloned(),
                "dock_icon_size": settings.get("dock_icon_size").and_then(|s| s.parse::<u32>().ok()).unwrap_or(48),
                "dock_position": settings.get("dock_position").unwrap_or(&"bottom".to_string()),
                "dock_magnification": settings.get("dock_magnification").is_none_or(|s| s == "true"),
                "dock_auto_hide": settings.get("dock_auto_hide").is_some_and(|s| s == "true"),
            });
            Json(ApiResponse::ok(result))
        }
        Err(e) => Json(ApiResponse::err(format!("Failed to load settings: {e}"))),
    }
}

async fn save_desktop_state(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    let kv_pairs: Vec<(&str, Option<String>)> = vec![
        (
            "wallpaper",
            body.get("wallpaper")
                .and_then(|v| v.as_str())
                .map(String::from),
        ),
        (
            "theme_mode",
            body.get("theme_mode")
                .and_then(|v| v.as_str())
                .map(String::from),
        ),
        (
            "accent_color",
            body.get("accent_color")
                .and_then(|v| v.as_str())
                .map(String::from),
        ),
        (
            "dock_icon_size",
            body.get("dock_icon_size")
                .and_then(serde_json::Value::as_u64)
                .map(|v| v.to_string()),
        ),
        (
            "dock_position",
            body.get("dock_position")
                .and_then(|v| v.as_str())
                .map(String::from),
        ),
        (
            "dock_magnification",
            body.get("dock_magnification")
                .and_then(serde_json::Value::as_bool)
                .map(|v| v.to_string()),
        ),
        (
            "dock_auto_hide",
            body.get("dock_auto_hide")
                .and_then(serde_json::Value::as_bool)
                .map(|v| v.to_string()),
        ),
    ];
    for (key, value) in kv_pairs {
        if let Some(val) = value
            && let Err(e) = state.settings_mgr.set(key, &val) {
                return Json(ApiResponse::err(format!(
                    "Failed to save setting '{key}': {e}"
                )));
            }
    }
    Json(ApiResponse::ok(serde_json::json!({"saved": true})))
}

async fn get_window_states(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<ventoos_core::window::WindowState>>> {
    match state.window_states.load_all() {
        Ok(states) => Json(ApiResponse::ok(states)),
        Err(e) => Json(ApiResponse::err(format!(
            "Failed to load window states: {e}"
        ))),
    }
}

async fn create_window_state(
    State(state): State<AppState>,
    Json(body): Json<ventoos_core::window::WindowState>,
) -> Json<ApiResponse<serde_json::Value>> {
    match state.window_states.save_one(&body) {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"id": body.id}))),
        Err(e) => Json(ApiResponse::err(format!(
            "Failed to create window state: {e}"
        ))),
    }
}

async fn save_window_states(
    State(state): State<AppState>,
    Json(body): Json<Vec<ventoos_core::window::WindowState>>,
) -> Json<ApiResponse<serde_json::Value>> {
    match state.window_states.save_all(&body) {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"saved": body.len()}))),
        Err(e) => Json(ApiResponse::err(format!(
            "Failed to save window states: {e}"
        ))),
    }
}

async fn update_window_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ventoos_core::window::WindowState>,
) -> Json<ApiResponse<serde_json::Value>> {
    match state.window_states.update_one(&id, &body) {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"updated": true}))),
        Err(e) => Json(ApiResponse::err(format!(
            "Failed to update window state: {e}"
        ))),
    }
}

async fn delete_window_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    match state.window_states.delete_one(&id) {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"deleted": true}))),
        Err(e) => Json(ApiResponse::err(format!(
            "Failed to delete window state: {e}"
        ))),
    }
}

// --- System Settings Routes (key-value for all settings panels) ---

/// All known system setting keys with defaults
const SYSTEM_SETTING_KEYS: &[&str] = &[
    "sound_alert_volume",
    "sound_notif_volume",
    "sound_alert_muted",
    "sound_notif_muted",
    "sound_alert_type",
    "sound_notif_type",
    "lockscreen_enabled",
    "lockscreen_idle_minutes",
    "location_enabled",
];

async fn get_system_settings(State(state): State<AppState>) -> Json<ApiResponse<serde_json::Value>> {
    match state.settings_mgr.get_batch(SYSTEM_SETTING_KEYS) {
        Ok(settings) => {
            let get_or = |key: &str, default: &str| -> String {
                settings.get(key).cloned().unwrap_or(default.to_string())
            };
            let get_bool = |key: &str, default: bool| -> bool {
                settings
                    .get(key)
                    .map_or(default, |s| s == "true")
            };
            let get_num = |key: &str, default: i64| -> i64 {
                settings
                    .get(key)
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or(default)
            };
            let result = serde_json::json!({
                "sound_alert_volume": get_num("sound_alert_volume", 80),
                "sound_notif_volume": get_num("sound_notif_volume", 60),
                "sound_alert_muted": get_bool("sound_alert_muted", false),
                "sound_notif_muted": get_bool("sound_notif_muted", false),
                "sound_alert_type": get_or("sound_alert_type", "default"),
                "sound_notif_type": get_or("sound_notif_type", "default"),
                "lockscreen_enabled": get_bool("lockscreen_enabled", true),
                "lockscreen_idle_minutes": get_num("lockscreen_idle_minutes", 5),
                "location_enabled": get_bool("location_enabled", false),
            });
            Json(ApiResponse::ok(result))
        }
        Err(e) => Json(ApiResponse::err(format!(
            "Failed to load system settings: {e}"
        ))),
    }
}

async fn save_system_settings(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    // Extract all string/number/boolean values from the JSON body
    if let Some(obj) = body.as_object() {
        for (key, value) in obj {
            let val_str = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                _ => continue,
            };
            if let Err(e) = state.settings_mgr.set(key, &val_str) {
                return Json(ApiResponse::err(format!(
                    "Failed to save setting '{key}': {e}"
                )));
            }
        }
    }
    Json(ApiResponse::ok(serde_json::json!({"saved": true})))
}

// --- Per-App Storage Routes ---

async fn list_storage_keys(
    State(state): State<AppState>,
    Path(app_id): Path<String>,
) -> Json<ApiResponse<Vec<String>>> {
    match state.storage.list_keys(&app_id) {
        Ok(keys) => Json(ApiResponse::ok(keys)),
        Err(e) => Json(ApiResponse::err(format!("Failed to list keys: {e}"))),
    }
}

async fn get_storage_value(
    State(state): State<AppState>,
    Path((app_id, key)): Path<(String, String)>,
) -> Json<ApiResponse<serde_json::Value>> {
    match state.storage.get_value(&app_id, &key) {
        Ok(Some(val)) => Json(ApiResponse::ok(
            serde_json::json!({ "key": key, "value": val }),
        )),
        Ok(None) => Json(ApiResponse::err(format!("Key '{key}' not found"))),
        Err(e) => Json(ApiResponse::err(format!("Failed to get value: {e}"))),
    }
}

async fn set_storage_value(
    State(state): State<AppState>,
    Path((app_id, key)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    let Some(value) = body.get("value").and_then(|v| v.as_str()) else {
        return Json(ApiResponse::err("Missing 'value' field".to_string()));
    };
    match state.storage.set_value(&app_id, &key, value) {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"saved": true}))),
        Err(e) => Json(ApiResponse::err(format!("Failed to set value: {e}"))),
    }
}

async fn delete_storage_value(
    State(state): State<AppState>,
    Path((app_id, key)): Path<(String, String)>,
) -> Json<ApiResponse<serde_json::Value>> {
    match state.storage.delete_value(&app_id, &key) {
        Ok(deleted) => Json(ApiResponse::ok(serde_json::json!({"deleted": deleted}))),
        Err(e) => Json(ApiResponse::err(format!("Failed to delete value: {e}"))),
    }
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
                    let size = if is_dir { None } else { Some(meta.len()) };
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
                Json(ApiResponse::<Vec<LocalFsNode>>::err(e.to_string())),
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

// ── Local FUSE Mount handlers ─────────────────────────────────────────────

async fn fuse_mount_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    // Look up mount to get the local_mount config
    let Some(mount) = state.vfs.get_mount(&id).await else {
        return (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("VFS mount not found")),
        )
            .into_response();
    };
    let Some(local_cfg) = mount.local_mount else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err("本地挂载未配置")),
        )
            .into_response();
    };
    if !local_cfg.enabled {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err("本地挂载未启用")),
        )
            .into_response();
    }
    let mount_name = mount.name.clone();
    match state
        .mount_mgr
        .mount(&id, &mount_name, &local_cfg, Arc::clone(&state.vfs))
        .await
    {
        Ok(()) => Json(ApiResponse::ok(
            serde_json::json!({"mounted": true, "mount_point": local_cfg.mount_point}),
        ))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn fuse_unmount_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.mount_mgr.unmount(&id).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"unmounted": true}))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn fuse_status_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    let payload = match state.mount_mgr.status(&id).await {
        ventoos_mount::MountStatus::Unmounted => {
            serde_json::json!({"mounted": false, "mount_point": null, "error": null})
        }
        ventoos_mount::MountStatus::Mounted { mount_point } => {
            serde_json::json!({"mounted": true, "mount_point": mount_point, "error": null})
        }
        ventoos_mount::MountStatus::Error { error } => {
            serde_json::json!({"mounted": false, "mount_point": null, "error": error})
        }
    };
    Json(ApiResponse::ok(payload))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn test_app() -> Router {
        let state = AppState::new_test().unwrap();
        create_router(&state)
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
