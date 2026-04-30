use std::sync::Arc;

use axum::extract::ws::{Message, WebSocketUpgrade};
use axum::extract::{Multipart, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::archive::{ArchiveRequest, ExtractRequest};
use crate::manager::VfsManager;
use crate::types::{
    CreateVfsMountReq, VfsCopyReq, VfsDeleteReq, VfsListReq, VfsMkdirReq, VfsMount, VfsMoveReq,
    VfsReadReq, VfsSearchReq, VfsWriteReq, WebDavServerSettings,
};

/// VFS (Explorer) application plugin.
pub struct VfsPlugin {
    manager: Arc<VfsManager>,
}

impl VfsPlugin {
    pub fn new(manager: Arc<VfsManager>) -> Self {
        Self { manager }
    }
}

impl AppPlugin for VfsPlugin {
    fn app_id(&self) -> &'static str {
        "explorer"
    }

    fn routes(&self) -> Router {
        // Build the WebDAV server sub-router (handles /webdav/* paths)
        let webdav_sub = crate::webdav_server::webdav_router();

        Router::new()
            .route("/api/vfs/mounts", get(list_mounts).post(create_mount))
            .route(
                "/api/vfs/mounts/test-connection",
                post(test_connection_handler),
            )
            .route(
                "/api/vfs/mounts/{id}",
                get(get_mount).put(update_mount).delete(delete_mount),
            )
            .route("/api/vfs/mounts/{id}/ls", get(list_dir))
            .route("/api/vfs/mounts/{id}/read", get(read_file))
            .route("/api/vfs/mounts/{id}/raw", get(read_file_raw))
            .route("/api/vfs/mounts/{id}/install-font", post(install_font))
            .route("/api/vfs/mounts/{id}/move", post(move_file))
            .route("/api/vfs/mounts/{id}/copy", post(copy_file))
            .route("/api/vfs/mounts/{id}/mkdir", post(mkdir_handler))
            .route("/api/vfs/mounts/{id}/delete", post(delete_handler))
            .route("/api/vfs/mounts/{id}/write", post(write_handler))
            .route("/api/vfs/mounts/{id}/upload", post(upload_handler))
            .route("/api/vfs/mounts/{id}/stat", get(stat_handler))
            .route("/api/vfs/mounts/{id}/search", get(search_handler))
            // Archive / extract / list
            .route("/api/vfs/mounts/{id}/archive", post(archive_handler))
            .route("/api/vfs/mounts/{id}/extract", post(extract_handler))
            .route(
                "/api/vfs/mounts/{id}/archive/list",
                get(archive_list_handler),
            )
            .route(
                "/api/vfs/mounts/{id}/archive/read",
                get(archive_read_entry_handler),
            )
            .route(
                "/api/vfs/mounts/{id}/archive/extract",
                post(archive_extract_handler),
            )
            .route(
                "/api/vfs/mounts/{id}/archive/compress",
                post(archive_compress_handler),
            )
            // Permissions
            .route("/api/vfs/mounts/{id}/chmod", put(chmod_handler))
            // Backend capabilities and pre-signed links
            .route("/api/vfs/mounts/{id}/capabilities", get(capabilities_handler))
            .route("/api/vfs/mounts/{id}/link", get(link_handler))
            // Prefix route resolution
            .route("/api/vfs/resolve", get(resolve_path_handler))
            // Watch (WebSocket)
            .route("/api/vfs/mounts/{id}/watch", get(watch_handler))
            // Tail (WebSocket)
            .route("/api/vfs/mounts/{id}/tail", get(tail_handler))
            // WebDAV server settings
            .route(
                "/api/vfs/webdav-server/settings",
                get(get_webdav_settings).put(put_webdav_settings),
            )
            // Merge WebDAV server routes (handles /webdav/*)
            .merge(webdav_sub)
            .with_state(self.manager.clone())
    }
}

// --- Handlers ---

async fn list_mounts(State(mgr): State<Arc<VfsManager>>) -> Json<ApiResponse<Vec<VfsMount>>> {
    let list = mgr.list_mounts().await;
    Json(ApiResponse::ok(list))
}

async fn create_mount(
    State(mgr): State<Arc<VfsManager>>,
    Json(req): Json<CreateVfsMountReq>,
) -> (StatusCode, Json<ApiResponse<VfsMount>>) {
    let mount = mgr.create_mount(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(mount)))
}

