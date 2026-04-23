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
                "/api/vfs/mounts/{id}/archive/extract",
                post(archive_extract_handler),
            )
            .route(
                "/api/vfs/mounts/{id}/archive/compress",
                post(archive_compress_handler),
            )
            // Permissions
            .route("/api/vfs/mounts/{id}/chmod", put(chmod_handler))
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
