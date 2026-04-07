use std::sync::Arc;

use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::K8sManager;
use crate::port_forward::PortForwardManager;
use crate::types::{
    CreateK8sClusterReq, CreatePortForwardReq, K8sCluster, K8sResourceKind, K8sResourceListReq,
    PodExecReq, PodLogStreamReq,
};

/// Shared state for K8s routes.
#[derive(Clone)]
pub struct K8sState {
    pub manager: Arc<K8sManager>,
    pub port_forwards: Arc<PortForwardManager>,
}

/// Kubernetes application plugin.
pub struct K8sPlugin {
    state: K8sState,
}

impl K8sPlugin {
    pub fn new(manager: Arc<K8sManager>) -> Self {
        Self {
            state: K8sState {
                manager,
                port_forwards: Arc::new(PortForwardManager::new()),
            },
        }
    }
}

impl AppPlugin for K8sPlugin {
    fn app_id(&self) -> &'static str {
        "kubernetes"
    }

    fn routes(&self) -> Router {
        Router::new()
            // Cluster management
            .route("/api/k8s/clusters", get(list_clusters).post(create_cluster))
            .route(
                "/api/k8s/clusters/{id}",
                get(get_cluster).delete(delete_cluster),
            )
            .route("/api/k8s/clusters/{id}/test", post(test_cluster))
            .route("/api/k8s/clusters/{id}/namespaces", get(list_namespaces))
            // Resource browsing
            .route("/api/k8s/clusters/{id}/resources", get(list_resources))
            .route(
                "/api/k8s/clusters/{id}/resources/{kind}/{name}",
                get(get_resource_detail),
            )
            .route(
                "/api/k8s/clusters/{id}/resources/{kind}/{name}/yaml",
                get(get_resource_yaml).put(update_resource_yaml),
            )
            .route(
                "/api/k8s/clusters/{id}/resources/{kind}/{name}/events",
                get(get_resource_events),
            )
            // Pod logs
            .route("/api/k8s/clusters/{id}/pods/{name}/logs", get(get_pod_logs))
            .route(
                "/api/k8s/clusters/{id}/pods/{name}/logs/stream",
                get(ws_pod_logs),
            )
            // Pod exec
            .route("/api/k8s/clusters/{id}/pods/{name}/exec", get(ws_pod_exec))
            // Port-forward
            .route(
                "/api/k8s/clusters/{id}/port-forward",
                get(list_port_forwards).post(create_port_forward),
            )
            .route(
                "/api/k8s/clusters/{id}/port-forward/{fw_id}",
                delete(stop_port_forward),
            )
            // Service bridge
            .route(
                "/api/k8s/clusters/{id}/services/{svc_name}/detect",
                get(detect_service),
            )
            .route(
                "/api/k8s/clusters/{id}/services/{svc_name}/bridge",
                post(bridge_service),
            )
            // Kubeconfig parse
            .route("/api/k8s/kubeconfig/parse", post(parse_kubeconfig))
            .with_state(self.state.clone())
    }
}

// ─── Cluster Management Handlers ───────────────────────────────────────────

async fn list_clusters(State(st): State<K8sState>) -> Json<ApiResponse<Vec<K8sCluster>>> {
    let list = st.manager.list_clusters().await;
    Json(ApiResponse::ok(list))
}

async fn create_cluster(
    State(st): State<K8sState>,
    Json(req): Json<CreateK8sClusterReq>,
) -> (StatusCode, Json<ApiResponse<K8sCluster>>) {
    let cluster = st.manager.create_cluster(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(cluster)))
}

