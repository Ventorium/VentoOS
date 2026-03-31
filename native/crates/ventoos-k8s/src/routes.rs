use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::manager::K8sManager;
use crate::types::{CreateK8sClusterReq, K8sCluster, K8sResourceKind, K8sResourceListReq};

/// Kubernetes application plugin.
pub struct K8sPlugin {
    manager: Arc<K8sManager>,
}

impl K8sPlugin {
    pub fn new(manager: Arc<K8sManager>) -> Self {
        Self { manager }
    }
}

impl AppPlugin for K8sPlugin {
    fn app_id(&self) -> &'static str {
        "kubernetes"
    }

    fn routes(&self) -> Router {
        Router::new()
            .route("/api/k8s/clusters", get(list_clusters).post(create_cluster))
            .route(
                "/api/k8s/clusters/{id}",
                get(get_cluster).delete(delete_cluster),
            )
            .route("/api/k8s/clusters/{id}/test", post(test_cluster))
            .route("/api/k8s/clusters/{id}/namespaces", get(list_namespaces))
            .route("/api/k8s/clusters/{id}/resources", get(list_resources))
            .route("/api/k8s/kubeconfig/parse", post(parse_kubeconfig))
            .with_state(self.manager.clone())
    }
}

// --- Handlers ---

async fn list_clusters(State(mgr): State<Arc<K8sManager>>) -> Json<ApiResponse<Vec<K8sCluster>>> {
    let list = mgr.list_clusters().await;
    Json(ApiResponse::ok(list))
}

async fn create_cluster(
    State(mgr): State<Arc<K8sManager>>,
    Json(req): Json<CreateK8sClusterReq>,
) -> (StatusCode, Json<ApiResponse<K8sCluster>>) {
    let cluster = mgr.create_cluster(req).await;
    (StatusCode::CREATED, Json(ApiResponse::ok(cluster)))
}

async fn get_cluster(
    State(mgr): State<Arc<K8sManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.get_cluster(&id).await {
        Some(cluster) => Json(ApiResponse::ok(cluster)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response(),
    }
}

async fn delete_cluster(
    State(mgr): State<Arc<K8sManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if mgr.delete_cluster(&id).await {
        Json(ApiResponse::ok(serde_json::json!({"deleted": true}))).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response()
    }
}

async fn test_cluster(
    State(mgr): State<Arc<K8sManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.test_cluster(&id).await {
        Some(result) => Json(ApiResponse::ok(result)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err("K8s cluster not found")),
        )
            .into_response(),
    }
}

async fn list_namespaces(
    State(mgr): State<Arc<K8sManager>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match mgr.list_namespaces(&id).await {
        Ok(ns) => Json(ApiResponse::ok(ns)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct ResourceQuery {
    namespace: Option<String>,
    kind: String,
    label_selector: Option<String>,
}

async fn list_resources(
    State(mgr): State<Arc<K8sManager>>,
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
    match mgr.list_resources(&req).await {
        Ok(resources) => Json(ApiResponse::ok(resources)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(&e))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct KubeconfigParseBody {
    path: Option<String>,
    content: Option<String>,
}

async fn parse_kubeconfig(
    State(mgr): State<Arc<K8sManager>>,
    Json(body): Json<KubeconfigParseBody>,
) -> impl IntoResponse {
    let result = if let Some(ref path) = body.path {
        mgr.parse_kubeconfig_contexts(path).await
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
