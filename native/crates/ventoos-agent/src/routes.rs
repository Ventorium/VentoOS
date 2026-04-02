//! HTTP routes for the AI Agent subsystem.

use std::convert::Infallible;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::sse::{Event, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::AgentManager;
use crate::tool::ToolRegistry;
use crate::types::{
    AgentConfig, AgentProfile, ChannelConfig, ChatRequest, ChatResponse, ChatSession, ProviderConfig,
    ProviderProbeRequest, ProviderTemplate, StreamEvent, ToolDefinition,
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
            .route("/api/agent/sessions", get(list_sessions))
            .route(
                "/api/agent/sessions/{id}",
                get(get_session).delete(delete_session),
            )
            .route("/api/agent/chat", post(chat))
            .route("/api/agent/chat/stream", post(chat_stream))
            .route(
                "/api/agent/providers",
                get(list_providers).post(create_provider),
            )
            .route("/api/agent/providers/templates", get(list_provider_templates))
            .route("/api/agent/providers/test", post(test_provider))
            .route(
                "/api/agent/providers/{id}",
                get(get_provider).put(update_provider).delete(delete_provider),
            )
            .route(
                "/api/agent/profiles",
                get(list_profiles).post(create_profile),
            )
            .route(
                "/api/agent/profiles/{id}",
                get(get_profile).put(update_profile).delete(delete_profile),
            )
            .route("/api/agent/tools", get(list_tools))
            .route("/api/agent/config", get(get_config).put(update_config))
            .route("/api/agent/channels", get(list_channels).post(create_channel))
            .route(
                "/api/agent/channels/{id}",
                get(get_channel).put(update_channel).delete(delete_channel),
            )
            .with_state(self.manager.clone())
    }
}

// ─── Session Handlers ──────────────────────────────────────────────────────

async fn list_sessions(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ChatSession>>> {
    Json(ApiResponse::ok(mgr.sessions.list().await))
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

async fn chat(
    State(mgr): State<Arc<AgentManager>>,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    let prepared = match mgr.prepare_chat_request(&req).await {
        Ok(prepared) => prepared,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::err(error.to_string())),
            )
                .into_response();
        }
    };

    let provider = match mgr.resolve_provider_for_request(&prepared).await {
        Ok(provider) => provider,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::err(error.to_string())),
            )
                .into_response();
        }
    };

    let runner = mgr.create_runner().await;
    let tool_registry = mgr.tool_registry.read().await;

    match runner
        .chat(&prepared, &provider, &tool_registry, &mgr.guards, &*mgr.executor)
        .await
    {
        Ok((session_id, message)) => {
            Json(ApiResponse::ok(ChatResponse { session_id, message })).into_response()
        }
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(error.to_string())),
        )
            .into_response(),
    }
}

async fn chat_stream(
    State(mgr): State<Arc<AgentManager>>,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    let prepared = match mgr.prepare_chat_request(&req).await {
        Ok(prepared) => prepared,
        Err(error) => return error_stream(error.to_string()),
    };

    let provider = match mgr.resolve_provider_for_request(&prepared).await {
        Ok(provider) => provider,
        Err(error) => return error_stream(error.to_string()),
    };

    let (event_tx, event_rx) = mpsc::channel::<StreamEvent>(64);
    let (sse_tx, sse_rx) = mpsc::channel::<Result<Event, Infallible>>(64);

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

    let runner = mgr.create_runner().await;
    let tool_registry = {
        let registry = mgr.tool_registry.read().await;
        clone_tool_registry(&registry)
    };
    let guards = Arc::clone(&mgr.guards);
    let executor = Arc::clone(&mgr.executor);

    tokio::spawn(async move {
        runner
            .run(&prepared, &provider, &tool_registry, &guards, &*executor, event_tx)
            .await;
    });

    Sse::new(ReceiverStream::new(sse_rx))
}

fn error_stream(message: String) -> Sse<ReceiverStream<Result<Event, Infallible>>> {
    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(1);
    tokio::spawn(async move {
        let event = StreamEvent::Error { message };
        let _ = tx
            .send(Ok(Event::default().event("error").data(
                serde_json::to_string(&event).unwrap_or_default(),
            )))
            .await;
    });
    Sse::new(ReceiverStream::new(rx))
}

fn clone_tool_registry(registry: &ToolRegistry) -> ToolRegistry {
    let mut cloned = ToolRegistry::new();
    for tool in registry.definitions() {
        cloned.register(tool);
    }
    cloned
}

// ─── Provider Handlers ─────────────────────────────────────────────────────