async fn get_cluster(State(st): State<K8sState>, Path(id): Path<String>) -> impl IntoResponse {
    match st.manager.get_cluster(&id).await {
        Some(cluster) => Json(ApiResponse::ok(cluster)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response(),
    }
}

async fn delete_cluster(State(st): State<K8sState>, Path(id): Path<String>) -> impl IntoResponse {
    // Also stop all port-forwards for this cluster
    st.port_forwards.stop_all(&id).await;
    if st.manager.delete_cluster(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response()
    }
}

async fn test_cluster(State(st): State<K8sState>, Path(id): Path<String>) -> impl IntoResponse {
    match st.manager.test_cluster(&id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response(),
    }
}

async fn list_namespaces(State(st): State<K8sState>, Path(id): Path<String>) -> impl IntoResponse {
    match st.manager.list_namespaces(&id).await {
        Ok(ns) => Json(ApiResponse::ok(ns)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Resource Browsing Handlers ────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct ResourceQuery {
    namespace: Option<String>,
    kind: String,
    label_selector: Option<String>,
}

async fn list_resources(
    State(st): State<K8sState>,
    Path(id): Path<String>,
    Query(query): Query<ResourceQuery>,
) -> impl IntoResponse {
    let kind: K8sResourceKind =
        serde_json::from_value(serde_json::Value::String(query.kind.to_lowercase()))
            .unwrap_or(K8sResourceKind::Pod);
    let req = K8sResourceListReq {
        cluster_id: id,
        namespace: query.namespace,
        kind,
        label_selector: query.label_selector,
    };
    match st.manager.list_resources(&req).await {
        Ok(resources) => Json(ApiResponse::ok(resources)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct ResourcePathParams {
    id: String,
    kind: String,
    name: String,
}

#[derive(serde::Deserialize)]
struct NsQuery {
    #[serde(rename = "ns")]
    namespace: Option<String>,
}

async fn get_resource_detail(
    State(st): State<K8sState>,
    Path(ResourcePathParams { id, kind, name }): Path<ResourcePathParams>,
    Query(q): Query<NsQuery>,
) -> impl IntoResponse {
    let kind: K8sResourceKind =
        serde_json::from_value(serde_json::Value::String(kind.to_lowercase()))
            .unwrap_or(K8sResourceKind::Pod);
    match st
        .manager
        .get_resource_detail(&id, kind, q.namespace.as_deref(), &name)
        .await
    {
        Ok(detail) => Json(ApiResponse::ok(detail)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn get_resource_yaml(
    State(st): State<K8sState>,
    Path(ResourcePathParams { id, kind, name }): Path<ResourcePathParams>,
    Query(q): Query<NsQuery>,
) -> impl IntoResponse {
    let kind: K8sResourceKind =
        serde_json::from_value(serde_json::Value::String(kind.to_lowercase()))
            .unwrap_or(K8sResourceKind::Pod);
    match st
        .manager
        .get_resource_yaml(&id, kind, q.namespace.as_deref(), &name)
        .await
    {
        Ok(yaml) => Json(ApiResponse::ok(yaml)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn update_resource_yaml(
    State(st): State<K8sState>,
    Path(ResourcePathParams { id, kind, name }): Path<ResourcePathParams>,
    Query(q): Query<NsQuery>,
    body: String,
) -> impl IntoResponse {
    let kind: K8sResourceKind =
        serde_json::from_value(serde_json::Value::String(kind.to_lowercase()))
            .unwrap_or(K8sResourceKind::Pod);
    match st
        .manager
        .update_resource_yaml(&id, kind, q.namespace.as_deref(), &name, &body)
        .await
    {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn get_resource_events(
    State(st): State<K8sState>,
    Path(ResourcePathParams { id, kind, name }): Path<ResourcePathParams>,
    Query(q): Query<NsQuery>,
) -> impl IntoResponse {
    let kind: K8sResourceKind =
        serde_json::from_value(serde_json::Value::String(kind.to_lowercase()))
            .unwrap_or(K8sResourceKind::Pod);
    match st
        .manager
        .get_resource_events(&id, kind, q.namespace.as_deref(), &name)
        .await
    {
        Ok(events) => Json(ApiResponse::ok(events)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Pod Log Handlers ──────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct PodPathParams {
    id: String,
    name: String,
}

#[derive(serde::Deserialize)]
struct LogQuery {
    container: Option<String>,
    tail: Option<u64>,
    namespace: Option<String>,
}

async fn get_pod_logs(
    State(st): State<K8sState>,
    Path(PodPathParams { id, name }): Path<PodPathParams>,
    Query(q): Query<LogQuery>,
) -> impl IntoResponse {
    let client = match st.manager.build_shared_client(&id).await {
        Ok(c) => c,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response();
        }
    };

    let ns = q.namespace.as_deref().unwrap_or("default");
    let tail = q.tail.unwrap_or(100);
    let mut url =
        format!("/api/v1/namespaces/{ns}/pods/{name}/log?tailLines={tail}&timestamps=true");
    if let Some(ref container) = q.container {
        url.push_str("&container=");
        url.push_str(container);
    }

    match client.get_raw_text(&url).await {
        Ok(logs) => Json(ApiResponse::ok(logs)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn ws_pod_logs(
    ws: WebSocketUpgrade,
    State(st): State<K8sState>,
    Path(PodPathParams { id, name }): Path<PodPathParams>,
    Query(req): Query<PodLogStreamReq>,
) -> impl IntoResponse {
    let client = match st.manager.build_shared_client(&id).await {
        Ok(c) => c,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response();
        }
    };

    let namespace = req
        .label_selector
        .as_ref()
        .map(|_| "default".to_string())
        .unwrap_or_else(|| "default".to_string());
    let pod_name = name.clone();

    ws.on_upgrade(move |socket| async move {
        crate::log_stream::handle_log_stream(socket, client, &namespace, &pod_name, req).await;
    })
    .into_response()
}

// ─── Pod Exec Handler ──────────────────────────────────────────────────────

async fn ws_pod_exec(
    ws: WebSocketUpgrade,
    State(st): State<K8sState>,
    Path(PodPathParams { id, name }): Path<PodPathParams>,
    Query(req): Query<PodExecReq>,
) -> impl IntoResponse {
    let client = match st.manager.build_shared_client(&id).await {
        Ok(c) => c,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response();
        }
    };

    let pod_name = name.clone();

    ws.on_upgrade(move |socket| async move {
        crate::exec::handle_exec(socket, client, "default", &pod_name, req).await;
    })
    .into_response()
}

// ─── Port-Forward Handlers ─────────────────────────────────────────────────

async fn list_port_forwards(
    State(st): State<K8sState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<Vec<crate::types::PortForwardInfo>>> {
    let list = st.port_forwards.list(&id).await;
    Json(ApiResponse::ok(list))
}

async fn create_port_forward(
    State(st): State<K8sState>,
    Path(id): Path<String>,
    Json(req): Json<CreatePortForwardReq>,
) -> impl IntoResponse {
    match st.port_forwards.create(&id, &req).await {
        Ok(info) => (StatusCode::CREATED, Json(ApiResponse::ok(info))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct PortForwardPathParams {
    #[allow(dead_code)]
    id: String,
    fw_id: String,
}

async fn stop_port_forward(
    State(st): State<K8sState>,
    Path(PortForwardPathParams { id: _, fw_id }): Path<PortForwardPathParams>,
) -> impl IntoResponse {
    if st.port_forwards.stop(&fw_id).await {
        Json(ApiResponse::ok(serde_json::json!({"stopped": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("Port-forward not found")),
        )
            .into_response()
    }
}

// ─── Service Bridge Handlers ───────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct ServicePathParams {
    id: String,
    svc_name: String,
}

#[derive(serde::Deserialize)]
struct ServiceNsQuery {
    #[serde(rename = "ns")]
    namespace: Option<String>,
}

async fn detect_service(
    State(st): State<K8sState>,
    Path(ServicePathParams { id, svc_name }): Path<ServicePathParams>,
    Query(q): Query<ServiceNsQuery>,
) -> impl IntoResponse {
    let client = match st.manager.build_shared_client(&id).await {
        Ok(c) => c,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response();
        }
    };

    let ns = q.namespace.as_deref().unwrap_or("default");
    match crate::service_bridge::detect_service(&client, ns, &svc_name).await {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

async fn bridge_service(
    State(st): State<K8sState>,
    Path(ServicePathParams { id, svc_name }): Path<ServicePathParams>,
    Query(q): Query<ServiceNsQuery>,
) -> impl IntoResponse {
    let client = match st.manager.build_shared_client(&id).await {
        Ok(c) => c,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response();
        }
    };

    let ns = q.namespace.as_deref().unwrap_or("default");
    match crate::service_bridge::bridge_service(&client, &st.port_forwards, &id, ns, &svc_name)
        .await
    {
        Ok(result) => Json(ApiResponse::ok(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

// ─── Kubeconfig Parse ──────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct KubeconfigParseBody {
    path: Option<String>,
    content: Option<String>,
}

async fn parse_kubeconfig(
    State(st): State<K8sState>,
    Json(body): Json<KubeconfigParseBody>,
) -> impl IntoResponse {
    let result = if let Some(ref path) = body.path {
        st.manager.parse_kubeconfig_contexts(path).await
    } else if let Some(ref content) = body.content {
        K8sManager::parse_kubeconfig_yaml(content)
    } else {
        Err("Either path or content is required".into())
    };
    match result {
        Ok(contexts) => Json(ApiResponse::ok(contexts)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}
