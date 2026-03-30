use serde::{Deserialize, Serialize};

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
}

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