async fn list_providers(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ProviderConfig>>> {
    let providers = mgr
        .list_providers()
        .await
        .into_iter()
        .map(|provider| provider.masked())
        .collect();
    Json(ApiResponse::ok(providers))
}

async fn list_provider_templates(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ProviderTemplate>>> {
    Json(ApiResponse::ok(mgr.provider_templates()))
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
    if config.id.is_empty() {
        config.id = uuid::Uuid::new_v4().to_string();
    }
    mgr.add_provider(config.clone()).await;
    (
        StatusCode::CREATED,
        Json(ApiResponse::ok(config.normalized().masked())),
    )
}

async fn update_provider(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
    Json(mut config): Json<ProviderConfig>,
) -> impl IntoResponse {
    config.id.clone_from(&id);

    if (config.api_key.contains("...") || config.api_key == "****")
        && let Some(existing) = mgr.get_provider(&id).await
    {
        config.api_key = existing.api_key;
    }

    if mgr.update_provider(config).await {
        let provider = mgr
            .get_provider(&id)
            .await
            .expect("provider should exist after update");
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

async fn test_provider(
    State(mgr): State<Arc<AgentManager>>,
    Json(mut request): Json<ProviderProbeRequest>,
) -> impl IntoResponse {
    if request.provider.id.is_empty() {
        request.provider.id = "probe".into();
    }

    match mgr.probe_provider(request).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err(error.to_string())),
        )
            .into_response(),
    }
}

// ─── Agent Profile Handlers ────────────────────────────────────────────────

async fn list_profiles(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<AgentProfile>>> {
    Json(ApiResponse::ok(mgr.list_profiles().await))
}

async fn get_profile(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.get_profile(&id).await {
        Some(profile) => Json(ApiResponse::ok(profile)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Agent profile not found")),
        )
            .into_response(),
    }
}

async fn create_profile(
    State(mgr): State<Arc<AgentManager>>,
    Json(mut profile): Json<AgentProfile>,
) -> impl IntoResponse {
    if profile.id.is_empty() {
        profile.id = uuid::Uuid::new_v4().to_string();
    }
    mgr.add_profile(profile.clone()).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(profile)))
}

async fn update_profile(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
    Json(mut profile): Json<AgentProfile>,
) -> impl IntoResponse {
    profile.id.clone_from(&id);
    if mgr.update_profile(profile).await {
        let profile = mgr
            .get_profile(&id)
            .await
            .expect("profile should exist after update");
        Json(ApiResponse::ok(profile)).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Agent profile not found")),
        )
            .into_response()
    }
}

async fn delete_profile(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if mgr.delete_profile(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err(
                "Agent profile not found or cannot delete builtin profile",
            )),
        )
            .into_response()
    }
}

// ─── Tool / Config Handlers ────────────────────────────────────────────────

async fn list_tools(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ToolDefinition>>> {
    Json(ApiResponse::ok(mgr.tool_registry.read().await.definitions()))
}

async fn get_config(State(mgr): State<Arc<AgentManager>>) -> Json<ApiResponse<AgentConfig>> {
    Json(ApiResponse::ok(mgr.get_config().await))
}

async fn update_config(
    State(mgr): State<Arc<AgentManager>>,
    Json(config): Json<AgentConfig>,
) -> Json<ApiResponse<serde_json::Value>> {
    mgr.update_config(config).await;
    Json(ApiResponse::ok(serde_json::json!({"updated": true})))
}

// ─── Channel Handlers ─────────────────────────────────────────────────────

async fn list_channels(
    State(mgr): State<Arc<AgentManager>>,
) -> Json<ApiResponse<Vec<ChannelConfig>>> {
    Json(ApiResponse::ok(mgr.list_channels().await))
}

async fn get_channel(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.get_channel(&id).await {
        Some(channel) => Json(ApiResponse::ok(channel)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Channel not found")),
        )
            .into_response(),
    }
}

async fn create_channel(
    State(mgr): State<Arc<AgentManager>>,
    Json(mut channel): Json<ChannelConfig>,
) -> impl IntoResponse {
    if channel.id.is_empty() {
        channel.id = uuid::Uuid::new_v4().to_string();
    }
    mgr.add_channel(channel.clone()).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(channel)))
}

async fn update_channel(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
    Json(mut channel): Json<ChannelConfig>,
) -> impl IntoResponse {
    channel.id.clone_from(&id);
    if mgr.update_channel(channel).await {
        let channel = mgr
            .get_channel(&id)
            .await
            .expect("channel should exist after update");
        Json(ApiResponse::ok(channel)).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Channel not found")),
        )
            .into_response()
    }
}

async fn delete_channel(
    State(mgr): State<Arc<AgentManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if mgr.delete_channel(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err("Channel not found")),
        )
            .into_response()
    }
}
