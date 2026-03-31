use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::AgentManager;
use crate::types::{AgentConfig, ChatRequest, ChatSession};

/// AI Agent application plugin.
pub struct AgentPlugin {
    manager: Arc<AgentManager>,
}

impl AgentPlugin {
    pub fn new(manager: Arc<AgentManager>) -> Self {
        Self { manager }
    }
}

impl AppPlugin for AgentPlugin {
    fn app_id(&self) -> &'static str {
        "ai-assistant"
    }

    fn routes(&self) -> Router {
        Router::new()
            .route("/api/agent/sessions", get(list_sessions))
            .route(
                "/api/agent/sessions/{id}",
                get(get_session).delete(delete_session),
            )
            .route("/api/agent/chat", post(chat))
            .route("/api/agent/config", get(get_config).put(update_config))
            .with_state(self.manager.clone())
    }
}

// --- Handlers ---

async fn list_sessions(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ChatSession>>> {
    let sessions = mgr.list_sessions().await;
    Json(ApiResponse::ok(sessions))
}

async fn get_session(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.get_session(&id).await {
        Some(session) => Json(ApiResponse::ok(session)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Session not found")),
        )
            .into_response(),
    }
}

async fn delete_session(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if mgr.delete_session(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Session not found")),
        )
            .into_response()
    }
}

async fn chat(
    State(mgr): State<Arc<AgentManager>>,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    match mgr.chat(req).await {
        Ok(resp) => Json(ApiResponse::ok(resp)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(&e)),
        )
            .into_response(),
    }
}

async fn get_config(State(mgr): State<Arc<AgentManager>>) -> Json<ApiResponse<AgentConfig>> {
    let config = mgr.get_config().await;
    Json(ApiResponse::ok(config))
}

async fn update_config(
    State(mgr): State<Arc<AgentManager>>,
    Json(config): Json<AgentConfig>,
) -> Json<ApiResponse<serde_json::Value>> {
    mgr.update_config(config).await;
    Json(ApiResponse::ok(serde_json::json!({"updated": true})))
}
