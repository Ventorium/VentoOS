use serde::{Deserialize, Serialize};

/// Database engine type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DbEngine {
    #[serde(rename = "postgresql")]
    PostgreSql,
    #[serde(rename = "mysql")]
    MySql,
    #[serde(rename = "sqlite")]
    Sqlite,
}

// ── SSH Tunnel Types ───────────────────────────────────────────────────────

/// SSH authentication method for tunnel connections.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SshTunnelAuth {
    #[serde(rename = "password")]
    Password(String),
    #[serde(rename = "private_key")]
    PrivateKey {
        key_pem: String,
        passphrase: Option<String>,
    },
}

/// SSH tunnel configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshTunnelConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshTunnelAuth,
}

/// A database connection configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbConnectionConfig {
    pub id: String,
    pub name: String,
    pub engine: DbEngine,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    /// For `SQLite`: file path
    #[serde(alias = "file_path")]
    pub sqlite_path: Option<String>,
    pub group: Option<String>,
    pub ssl_enabled: bool,
    /// Optional SSH tunnel configuration.
    pub tunnel: Option<SshTunnelConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDbConnectionReq {
    pub name: String,
    pub engine: DbEngine,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    #[serde(alias = "file_path")]
    pub sqlite_path: Option<String>,
    pub group: Option<String>,
    pub ssl_enabled: Option<bool>,
    /// Optional SSH tunnel configuration.
    pub tunnel: Option<SshTunnelConfig>,
}

/// Schema info returned by discovery.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaInfo {
    pub name: String,
    pub tables: Vec<TableInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub schema: Option<String>,
    pub table_type: String, // "table" | "view"
    pub row_count_estimate: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
    pub max_length: Option<i64>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableStructure {
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
}

/// Query result for SQL execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub affected_rows: Option<u64>,
    pub execution_time_ms: u64,
}

/// Paginated data request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableDataReq {
    pub schema: Option<String>,
    pub table: String,
    pub page: u32,
    pub page_size: u32,
    pub order_by: Option<String>,
    pub order_dir: Option<String>,
    pub filter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
    pub server_version: Option<String>,
}

// ── Export Types ────────────────────────────────────────────────────────────

/// Export format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportFormat {
    #[serde(rename = "csv")]
    Csv,
    #[serde(rename = "json_array")]
    JsonArray,
    #[serde(rename = "json_lines")]
    JsonLines,
}

/// Export request body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportReq {
    pub sql: String,
    pub format: ExportFormat,
}

// ── EXPLAIN Types ──────────────────────────────────────────────────────────

/// A node in an EXPLAIN query plan tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainNode {
    pub node_type: String,
    pub relation: Option<String>,
    pub startup_cost: Option<f64>,
    pub total_cost: Option<f64>,
    pub plan_rows: Option<u64>,
    pub actual_rows: Option<u64>,
    pub actual_time: Option<f64>,
    pub plan_width: Option<u64>,
    pub children: Vec<ExplainNode>,
}

/// EXPLAIN result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainResult {
    pub root: ExplainNode,
    pub planning_time: Option<f64>,
    pub execution_time: Option<f64>,
}

/// EXPLAIN request body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainReq {
    pub sql: String,
}

// ── Completion Types ───────────────────────────────────────────────────────

/// Column info for auto-completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionColumn {
    pub name: String,
    pub data_type: String,
}

/// Table info for auto-completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionTable {
    pub name: String,
    pub columns: Vec<CompletionColumn>,
}

/// Schema info for auto-completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionSchema {
    pub name: String,
    pub tables: Vec<CompletionTable>,
}

/// Full completion tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionTree {
    pub schemas: Vec<CompletionSchema>,
}

// ── Row Edit Types ─────────────────────────────────────────────────────────

/// Request to update rows in a table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RowUpdateReq {
    pub schema: Option<String>,
    pub table: String,
    /// Primary key column name → value for identifying the row.
    pub pk: serde_json::Map<String, serde_json::Value>,
    /// Column name → new value for the fields to update.
    pub changes: serde_json::Map<String, serde_json::Value>,
}

/// Request to delete rows from a table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RowDeleteReq {
    pub schema: Option<String>,
    pub table: String,
    /// Primary key column name → value for identifying the row.
    pub pk: serde_json::Map<String, serde_json::Value>,
}
