#![allow(clippy::too_many_lines)]

use std::path::Path;
use std::sync::Arc;

use axum::extract::{Path as AxumPath, Query, State};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};

use ventoos_core::plugin::AppPlugin;
use ventoos_core::types::ApiResponse;

use crate::codegen;
use crate::import::{curl, openapi, postman};
use crate::models::{CollectionTree, CreateCollectionReq, Collection, UpdateCollectionReq, CreateFolderReq, Folder, UpdateFolderReq, ApiRequest, CreateApiRequestReq, UpdateApiRequestReq, Environment, CreateEnvironmentReq, UpdateEnvironmentReq, HistoryQuery, HistoryEntry, ExportData, CodegenReq, CodegenResult, FolderTree};
use crate::proxy;
use crate::store::ApiClientStore;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct ApiClientPlugin {
    store: Arc<ApiClientStore>,
}

impl ApiClientPlugin {
    pub fn new(data_dir: &Path) -> Self {
        let store = ApiClientStore::open(data_dir).expect("Failed to open API Client database");
        Self {
            store: Arc::new(store),
        }
    }
}

impl AppPlugin for ApiClientPlugin {
    fn app_id(&self) -> &'static str {
        "api-client"
    }

    fn routes(&self) -> Router {
        Router::new()
            // Collections
            .route(
                "/api/api-client/collections",
                get(list_collections).post(create_collection),
            )
            .route(
                "/api/api-client/collections/{id}",
                put(update_collection).delete(delete_collection),
            )
            // Folders
            .route("/api/api-client/folders", post(create_folder))
            .route(
                "/api/api-client/folders/{id}",
                put(update_folder).delete(delete_folder),
            )
            // Requests
            .route("/api/api-client/requests", post(create_request))
            .route(
                "/api/api-client/requests/{id}",
                get(get_request).put(update_request).delete(delete_request),
            )
            .route(
                "/api/api-client/requests/{id}/duplicate",
                post(duplicate_request),
            )
            // Environments
            .route(
                "/api/api-client/environments",
                get(list_environments).post(create_environment),
            )
            .route(
                "/api/api-client/environments/{id}",
                put(update_environment).delete(delete_environment),
            )
            // History
            .route(
                "/api/api-client/history",
                get(list_history).delete(clear_history),
            )
            .route("/api/api-client/history/{id}", delete(delete_history))
            // Proxy
            .route("/api/api-client/proxy/rest", post(proxy_rest))
            // Import
            .route("/api/api-client/import/openapi", post(import_openapi))
            .route("/api/api-client/import/postman", post(import_postman))
            .route("/api/api-client/import/curl", post(import_curl_handler))
            // Export
            .route(
                "/api/api-client/export/{collection_id}",
                get(export_collection),
            )
            // Code generation
            .route("/api/api-client/codegen", post(codegen_handler))
            .with_state(self.store.clone())
    }
}

type AppState = Arc<ApiClientStore>;

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

