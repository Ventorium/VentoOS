//! HTTP routes for the AI Agent subsystem.

use std::convert::Infallible;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::AgentManager;
use crate::types::{
    AgentConfig, ChatRequest, ChatResponse, ChatSession, ProviderConfig, StreamEvent,
    ToolDefinition,
};

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
            // Sessions
            .route("/api/agent/sessions", get(list_sessions))
            .route(
                "/api/agent/sessions/{id}",
                get(get_session).delete(delete_session),
            )
            // Chat
            .route("/api/agent/chat", post(chat))
            .route("/api/agent/chat/stream", post(chat_stream))
            // Providers
            .route(
                "/api/agent/providers",
                get(list_providers).post(create_provider),
            )
            .route(
                "/api/agent/providers/{id}",
                get(get_provider).put(update_provider).delete(delete_provider),
            )
            // Tools
            .route("/api/agent/tools", get(list_tools))
            // Config
            .route("/api/agent/config", get(get_config).put(update_config))
            .with_state(self.manager.clone())
    }
}

// ─── Session Handlers ──────────────────────────────────────────────────────

async fn list_sessions(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ChatSession>>> {
    let sessions = mgr.sessions.list().await;
    Json(ApiResponse::ok(sessions))
}

async fn get_session(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.sessions.get(&id).await {
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
    if mgr.sessions.delete(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Session not found")),
        )
            .into_response()
    }
}

// ─── Chat Handlers ─────────────────────────────────────────────────────────

/// Non-streaming chat endpoint (backwards compatible).
async fn chat(
    State(mgr): State<Arc<AgentManager>>,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    let provider = match mgr.resolve_provider(req.provider_id.as_deref()).await {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::err(e.to_string())),
            )
                .into_response();
        }
    };

    let runner = mgr.create_runner().await;
    let tool_registry = mgr.tool_registry.read().await;

    match runner
        .chat(&req, &provider, &tool_registry, &mgr.guards, &*mgr.executor)
        .await
    {
        Ok((session_id, message)) => {
            Json(ApiResponse::ok(ChatResponse {
                session_id,
                message,
            }))
            .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

/// Streaming chat endpoint — returns Server-Sent Events.
async fn chat_stream(
    State(mgr): State<Arc<AgentManager>>,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    let provider = match mgr.resolve_provider(req.provider_id.as_deref()).await {
        Ok(p) => p,
        Err(e) => {
            // Return SSE stream with a single error event
            let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(1);
            tokio::spawn(async move {
                let event = StreamEvent::Error {
                    message: e.to_string(),
                };
                let _ = tx
                    .send(Ok(Event::default()
                        .event("error")
                        .data(serde_json::to_string(&event).unwrap_or_default())))
                    .await;
            });
            return Sse::new(ReceiverStream::new(rx));
        }
    };

    let (event_tx, event_rx) = mpsc::channel::<StreamEvent>(64);
    let (sse_tx, sse_rx) = mpsc::channel::<Result<Event, Infallible>>(64);

    // Spawn a task to convert StreamEvents to SSE Events
    let sse_tx_clone = sse_tx.clone();
    tokio::spawn(async move {
        let mut event_rx = event_rx;
        while let Some(event) = event_rx.recv().await {
            let event_type = match &event {
                StreamEvent::ContentDelta { .. } => "content_delta",
                StreamEvent::ToolCallStart { .. } => "tool_call_start",
                StreamEvent::ToolResult { .. } => "tool_result",
                StreamEvent::MessageComplete { .. } => "message_complete",
                StreamEvent::Error { .. } => "error",
                StreamEvent::Done { .. } => "done",
            };

            let data = serde_json::to_string(&event).unwrap_or_default();
            let sse_event = Event::default().event(event_type).data(data);

            if sse_tx_clone.send(Ok(sse_event)).await.is_err() {
                break;
            }
        }
    });

    // Spawn the agent runner
    let runner = mgr.create_runner().await;
    let tool_registry_clone = {
        let registry = mgr.tool_registry.read().await;
        registry.definitions()
    };

    let guards = Arc::clone(&mgr.guards);
    let executor = Arc::clone(&mgr.executor);

    tokio::spawn(async move {
        // Create a temporary ToolRegistry from the cloned definitions
        let mut temp_registry = crate::tool::ToolRegistry::new();
        for tool in tool_registry_clone {
            temp_registry.register(tool);
        }

        runner
            .run(&req, &provider, &temp_registry, &guards, &*executor, event_tx)
            .await;
    });

    Sse::new(ReceiverStream::new(sse_rx))
}

// ─── Provider Handlers ─────────────────────────────────────────────────────

async fn list_providers(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ProviderConfig>>> {
    let providers: Vec<_> = mgr
        .list_providers()
        .await
        .into_iter()
        .map(|p| p.masked())
        .collect();
    Json(ApiResponse::ok(providers))
}

async fn get_provider(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.get_provider(&id).await {
        Some(provider) => Json(ApiResponse::ok(provider.masked())).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Provider not found")),
        )
            .into_response(),
    }
}

async fn create_provider(
    State(mgr): State<Arc<AgentManager>>,
    Json(mut config): Json<ProviderConfig>,
) -> impl IntoResponse {
    // Generate ID if not provided
    if config.id.is_empty() {
        config.id = uuid::Uuid::new_v4().to_string();
    }
    mgr.add_provider(config.clone()).await;
    (
        StatusCode::CREATED,
        Json(ApiResponse::ok(config.masked())),
    )
}

async fn update_provider(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
    Json(mut config): Json<ProviderConfig>,
) -> impl IntoResponse {
    config.id = id.clone();

    // If the API key is masked (contains "..."), keep the old one
    if (config.api_key.contains("...") || config.api_key == "****")
        && let Some(existing) = mgr.get_provider(&id).await {
            config.api_key = existing.api_key;
        }

    if mgr.update_provider(config).await {
        let provider = mgr.get_provider(&id).await.unwrap();
        Json(ApiResponse::ok(provider.masked())).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Provider not found")),
        )
            .into_response()
    }
}

async fn delete_provider(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if mgr.delete_provider(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Provider not found")),
        )
            .into_response()
    }
}

// ─── Tool Handlers ─────────────────────────────────────────────────────────

async fn list_tools(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ToolDefinition>>> {
    let tools = mgr.tool_registry.read().await.definitions();
    Json(ApiResponse::ok(tools))
}

// ─── Config Handlers ───────────────────────────────────────────────────────

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
