use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::RedisManager;
use crate::types::{
    BatchDeleteRequest, BatchExportRequest, BatchTtlRequest, CreateRedisConnectionReq,
    PublishRequest, RedisConnectionConfig, RedisScanReq, StreamAddRequest,
    StreamGroupCreateRequest, SubscribeRequest,
};

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
            // Connection management
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
            // Key browsing
            .route("/api/redis/connections/{id}/scan", get(scan_keys))
            .route(
                "/api/redis/connections/{id}/keys/{key}",
                get(get_key).delete(delete_key),
            )
            .route("/api/redis/connections/{id}/keys", post(set_key))
            // Command execution
            .route("/api/redis/connections/{id}/command", post(execute_command))
            // Server info & stats
            .route("/api/redis/connections/{id}/info", get(server_info))
            .route("/api/redis/connections/{id}/info/parsed", get(info_parsed))
            // Memory analysis
            .route(
                "/api/redis/connections/{id}/memory/stats",
                get(memory_stats),
            )
            .route(
                "/api/redis/connections/{id}/memory/{key}",
                get(memory_usage),
            )
            // Stream operations
            .route(
                "/api/redis/connections/{id}/stream/{key}",
                get(stream_range).post(stream_add),
            )
            .route(
                "/api/redis/connections/{id}/stream/{key}/groups",
                post(stream_group_create),
            )
            .route(
                "/api/redis/connections/{id}/stream/{key}/len",
                get(stream_len),
            )
            // Batch operations
            .route(
                "/api/redis/connections/{id}/batch/delete",
                post(batch_delete),
            )
            .route("/api/redis/connections/{id}/batch/ttl", post(batch_set_ttl))
            .route(
                "/api/redis/connections/{id}/batch/export",
                post(batch_export),
            )
            // Pub/Sub
            .route(
                "/api/redis/connections/{id}/pubsub/subscribe",
                post(pubsub_subscribe),
            )
            .route(
                "/api/redis/connections/{id}/pubsub/unsubscribe",
                post(pubsub_unsubscribe),
            )
            .route(
                "/api/redis/connections/{id}/pubsub/publish",
                post(pubsub_publish),
            )
            // MONITOR
            .route(
                "/api/redis/connections/{id}/monitor/start",
                post(monitor_start),
            )
            .route(
                "/api/redis/connections/{id}/monitor/stop",
                post(monitor_stop),
            )
            .with_state(self.manager.clone())
    }
}

// ─── Connection Handlers ────────────────────────────────────

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

// ─── Key Handlers ───────────────────────────────────────────

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

// ─── Command Handler ────────────────────────────────────────

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

// ─── Info / Stats Handlers ──────────────────────────────────

async fn server_info(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.server_info(&id).await {
        Ok(info) => Json(ApiResponse::ok(info)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn info_parsed(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.info_parsed(&id).await {
        Ok(info) => Json(ApiResponse::ok(info)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn memory_usage(
    State(mgr): State<Arc<RedisManager>>,
    Path((id, key)): Path<(String, String)>,
) -> impl IntoResponse {
    match mgr.memory_usage(&id, &key).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn memory_stats(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.memory_stats(&id).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Stream Handlers ────────────────────────────────────────

#[derive(serde::Deserialize)]
struct StreamRangeQuery {
    start: Option<String>,
    end: Option<String>,
    count: Option<u32>,
}

async fn stream_range(
    State(mgr): State<Arc<RedisManager>>,
    Path((id, key)): Path<(String, String)>,
    Query(query): Query<StreamRangeQuery>,
) -> impl IntoResponse {
    let start = query.start.as_deref().unwrap_or("-");
    let end = query.end.as_deref().unwrap_or("+");
    match mgr.stream_range(&id, &key, start, end, query.count).await {
        Ok(entries) => Json(ApiResponse::ok(entries)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn stream_add(
    State(mgr): State<Arc<RedisManager>>,
    Path((id, key)): Path<(String, String)>,
    Json(body): Json<StreamAddRequest>,
) -> impl IntoResponse {
    match mgr.stream_add(&id, &key, &body).await {
        Ok(entry_id) => Json(ApiResponse::ok(serde_json::json!({"id": entry_id}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn stream_group_create(
    State(mgr): State<Arc<RedisManager>>,
    Path((id, key)): Path<(String, String)>,
    Json(body): Json<StreamGroupCreateRequest>,
) -> impl IntoResponse {
    match mgr.stream_group_create(&id, &key, &body).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"ok": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn stream_len(
    State(mgr): State<Arc<RedisManager>>,
    Path((id, key)): Path<(String, String)>,
) -> impl IntoResponse {
    match mgr.stream_len(&id, &key).await {
        Ok(len) => Json(ApiResponse::ok(serde_json::json!({"length": len}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Batch Handlers ─────────────────────────────────────────

async fn batch_delete(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Json(body): Json<BatchDeleteRequest>,
) -> impl IntoResponse {
    match mgr.batch_delete(&id, &body).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn batch_set_ttl(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Json(body): Json<BatchTtlRequest>,
) -> impl IntoResponse {
    match mgr.batch_set_ttl(&id, &body).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn batch_export(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Json(body): Json<BatchExportRequest>,
) -> impl IntoResponse {
    match mgr.batch_export(&id, &body).await {
        Ok(data) => Json(ApiResponse::ok(data)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Pub/Sub Handlers ───────────────────────────────────────

async fn pubsub_subscribe(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Json(body): Json<SubscribeRequest>,
) -> impl IntoResponse {
    match mgr.subscribe(&id, body.channels).await {
        Ok(_rx) => Json(ApiResponse::ok(serde_json::json!({"subscribed": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn pubsub_unsubscribe(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Json(body): Json<SubscribeRequest>,
) -> impl IntoResponse {
    match mgr.unsubscribe(&id, body.channels).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"unsubscribed": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn pubsub_publish(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
    Json(body): Json<PublishRequest>,
) -> impl IntoResponse {
    match mgr.publish(&id, &body.channel, &body.message).await {
        Ok(receivers) => {
            Json(ApiResponse::ok(serde_json::json!({"receivers": receivers}))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── MONITOR Handlers ───────────────────────────────────────

async fn monitor_start(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.monitor(&id).await {
        Ok(_rx) => Json(ApiResponse::ok(serde_json::json!({"monitoring": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn monitor_stop(
    State(mgr): State<Arc<RedisManager>>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    mgr.stop_monitor(&id).await;
    Json(ApiResponse::ok(serde_json::json!({"monitoring": false})))
}