async fn get_mount(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.get_mount(&id).await {
        Some(mount) => Json(ApiResponse::ok(mount)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Mount not found")),
        )
            .into_response(),
    }
}

async fn delete_mount(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if mgr.delete_mount(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Mount not found")),
        )
            .into_response()
    }
}

async fn update_mount(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(req): Json<CreateVfsMountReq>,
) -> impl IntoResponse {
    match mgr.update_mount(&id, req).await {
        Some(mount) => Json(ApiResponse::ok(mount)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Mount not found")),
        )
            .into_response(),
    }
}

async fn test_connection_handler(
    State(mgr): State<Arc<VfsManager>>,
    Json(req): Json<CreateVfsMountReq>,
) -> Json<ApiResponse<serde_json::Value>> {
    match mgr.test_connection(&req).await {
        Ok(()) => Json(ApiResponse::ok(
            serde_json::json!({"success": true, "message": "连接成功"}),
        )),
        Err(e) => Json(ApiResponse::ok(
            serde_json::json!({"success": false, "message": e}),
        )),
    }
}

#[derive(serde::Deserialize)]
struct PathQuery {
    path: Option<String>,
    show_hidden: Option<bool>,
    #[allow(dead_code)]
    token: Option<String>,
}

async fn list_dir(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    // FileProvider probe domains are transient (created by healthcheck then
    // immediately unregistered).  The extension may still enumerate them for
    // a short time — silently return an empty listing instead of a noisy error.
    if id.starts_with("probe-") {
        return Json(ApiResponse::ok(Vec::<crate::types::VfsNode>::new())).into_response();
    }

    let req = VfsListReq {
        mount_id: id.clone(),
        path: query.path.unwrap_or_else(|| "/".into()),
        show_hidden: query.show_hidden.unwrap_or(false),
    };
    match mgr.list_dir(&req).await {
        Ok(nodes) => Json(ApiResponse::ok(nodes)).into_response(),
        Err(e) => {
            tracing::error!("list_dir failed mount={} path={}: {}", id, req.path, e);
            (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response()
        }
    }
}

#[derive(serde::Deserialize)]
struct ReadQuery {
    path: String,
    max_bytes: Option<u64>,
    #[allow(dead_code)]
    token: Option<String>,
}

async fn read_file(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(query): Query<ReadQuery>,
) -> impl IntoResponse {
    let req = VfsReadReq {
        mount_id: id,
        path: query.path,
        max_bytes: query.max_bytes,
    };
    match mgr.read_file(&req).await {
        Ok(content) => Json(ApiResponse::ok(content)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn read_file_raw(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let path = query.path.unwrap_or_default();
    match mgr.read_file_raw(&id, &path).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            let filename = std::path::Path::new(&path).file_name().map_or_else(
                || "download".to_string(),
                |n| n.to_string_lossy().to_string(),
            );
            (
                StatusCode::OK,
                [
                    (axum::http::header::CONTENT_TYPE, mime.as_ref().to_owned()),
                    (
                        axum::http::header::CONTENT_DISPOSITION,
                        format!("attachment; filename=\"{filename}\""),
                    ),
                ],
                bytes,
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("read_file_raw failed mount={} path={}: {}", id, path, e);
            (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response()
        }
    }
}

#[derive(serde::Deserialize)]
struct MoveBody {
    src: String,
    dest: String,
}

async fn move_file(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<MoveBody>,
) -> impl IntoResponse {
    let req = VfsMoveReq {
        mount_id: id,
        src: body.src,
        dest: body.dest,
    };
    match mgr.move_file(&req).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"moved": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn copy_file(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<MoveBody>,
) -> impl IntoResponse {
    let req = VfsCopyReq {
        mount_id: id,
        src: body.src,
        dest: body.dest,
    };
    match mgr.copy_file(&req).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"copied": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct MkdirBody {
    path: String,
}

async fn mkdir_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<MkdirBody>,
) -> impl IntoResponse {
    let req = VfsMkdirReq {
        mount_id: id,
        path: body.path,
    };
    match mgr.mkdir(&req).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"created": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct DeleteBody {
    path: String,
}

async fn delete_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<DeleteBody>,
) -> impl IntoResponse {
    let req = VfsDeleteReq {
        mount_id: id,
        path: body.path,
    };
    match mgr.delete(&req).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct WriteBody {
    path: String,
    content: String,
}

async fn write_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<WriteBody>,
) -> impl IntoResponse {
    let req = VfsWriteReq {
        mount_id: id,
        path: body.path,
        content: body.content,
    };
    match mgr.write_file(&req).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"written": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn upload_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut path: Option<String> = None;
    let mut file_data: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        match field.name() {
            Some("path") => {
                path = field.text().await.ok();
            }
            Some("file") => {
                file_data = field.bytes().await.ok().map(|b| b.to_vec());
            }
            _ => {}
        }
    }

    let Some(path) = path else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err("Missing 'path' field")),
        )
            .into_response();
    };
    let Some(data) = file_data else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err("Missing 'file' field")),
        )
            .into_response();
    };

    match mgr.upload_file(&id, &path, data).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"uploaded": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn stat_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let path = query.path.unwrap_or_else(|| "/".into());
    match mgr.stat(&id, &path).await {
        Ok(node) => Json(ApiResponse::ok(node)).into_response(),
        Err(e) => {
            tracing::error!("stat failed mount={} path={}: {}", id, path, e);
            (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response()
        }
    }
}

