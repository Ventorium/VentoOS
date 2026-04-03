use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::DbManager;
use crate::types::{CreateDbConnectionReq, DbConnectionConfig, ExplainReq, ExportReq, RowDeleteReq, RowUpdateReq, TableDataReq};

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
            .route("/api/db/connections/test", post(test_connection_inline))
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
            // New routes
            .route("/api/db/connections/{id}/explain", post(explain_sql))
            .route("/api/db/connections/{id}/completion", get(get_completion))
            .route("/api/db/connections/{id}/export", post(export_data))
            .route(
                "/api/db/connections/{id}/rows",
                put(update_row).delete(delete_row),
            )
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

/// Test a connection inline without saving it first.
async fn test_connection_inline(
    State(mgr): State<Arc<DbManager>>,
    Json(req): Json<CreateDbConnectionReq>,
) -> impl IntoResponse {
    let result = mgr.test_connection_inline(&req).await;
    Json(ApiResponse::ok(result))
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

// ── New Handlers ───────────────────────────────────────────────────────────

async fn explain_sql(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
    Json(body): Json<ExplainReq>,
) -> impl IntoResponse {
    match mgr.explain(&id, &body.sql).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct CompletionQuery {
    refresh: Option<bool>,
}

async fn get_completion(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
    Query(query): Query<CompletionQuery>,
) -> impl IntoResponse {
    match mgr.completion(&id, query.refresh.unwrap_or(false)).await {
        Ok(tree) => Json(ApiResponse::ok(tree)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn export_data(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
    Json(body): Json<ExportReq>,
) -> impl IntoResponse {
    match mgr.export(&id, &body).await {
        Ok(bytes) => {
            let content_type = match body.format {
                crate::types::ExportFormat::Csv => "text/csv",
                _ => "application/json",
            };
            let filename = match body.format {
                crate::types::ExportFormat::Csv => "export.csv",
                _ => "export.json",
            };
            (
                StatusCode::OK,
                [
                    ("content-type", content_type),
                    (
                        "content-disposition",
                        &format!("attachment; filename=\"{filename}\""),
                    ),
                ],
                bytes,
            )
                .into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn update_row(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
    Json(body): Json<RowUpdateReq>,
) -> impl IntoResponse {
    match mgr.update_row(&id, &body).await {
        Ok(affected) => {
            Json(ApiResponse::ok(serde_json::json!({"affected_rows": affected}))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn delete_row(
    State(mgr): State<Arc<DbManager>>,
    Path(id): Path<String>,
    Json(body): Json<RowDeleteReq>,
) -> impl IntoResponse {
    match mgr.delete_row(&id, &body).await {
        Ok(affected) => {
            Json(ApiResponse::ok(serde_json::json!({"affected_rows": affected}))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}
