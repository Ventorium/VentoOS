use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pre_request_script: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_script: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCollectionReq {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub auth: Option<serde_json::Value>,
    #[serde(default)]
    pub headers: Option<serde_json::Value>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
    #[serde(default)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    pub test_script: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCollectionReq {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub auth: Option<serde_json::Value>,
    #[serde(default)]
    pub headers: Option<serde_json::Value>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
    #[serde(default)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    pub test_script: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
}

// ---------------------------------------------------------------------------
// Folder
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub collection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_folder_id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pre_request_script: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_script: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateFolderReq {
    pub collection_id: String,
    #[serde(default)]
    pub parent_folder_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub auth: Option<serde_json::Value>,
    #[serde(default)]
    pub headers: Option<serde_json::Value>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
    #[serde(default)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    pub test_script: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFolderReq {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub auth: Option<serde_json::Value>,
    #[serde(default)]
    pub headers: Option<serde_json::Value>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
    #[serde(default)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    pub test_script: Option<String>,
    #[serde(default)]
    pub parent_folder_id: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
}

// ---------------------------------------------------------------------------
// ApiRequest
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRequest {
    pub id: String,
    pub collection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pre_request_script: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_script: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateApiRequestReq {
    pub collection_id: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub name: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub params: Option<serde_json::Value>,
    #[serde(default)]
    pub headers: Option<serde_json::Value>,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
    #[serde(default)]
    pub auth: Option<serde_json::Value>,
    #[serde(default)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    pub test_script: Option<String>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
    #[serde(default)]
    pub description: Option<String>,
}

fn default_method() -> String {
    "GET".to_string()
}

#[derive(Debug, Deserialize)]
pub struct UpdateApiRequestReq {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub params: Option<serde_json::Value>,
    #[serde(default)]
    pub headers: Option<serde_json::Value>,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
    #[serde(default)]
    pub auth: Option<serde_json::Value>,
    #[serde(default)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    pub test_script: Option<String>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub variables: serde_json::Value,
    pub is_global: bool,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEnvironmentReq {
    pub name: String,
    #[serde(default = "default_variables")]
    pub variables: serde_json::Value,
    #[serde(default)]
    pub is_global: bool,
}

fn default_variables() -> serde_json::Value {
    serde_json::Value::Array(vec![])
}

#[derive(Debug, Deserialize)]
pub struct UpdateEnvironmentReq {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
    #[serde(default)]
    pub is_global: Option<bool>,
    #[serde(default)]
    pub sort_order: Option<i32>,
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub request: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    pub starred: bool,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Cookie
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cookie {
    pub id: String,
    pub domain: String,
    pub name: String,
    pub value: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires: Option<String>,
    pub http_only: bool,
    pub secure: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub same_site: Option<String>,
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

// ---------------------------------------------------------------------------
// Collection tree (for GET /collections response)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionTree {
    #[serde(flatten)]
    pub collection: Collection,
    pub folders: Vec<FolderTree>,
    pub requests: Vec<ApiRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderTree {
    #[serde(flatten)]
    pub folder: Folder,
    pub children: Vec<FolderTree>,
    pub requests: Vec<ApiRequest>,
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct ExportData {
    pub version: String,
    pub collection: Collection,
    pub folders: Vec<Folder>,
    pub requests: Vec<ApiRequest>,
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct ImportResult {
    pub collection: Collection,
    pub folders: Vec<Folder>,
    pub requests: Vec<ApiRequest>,
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CodegenReq {
    pub target: CodegenTarget,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Option<Vec<KeyValue>>,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodegenTarget {
    Curl,
    JavascriptFetch,
    PythonRequests,
}

#[derive(Debug, Serialize)]
pub struct CodegenResult {
    pub target: String,
    pub code: String,
}

// ---------------------------------------------------------------------------
// History query params
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub starred: Option<bool>,
}

fn default_limit() -> u32 {
    50
}