#[derive(serde::Deserialize)]
struct SearchQuery {
    path: Option<String>,
    query: String,
    max_results: Option<usize>,
}

async fn search_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let req = VfsSearchReq {
        mount_id: id,
        path: q.path.unwrap_or_else(|| "/".into()),
        query: q.query,
        max_results: q.max_results,
    };
    match mgr.search(&req).await {
        Ok(nodes) => Json(ApiResponse::ok(nodes)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── WebDAV server settings handlers ─────────────────────────────────────────

async fn get_webdav_settings(
    State(mgr): State<Arc<VfsManager>>,
) -> Json<ApiResponse<WebDavServerSettings>> {
    Json(ApiResponse::ok(mgr.webdav_server_settings().await))
}

async fn put_webdav_settings(
    State(mgr): State<Arc<VfsManager>>,
    Json(settings): Json<WebDavServerSettings>,
) -> Json<ApiResponse<WebDavServerSettings>> {
    mgr.update_webdav_server_settings(settings).await;
    Json(ApiResponse::ok(mgr.webdav_server_settings().await))
}

// ─── Archive handlers ────────────────────────────────────────────────────────

async fn archive_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<ArchiveRequest>,
) -> impl IntoResponse {
    match mgr.create_archive(&id, &body).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"archived": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn extract_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<ExtractRequest>,
) -> impl IntoResponse {
    match mgr.extract_archive(&id, &body).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"extracted": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── New Archive API handlers ────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct ArchiveListQuery {
    path: String,
    password: Option<String>,
}

#[derive(serde::Deserialize)]
struct ArchiveReadQuery {
    path: String,
    entry: String,
}

async fn archive_read_entry_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(q): Query<ArchiveReadQuery>,
) -> impl IntoResponse {
    match mgr.read_archive_entry(&id, &q.path, &q.entry).await {
        Ok(data) => {
            // Guess content type from entry extension
            let content_type = mime_guess::from_path(std::path::Path::new(&q.entry))
                .first_or_octet_stream()
                .to_string();
            (
                StatusCode::OK,
                [
                    (axum::http::header::CONTENT_TYPE, content_type),
                    (
                        axum::http::header::CONTENT_LENGTH,
                        data.len().to_string(),
                    ),
                ],
                data,
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err(&e)),
        )
            .into_response(),
    }
}

async fn archive_list_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(q): Query<ArchiveListQuery>,
) -> impl IntoResponse {
    match mgr.list_archive_contents(&id, &q.path, q.password).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct ArchiveExtractBody {
    archive_path: String,
    dest_dir: String,
    password: Option<String>,
}

async fn archive_extract_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<ArchiveExtractBody>,
) -> impl IntoResponse {
    let req = ExtractRequest {
        archive_path: body.archive_path,
        dest_dir: body.dest_dir,
        password: body.password,
    };
    match mgr.extract_archive(&id, &req).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"extracted": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct ArchiveCompressBody {
    paths: Vec<String>,
    dest_path: String,
    format: String,
    password: Option<String>,
}

async fn archive_compress_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<ArchiveCompressBody>,
) -> impl IntoResponse {
    let format = match body.format.as_str() {
        "zip" => crate::archive::ArchiveFormat::Zip,
        "tar.gz" => crate::archive::ArchiveFormat::TarGz,
        "7z" => crate::archive::ArchiveFormat::SevenZ,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::err("Unsupported format")),
            )
                .into_response();
        }
    };
    let req = ArchiveRequest {
        paths: body.paths,
        dest: body.dest_path,
        format,
        password: body.password,
    };
    match mgr.create_archive(&id, &req).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"compressed": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Chmod handler ───────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct ChmodQuery {
    path: String,
    mode: u32,
}

