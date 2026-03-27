use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use rust_embed::Embed;

use crate::state::AppState;
use crate::websocket;
use ventoos_core::connection::{CreateConnectionRequest, UpdateConnectionRequest};
use ventoos_core::task::CreateTaskRequest;
use ventoos_core::types::{ApiResponse, Id};

/// Embedded frontend assets (from vite build output).
#[derive(Embed)]
#[folder = "../../../web/dist/"]
#[prefix = ""]
struct FrontendAssets;

/// Create the application router.
pub fn create_router(state: AppState) -> Router {
    let api_router = Router::new()
        // Health check
        .route("/api/health", get(health_check))
        // Connection routes
        .route("/api/connections", get(list_connections).post(create_connection))
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
        // Settings routes
        .route("/api/settings/desktop", get(get_desktop_state).put(save_desktop_state))
        .route("/api/settings/windows", get(get_window_states).put(save_window_states))
        // WebSocket
        .route("/ws", get(websocket::ws_handler))
        .with_state(state);

    // Merge API routes with frontend fallback
    Router::new()
        .merge(api_router)
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
) -> (StatusCode, Json<ApiResponse<ventoos_core::connection::Connection>>) {
    let conn = state.connections.create(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(conn)))
}

async fn get_connection(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
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

async fn delete_connection(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
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

async fn test_connection(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
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

async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
    match state.tasks.get_task(id).await {
        Some(task) => Json(ApiResponse::ok(task)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Task not found")),
        )
            .into_response(),
    }
}

async fn cancel_task(
    State(state): State<AppState>,
    Path(id): Path<Id>,
) -> impl IntoResponse {
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
