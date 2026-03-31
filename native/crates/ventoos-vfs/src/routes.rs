use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::VfsManager;
use crate::types::{CreateVfsMountReq, VfsCopyReq, VfsListReq, VfsMount, VfsMoveReq, VfsReadReq};

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
        Router::new()
            .route("/api/vfs/mounts", get(list_mounts).post(create_mount))
            .route("/api/vfs/mounts/{id}", get(get_mount).delete(delete_mount))
            .route("/api/vfs/mounts/{id}/ls", get(list_dir))
            .route("/api/vfs/mounts/{id}/read", get(read_file))
            .route("/api/vfs/mounts/{id}/raw", get(read_file_raw))
            .route("/api/vfs/mounts/{id}/move", post(move_file))
            .route("/api/vfs/mounts/{id}/copy", post(copy_file))
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

#[derive(serde::Deserialize)]
struct PathQuery {
    path: Option<String>,
}

async fn list_dir(
    State(mgr): State<Arc<VfsManager>>,
    Path(id): Path<String>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let req = VfsListReq {
        mount_id: id,
        path: query.path.unwrap_or_else(|| "/".into()),
    };
    match mgr.list_dir(&req).await {
        Ok(nodes) => Json(ApiResponse::ok(nodes)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct ReadQuery {
    path: String,
    max_bytes: Option<u64>,
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
            (
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, mime.as_ref().to_owned())],
                bytes,
            )
                .into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
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