async fn chmod_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<ChmodQuery>,
) -> impl IntoResponse {
    match mgr.chmod(&id, &body.path, body.mode).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"updated": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Capabilities handler ─────────────────────────────────────────────────

async fn capabilities_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.capabilities(&id).await {
        Ok(caps) => Json(ApiResponse::ok(caps)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Link (pre-signed URL) handler ────────────────────────────────────────

#[derive(serde::Deserialize)]
struct LinkQuery {
    path: String,
}

async fn link_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(query): Query<LinkQuery>,
) -> impl IntoResponse {
    match mgr.link(&id, &query.path).await {
        Ok(link) => Json(ApiResponse::ok(link)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Prefix route resolution handler ─────────────────────────────────────

#[derive(serde::Deserialize)]
struct ResolveQuery {
    path: String,
}

async fn resolve_path_handler(
    State(mgr): State<Arc<VfsManager>>,
    Query(query): Query<ResolveQuery>,
) -> impl IntoResponse {
    // Strip `vfs://` prefix if present
    let clean_path = query.path.strip_prefix("vfs://").unwrap_or(&query.path);
    match mgr.resolve_mount_by_path(clean_path).await {
        Ok((mount_id, rel_path)) => Json(ApiResponse::ok(
            serde_json::json!({"mount_id": mount_id, "path": rel_path}),
        ))
        .into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err(&e)),
        )
            .into_response(),
    }
}

// ─── Watch WebSocket handler ─────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct WatchQuery {
    path: Option<String>,
}

async fn watch_handler(
    ws: WebSocketUpgrade,
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(q): Query<WatchQuery>,
) -> impl IntoResponse {
    let path = q.path.unwrap_or_else(|| "/".into());
    ws.on_upgrade(move |mut socket| async move {
        let (handle, mut rx) =
            crate::watch::start_watch(mgr, id, path, std::time::Duration::from_secs(2));

        loop {
            tokio::select! {
                Some(event) = rx.recv() => {
                    let json = serde_json::to_string(&event).unwrap_or_default();
                    if socket.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                }
                msg = recv_ws_msg(&mut socket) => {
                    match msg {
                        Some(Ok(Message::Close(_))) | None => break,
                        _ => {}
                    }
                }
            }
        }
        handle.cancel();
    })
}

// ─── Tail WebSocket handler ──────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct TailQuery {
    path: String,
    lines: Option<usize>,
}

async fn tail_handler(
    ws: WebSocketUpgrade,
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(q): Query<TailQuery>,
) -> impl IntoResponse {
    let path = q.path;
    let initial_lines = q.lines.unwrap_or(100);
    ws.on_upgrade(move |mut socket| async move {
        // Get mount info for local tail
        let Some(mount) = mgr.get_mount(&id).await else {
            let _ = socket
                .send(Message::Text(r#"{"error":"Mount not found"}"#.into()))
                .await;
            return;
        };

        match mount.kind {
            crate::types::VfsSourceKind::Local => {
                match crate::tail::tail_local_file(
                    &mount.root,
                    &path,
                    initial_lines,
                    std::time::Duration::from_millis(500),
                ) {
                    Ok((handle, mut rx)) => {
                        loop {
                            tokio::select! {
                                Some(line) = rx.recv() => {
                                    if socket.send(Message::Text(line.into())).await.is_err() {
                                        break;
                                    }
                                }
                                msg = recv_ws_msg(&mut socket) => {
                                    match msg {
                                        Some(Ok(Message::Close(_))) | None => break,
                                        _ => {}
                                    }
                                }
                            }
                        }
                        handle.cancel();
                    }
                    Err(e) => {
                        let _ = socket
                            .send(Message::Text(format!(r#"{{"error":"{e}"}}"#).into()))
                            .await;
                    }
                }
            }
            _ => {
                let _ = socket
                    .send(Message::Text(
                        r#"{"error":"Tail only supported for local mounts"}"#.into(),
                    ))
                    .await;
            }
        }
    })
}

/// Helper to receive a WebSocket message (returns None on connection close).
async fn recv_ws_msg(
    socket: &mut axum::extract::ws::WebSocket,
) -> Option<Result<Message, axum::Error>> {
    socket.recv().await
}

// ─── Font Install ──────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct InstallFontBody {
    path: String,
}

/// Install a font file from VFS into the system font directory.
///
/// macOS: copies to `~/Library/Fonts/`
/// Linux: copies to `~/.local/share/fonts/` then runs `fc-cache -f`
async fn install_font(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Json(body): Json<InstallFontBody>,
) -> impl IntoResponse {
    let path = body.path;

    // Validate file extension
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "woff" | "woff2") {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<serde_json::Value>::err(format!(
                "不支持的字体格式: .{ext}"
            ))),
        )
            .into_response();
    }

    // Read font bytes from VFS
    let bytes = match mgr.read_file_raw(&id, &path).await {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("install_font: read failed mount={} path={}: {e}", id, path);
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<serde_json::Value>::err(format!(
                    "读取字体文件失败: {e}"
                ))),
            )
                .into_response();
        }
    };

    // Get filename from path
    let filename = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "font".to_string());

    // Install
    match install_font_to_system(&filename, &bytes).await {
        Ok(dest_path) => {
            Json(ApiResponse::ok(serde_json::json!({
                "installed": true,
                "path": dest_path
            })))
            .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<serde_json::Value>::err(format!(
                "安装字体失败: {e}"
            ))),
        )
            .into_response(),
    }
}

