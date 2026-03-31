use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::DbManager;
use crate::types::{CreateDbConnectionReq, DbConnectionConfig, TableDataReq};

/// Database application plugin.
pub struct DbPlugin {
    manager: Arc<DbManager>,
}

impl DbPlugin {
    pub fn new(manager: Arc<DbManager>) -> Self {
        Self { manager }
    }
}

impl AppPlugin for DbPlugin {
    fn app_id(&self) -> &'static str {
        "database"
    }

    fn routes(&self) -> Router {
        Router::new()
            .route(
                "/api/db/connections",
                get(list_connections).post(create_connection),
            )
            .route(
                "/api/db/connections/{id}",
                get(get_connection).delete(delete_connection),
            )
            .route("/api/db/connections/{id}/test", post(test_connection))
            .route("/api/db/connections/{id}/connect", post(connect_db))
            .route("/api/db/connections/{id}/disconnect", post(disconnect_db))
            .route("/api/db/connections/{id}/schemas", get(list_schemas))
            .route(
                "/api/db/connections/{id}/tables/{table}/structure",
                get(get_table_structure),
            )
            .route(
                "/api/db/connections/{id}/tables/{table}/data",
                get(get_table_data),
            )
            .route("/api/db/connections/{id}/query", post(execute_sql))
            .with_state(self.manager.clone())
    }
}

// --- Handlers ---

async fn list_connections(
    State(mgr): State<Arc<DbManager>>,
) -> Json<ApiResponse<Vec<DbConnectionConfig>>> {
    let list = mgr.list_connections().await;
    Json(ApiResponse::ok(list))
}

async fn create_connection(
    State(mgr): State<Arc<DbManager>>,
    Json(req): Json<CreateDbConnectionReq>,
) -> (StatusCode, Json<ApiResponse<DbConnectionConfig>>) {
    let conn = mgr.create_connection(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(conn)))
}

async fn get_connection(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.get_connection(&id).await {
        Some(conn) => Json(ApiResponse::ok(conn)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("DB connection not found")),
        )
            .into_response(),
    }
}

async fn delete_connection(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if mgr.delete_connection(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("DB connection not found")),
        )
            .into_response()
    }
}

async fn test_connection(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.test_connection(&id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("DB connection not found")),
        )
            .into_response(),
    }
}

async fn connect_db(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.connect(&id).await {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"connected": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn disconnect_db(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    mgr.disconnect(&id).await;
    Json(ApiResponse::ok(serde_json::json!({"disconnected": true})))
}

async fn list_schemas(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.list_schemas(&id).await {
        Ok(schemas) => Json(ApiResponse::ok(schemas)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn get_table_structure(
    State(mgr): State<Arc<DbManager>>,
    Path((id, table)): Path<(String, String)>,
) -> impl IntoResponse {
    match mgr.table_structure(&id, None, &table).await {
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

async fn get_table_data(
    State(mgr): State<Arc<DbManager>>,
    Path((id, table)): Path<(String, String)>,
    Query(query): Query<TableDataQuery>,
) -> impl IntoResponse {
    let req = TableDataReq {
        schema: None,
        table,
        page: query.page.unwrap_or(1),
        page_size: query.page_size.unwrap_or(50),
        order_by: query.order_by,
        order_dir: query.order_dir,
        filter: query.filter,
    };
    match mgr.table_data(&id, &req).await {
        Ok(data) => Json(ApiResponse::ok(data)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct SqlBody {
    sql: String,
}

async fn execute_sql(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
    Json(body): Json<SqlBody>,
) -> impl IntoResponse {
    match mgr.execute_sql(&id, &body.sql).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}