async fn list_collections(
    State(store): State<AppState>,
) -> Json<ApiResponse<Vec<CollectionTree>>> {
    match store.list_collections() {
        Ok(collections) => {
            let mut trees = Vec::with_capacity(collections.len());
            for col in collections {
                let folders = store
                    .list_folders_by_collection(&col.id)
                    .unwrap_or_default();
                let requests = store
                    .list_requests_by_collection(&col.id)
                    .unwrap_or_default();
                trees.push(build_collection_tree(col, &folders, &requests));
            }
            Json(ApiResponse::ok(trees))
        }
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn create_collection(
    State(store): State<AppState>,
    Json(req): Json<CreateCollectionReq>,
) -> Json<ApiResponse<Collection>> {
    match store.create_collection(&req) {
        Ok(col) => Json(ApiResponse::ok(col)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn update_collection(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<UpdateCollectionReq>,
) -> Json<ApiResponse<Collection>> {
    match store.update_collection(&id, &req) {
        Ok(Some(col)) => Json(ApiResponse::ok(col)),
        Ok(None) => Json(ApiResponse::err("Collection not found")),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn delete_collection(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<ApiResponse<bool>> {
    match store.delete_collection(&id) {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

async fn create_folder(
    State(store): State<AppState>,
    Json(req): Json<CreateFolderReq>,
) -> Json<ApiResponse<Folder>> {
    match store.create_folder(&req) {
        Ok(f) => Json(ApiResponse::ok(f)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn update_folder(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<UpdateFolderReq>,
) -> Json<ApiResponse<Folder>> {
    match store.update_folder(&id, &req) {
        Ok(Some(f)) => Json(ApiResponse::ok(f)),
        Ok(None) => Json(ApiResponse::err("Folder not found")),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn delete_folder(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<ApiResponse<bool>> {
    match store.delete_folder(&id) {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async fn get_request(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<ApiResponse<ApiRequest>> {
    match store.get_request(&id) {
        Ok(Some(r)) => Json(ApiResponse::ok(r)),
        Ok(None) => Json(ApiResponse::err("Request not found")),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn create_request(
    State(store): State<AppState>,
    Json(req): Json<CreateApiRequestReq>,
) -> Json<ApiResponse<ApiRequest>> {
    match store.create_request(&req) {
        Ok(r) => Json(ApiResponse::ok(r)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn update_request(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<UpdateApiRequestReq>,
) -> Json<ApiResponse<ApiRequest>> {
    match store.update_request(&id, &req) {
        Ok(Some(r)) => Json(ApiResponse::ok(r)),
        Ok(None) => Json(ApiResponse::err("Request not found")),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn delete_request(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<ApiResponse<bool>> {
    match store.delete_request(&id) {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn duplicate_request(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<ApiResponse<ApiRequest>> {
    match store.duplicate_request(&id) {
        Ok(Some(r)) => Json(ApiResponse::ok(r)),
        Ok(None) => Json(ApiResponse::err("Request not found")),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

async fn list_environments(
    State(store): State<AppState>,
) -> Json<ApiResponse<Vec<Environment>>> {
    match store.list_environments() {
        Ok(envs) => Json(ApiResponse::ok(envs)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn create_environment(
    State(store): State<AppState>,
    Json(req): Json<CreateEnvironmentReq>,
) -> Json<ApiResponse<Environment>> {
    match store.create_environment(&req) {
        Ok(env) => Json(ApiResponse::ok(env)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn update_environment(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<UpdateEnvironmentReq>,
) -> Json<ApiResponse<Environment>> {
    match store.update_environment(&id, &req) {
        Ok(Some(env)) => Json(ApiResponse::ok(env)),
        Ok(None) => Json(ApiResponse::err("Environment not found")),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn delete_environment(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<ApiResponse<bool>> {
    match store.delete_environment(&id) {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

async fn list_history(
    State(store): State<AppState>,
    Query(query): Query<HistoryQuery>,
) -> Json<ApiResponse<Vec<HistoryEntry>>> {
    match store.list_history(&query) {
        Ok(entries) => Json(ApiResponse::ok(entries)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn delete_history(
    State(store): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<ApiResponse<bool>> {
    match store.delete_history_entry(&id) {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

async fn clear_history(State(store): State<AppState>) -> Json<ApiResponse<()>> {
    match store.clear_history() {
        Ok(()) => Json(ApiResponse::ok(())),
        Err(e) => Json(ApiResponse::err(e.to_string())),
    }
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

async fn proxy_rest(
    State(store): State<AppState>,
    Json(req): Json<proxy::ProxyRequest>,
) -> Json<ApiResponse<proxy::ProxyResponse>> {
    // Save to history
    let history_entry = HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        request: serde_json::to_value(&req).unwrap_or_default(),
        response: None,
        duration_ms: None,
        starred: false,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    match proxy::execute_proxy(req).await {
        Ok(resp) => {
            // Update history with response
            let mut entry = history_entry;
            entry.response = Some(serde_json::json!({
                "status": resp.status,
                "duration_ms": resp.duration_ms,
                "size_bytes": resp.size_bytes,
            }));
            entry.duration_ms = Some(resp.duration_ms.cast_signed());
            let _ = store.add_history(&entry);

            Json(ApiResponse::ok(resp))
        }
        Err(e) => {
            let _ = store.add_history(&history_entry);
            Json(ApiResponse::err(e.to_string()))
        }
    }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
struct ImportJsonBody {
    data: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct ImportCurlBody {
    curl: String,
}

async fn import_openapi(
    State(store): State<AppState>,
    Json(body): Json<ImportJsonBody>,
) -> Json<ApiResponse<Collection>> {
    match openapi::import_openapi(&body.data) {
        Ok(result) => {
            if let Err(e) =
                store.import_collection(&result.collection, &result.folders, &result.requests)
            {
                return Json(ApiResponse::err(e.to_string()));
            }
            Json(ApiResponse::ok(result.collection))
        }
        Err(e) => Json(ApiResponse::err(e)),
    }
}

async fn import_postman(
    State(store): State<AppState>,
    Json(body): Json<ImportJsonBody>,
) -> Json<ApiResponse<Collection>> {
    match postman::import_postman(&body.data) {
        Ok(result) => {
            if let Err(e) =
                store.import_collection(&result.collection, &result.folders, &result.requests)
            {
                return Json(ApiResponse::err(e.to_string()));
            }
            Json(ApiResponse::ok(result.collection))
        }
        Err(e) => Json(ApiResponse::err(e)),
    }
}

async fn import_curl_handler(
    State(store): State<AppState>,
    Json(body): Json<ImportCurlBody>,
) -> Json<ApiResponse<Collection>> {
    match curl::import_curl(&body.curl) {
        Ok(result) => {
            if let Err(e) =
                store.import_collection(&result.collection, &result.folders, &result.requests)
            {
                return Json(ApiResponse::err(e.to_string()));
            }
            Json(ApiResponse::ok(result.collection))
        }
        Err(e) => Json(ApiResponse::err(e)),
    }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async fn export_collection(
    State(store): State<AppState>,
    AxumPath(collection_id): AxumPath<String>,
) -> Json<ApiResponse<ExportData>> {
    let collection = match store.get_collection(&collection_id) {
        Ok(Some(c)) => c,
        Ok(None) => return Json(ApiResponse::err("Collection not found")),
        Err(e) => return Json(ApiResponse::err(e.to_string())),
    };

    let folders = store
        .list_folders_by_collection(&collection_id)
        .unwrap_or_default();
    let requests = store
        .list_requests_by_collection(&collection_id)
        .unwrap_or_default();

    Json(ApiResponse::ok(ExportData {
        version: "1.0".into(),
        collection,
        folders,
        requests,
    }))
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

async fn codegen_handler(Json(req): Json<CodegenReq>) -> Json<ApiResponse<CodegenResult>> {
    let result = codegen::generate(&req);
    Json(ApiResponse::ok(result))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn build_collection_tree(
    collection: Collection,
    folders: &[Folder],
    requests: &[ApiRequest],
) -> CollectionTree {
    // Root-level requests (no folder)
    let root_requests: Vec<ApiRequest> = requests
        .iter()
        .filter(|r| r.folder_id.is_none())
        .cloned()
        .collect();

    // Root-level folders (no parent)
    let root_folders: Vec<FolderTree> = folders
        .iter()
        .filter(|f| f.parent_folder_id.is_none())
        .map(|f| build_folder_tree(f, folders, requests))
        .collect();

    CollectionTree {
        collection,
        folders: root_folders,
        requests: root_requests,
    }
}

fn build_folder_tree(
    folder: &Folder,
    all_folders: &[Folder],
    all_requests: &[ApiRequest],
) -> FolderTree {
    let children: Vec<FolderTree> = all_folders
        .iter()
        .filter(|f| f.parent_folder_id.as_deref() == Some(&folder.id))
        .map(|f| build_folder_tree(f, all_folders, all_requests))
        .collect();

    let folder_requests: Vec<ApiRequest> = all_requests
        .iter()
        .filter(|r| r.folder_id.as_deref() == Some(&folder.id))
        .cloned()
        .collect();

    FolderTree {
        folder: folder.clone(),
        children,
        requests: folder_requests,
    }
}
