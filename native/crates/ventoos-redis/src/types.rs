use serde::{Deserialize, Serialize};

// ── Connection mode ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RedisMode {
    #[default]
    Standalone,
    Sentinel,
    Cluster,
}

/// TLS configuration for Redis connections.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RedisTlsConfig {
    pub enabled: bool,
    pub ca_cert: Option<String>,
    pub client_cert: Option<String>,
    pub client_key: Option<String>,
    pub skip_verify: Option<bool>,
}

/// Sentinel-specific configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentinelConfig {
    pub sentinels: Vec<SentinelNode>,
    pub master_name: String,
    pub sentinel_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentinelNode {
    pub host: String,
    pub port: u16,
}

/// Cluster-specific configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterConfig {
    pub nodes: Vec<ClusterNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterNode {
    pub host: String,
    pub port: u16,
}

// ── Connection config ───────────────────────────────────────

/// Redis connection config.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConnectionConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    pub username: Option<String>,
    pub db: u8,
    pub group: Option<String>,
    pub ssl_enabled: bool,
    #[serde(default)]
    pub mode: RedisMode,
    pub tls: Option<RedisTlsConfig>,
    pub sentinel: Option<SentinelConfig>,
    pub cluster: Option<ClusterConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRedisConnectionReq {
    pub name: String,
    pub host: String,
    pub port: Option<u16>,
    pub password: Option<String>,
    pub username: Option<String>,
    pub db: Option<u8>,
    pub group: Option<String>,
    pub ssl_enabled: Option<bool>,
    pub mode: Option<RedisMode>,
    pub tls: Option<RedisTlsConfig>,
    pub sentinel: Option<SentinelConfig>,
    pub cluster: Option<ClusterConfig>,
}

// ── Key types ───────────────────────────────────────────────

/// Key info returned by SCAN.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisKeyInfo {
    pub key: String,
    pub key_type: String,
    pub ttl: i64,
    pub size: Option<i64>,
}

/// Detailed value of a key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisKeyValue {
    pub key: String,
    pub key_type: String,
    pub ttl: i64,
    pub value: serde_json::Value,
    pub encoding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisCommandResult {
    pub result: serde_json::Value,
    pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
    pub server_info: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisServerInfo {
    pub version: String,
    pub connected_clients: i64,
    pub used_memory_human: String,
    pub total_keys: i64,
    pub uptime_days: i64,
}

/// Scan request for paginated key browsing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisScanReq {
    pub cursor: String,
    pub pattern: Option<String>,
    pub count: Option<u32>,
    pub key_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisScanResult {
    pub cursor: String,
    pub keys: Vec<RedisKeyInfo>,
    pub finished: bool,
}

// ── Pub/Sub ─────────────────────────────────────────────────

/// Pub/Sub message received from a Redis subscription.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PubSubMessage {
    pub channel: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishRequest {
    pub channel: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscribeRequest {
    pub channels: Vec<String>,
}

// ── Stream types ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamEntry {
    pub id: String,
    pub fields: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamAddRequest {
    pub fields: Vec<(String, String)>,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamRangeRequest {
    pub start: Option<String>,
    pub end: Option<String>,
    pub count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamGroupCreateRequest {
    pub group_name: String,
    pub start_id: Option<String>,
}

// ── Batch operations ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchDeleteRequest {
    pub pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchTtlRequest {
    pub pattern: String,
    pub ttl: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchExportRequest {
    pub pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub affected: i64,
    pub keys: Vec<String>,
}

// ── Stats / INFO ────────────────────────────────────────────

/// Structured Redis INFO output.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RedisInfoParsed {
    pub sections: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryUsageResult {
    pub key: String,
    pub bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStatsResult {
    pub stats: serde_json::Value,
}

// ── MONITOR ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorEntry {
    pub timestamp: f64,
    pub client: String,
    pub command: String,
    pub args: Vec<String>,
    pub raw: String,
}