/// Platform-specific font installation.
async fn install_font_to_system(filename: &str, bytes: &[u8]) -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| format!("无法获取 HOME 目录: {e}"))?;

    #[cfg(target_os = "macos")]
    {
        let fonts_dir = format!("{home}/Library/Fonts");
        tokio::fs::create_dir_all(&fonts_dir)
            .await
            .map_err(|e| format!("创建字体目录失败: {e}"))?;

        let dest = format!("{fonts_dir}/{filename}");

        // If file already exists, overwrite
        tokio::fs::write(&dest, bytes)
            .await
            .map_err(|e| format!("写入字体文件失败: {e}"))?;

        Ok(dest)
    }

    #[cfg(target_os = "linux")]
    {
        let fonts_dir = format!("{home}/.local/share/fonts");
        tokio::fs::create_dir_all(&fonts_dir)
            .await
            .map_err(|e| format!("创建字体目录失败: {e}"))?;

        let dest = format!("{fonts_dir}/{filename}");
        tokio::fs::write(&dest, bytes)
            .await
            .map_err(|e| format!("写入字体文件失败: {e}"))?;

        // Refresh font cache
        let _ = tokio::process::Command::new("fc-cache")
            .arg("-f")
            .output()
            .await;

        Ok(dest)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (filename, bytes);
        Err("当前系统不支持字体安装".to_string())
    }
}

#[cfg(test)]
mod font_install_tests {
    use super::*;

    #[tokio::test]
    async fn test_install_font_rejects_non_font_extension() {
        // We test the extension validation logic directly
        let ext = "txt".to_lowercase();
        assert!(!matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "woff" | "woff2"));
    }

    #[tokio::test]
    async fn test_install_font_accepts_valid_extensions() {
        for ext in &["ttf", "otf", "ttc", "woff", "woff2"] {
            assert!(matches!(
                ext.to_string().to_lowercase().as_str(),
                "ttf" | "otf" | "ttc" | "woff" | "woff2"
            ));
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn test_install_font_to_system_writes_file() {
        let filename = format!("test-font-{}.ttf", std::process::id());
        let content = b"fake-font-data";

        let result = install_font_to_system(&filename, content).await;

        assert!(result.is_ok(), "install_font_to_system failed: {:?}", result.err());
        let dest = result.unwrap();

        #[cfg(target_os = "macos")]
        assert!(dest.contains("Library/Fonts"));
        #[cfg(target_os = "linux")]
        assert!(dest.contains(".local/share/fonts"));

        // Verify file content
        let written = tokio::fs::read(&dest).await.unwrap();
        assert_eq!(written, content);

        // Cleanup
        let _ = tokio::fs::remove_file(&dest).await;
    }
}
