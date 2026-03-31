use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::RedisManager;
use crate::types::{CreateRedisConnectionReq, RedisConnectionConfig, RedisScanReq};

/// Redis application plugin.
pub struct RedisPlugin {
    manager: Arc<RedisManager>,
}

impl RedisPlugin {
    pub fn new(manager: Arc<RedisManager>) -> Self {
        Self { manager }
    }
}

impl AppPlugin for RedisPlugin {
    fn app_id(&self) -> &'static str {
        "redis"
    }

    fn routes(&self) -> Router {
        Router::new()
            .route(
                "/api/redis/connections",
                get(list_connections).post(create_connection),
            )
            .route(
                "/api/redis/connections/{id}",
                get(get_connection).delete(delete_connection),
            )
            .route("/api/redis/connections/{id}/test", post(test_connection))
            .route("/api/redis/connections/{id}/connect", post(connect_redis))
            .route(
                "/api/redis/connections/{id}/disconnect",
                post(disconnect_redis),
            )
            .route("/api/redis/connections/{id}/scan", get(scan_keys))
            .route(
                "/api/redis/connections/{id}/keys/{key}",
                get(get_key).delete(delete_key),
            )
            .route("/api/redis/connections/{id}/keys", post(set_key))
            .route("/api/redis/connections/{id}/command", post(execute_command))
            .route("/api/redis/connections/{id}/info", get(server_info))
            .with_state(self.manager.clone())
    }
}

// --- Handlers ---

async fn list_connections(
    State(mgr): State<Arc<RedisManager>>,
) -> Json<ApiResponse<Vec<RedisConnectionConfig>>> {
    let list = mgr.list_connections().await;
    Json(ApiResponse::ok(list))
}

async fn create_connection(
    State(mgr): State<Arc<RedisManager>>,
    Json(req): Json<CreateRedisConnectionReq>,
) -> (StatusCode, Json<ApiResponse<RedisConnectionConfig>>) {
    let conn = mgr.create_connection(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(conn)))
}

async fn get_connection(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.get_connection(&id).await {
        Some(conn) => Json(ApiResponse::ok(conn)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Redis connection not found")),
        )
            .into_response(),
    }
}

async fn delete_connection(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if mgr.delete_connection(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Redis connection not found")),
        )
            .into_response()
    }
}

async fn test_connection(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.test_connection(&id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Redis connection not found")),
        )
            .into_response(),
    }
}

async fn connect_redis(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.connect(&id).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"connected": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn disconnect_redis(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    mgr.disconnect(&id).await;
    Json(ApiResponse::ok(serde_json::json!({"disconnected": true})))
}

#[derive(serde::Deserialize)]
struct ScanQuery {
    cursor: Option<String>,
    pattern: Option<String>,
    count: Option<u32>,
    key_type: Option<String>,
}

async fn scan_keys(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Query(query): Query<ScanQuery>,
) -> impl IntoResponse {
    let req = RedisScanReq {
        cursor: query.cursor.unwrap_or_else(|| "0".into()),
        pattern: query.pattern,
        count: query.count,
        key_type: query.key_type,
    };
    match mgr.scan_keys(&id, &req).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn get_key(
    State(mgr): State<Arc<RedisManager>>,
    Path((id, key)): Path<(String, String)>,
) -> impl IntoResponse {
    match mgr.get_key_value(&id, &key).await {
        Ok(val) => Json(ApiResponse::ok(val)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn delete_key(
    State(mgr): State<Arc<RedisManager>>,
    Path((id, key)): Path<(String, String)>,
) -> impl IntoResponse {
    match mgr.delete_key(&id, &key).await {
        Ok(deleted) => {
            Json(ApiResponse::ok(serde_json::json!({"deleted": deleted}))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct SetKeyBody {
    key: String,
    value: String,
    ttl: Option<i64>,
}

async fn set_key(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Json(body): Json<SetKeyBody>,
) -> impl IntoResponse {
    match mgr.set_key(&id, &body.key, &body.value, body.ttl).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"ok": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct CommandBody {
    command: String,
}

async fn execute_command(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Json(body): Json<CommandBody>,
) -> impl IntoResponse {
    match mgr.execute_command(&id, &body.command).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn server_info(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.server_info(&id).await {
        Ok(info) => Json(ApiResponse::ok(info)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}
