use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::RwLock;
use tracing::info;

use crate::types::{
    CreateRedisConnectionReq, RedisCommandResult, RedisConnectionConfig, RedisKeyInfo,
    RedisKeyValue, RedisScanReq, RedisScanResult, RedisServerInfo, RedisTestResult,
};

/// Redis connection manager.
/// Manages multiple Redis connections and provides key browsing, value editing, etc.
pub struct RedisManager {
    configs: Arc<RwLock<HashMap<String, RedisConnectionConfig>>>,
    /// Active connections keyed by config id.
    connections: Arc<RwLock<HashMap<String, RedisConn>>>,
}

/// Internal Redis connection wrapper.
/// Uses tokio `TcpStream` with RESP protocol for communication.
struct RedisConn {
    /// Simple RESP client using raw TCP.
    stream: Arc<tokio::sync::Mutex<tokio::net::TcpStream>>,
}

impl RedisManager {
    pub fn new() -> Self {
        Self {
            configs: Arc::new(RwLock::new(HashMap::new())),
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_connection(&self, req: CreateRedisConnectionReq) -> RedisConnectionConfig {
        let id = uuid::Uuid::new_v4().to_string();
        let config = RedisConnectionConfig {
            id: id.clone(),
            name: req.name,
            host: req.host,
            port: req.port.unwrap_or(6379),
            password: req.password,
            username: req.username,
            db: req.db.unwrap_or(0),
            group: req.group,
            ssl_enabled: req.ssl_enabled.unwrap_or(false),
        };
        self.configs.write().await.insert(id, config.clone());
        config
    }

    pub async fn list_connections(&self) -> Vec<RedisConnectionConfig> {
        let configs = self.configs.read().await;
        let mut list: Vec<_> = configs.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn get_connection(&self, id: &str) -> Option<RedisConnectionConfig> {
        self.configs.read().await.get(id).cloned()
    }

    pub async fn delete_connection(&self, id: &str) -> bool {
        self.connections.write().await.remove(id);
        self.configs.write().await.remove(id).is_some()
    }

    pub async fn test_connection(&self, id: &str) -> Option<RedisTestResult> {
        let config = self.configs.read().await.get(id)?.clone();
        let start = Instant::now();

        let addr = format!("{}:{}", config.host, config.port);
        match tokio::net::TcpStream::connect(&addr).await {
            Ok(mut stream) => {
                let ping_cmd = "*1\r\n$4\r\nPING\r\n";
                if stream.write_all(ping_cmd.as_bytes()).await.is_ok() {
                    let mut buf = [0u8; 128];
                    if let Ok(n) = stream.read(&mut buf).await {
                        let response = String::from_utf8_lossy(&buf[..n]);
                        if response.contains("PONG") || response.contains("+PONG") {
                            return Some(RedisTestResult {
                                success: true,
                                message: "PONG — Connected successfully".into(),
                                latency_ms: Some(
                                    u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
                                ),
                                server_info: None,
                            });
                        }
                        // May need AUTH first
                        if response.contains("NOAUTH") || response.contains("AUTH") {
                            return Some(RedisTestResult {
                                success: true,
                                message: "Server reachable (requires authentication)".into(),
                                latency_ms: Some(
                                    u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
                                ),
                                server_info: None,
                            });
                        }
                    }
                }
                Some(RedisTestResult {
                    success: true,
                    message: "TCP connection established".into(),
                    latency_ms: Some(
                        u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
                    ),
                    server_info: None,
                })
            }
            Err(e) => Some(RedisTestResult {
                success: false,
                message: format!("Cannot reach {addr}: {e}"),
                latency_ms: Some(u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX)),
                server_info: None,
            }),
        }
    }

    /// Connect to Redis (creates a session).
    pub async fn connect(&self, id: &str) -> Result<(), String> {
        let config = self
            .configs
            .read()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| "Connection not found".to_string())?;

        let addr = format!("{}:{}", config.host, config.port);
        let mut stream = tokio::net::TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Connection failed: {e}"))?;

        // AUTH if password is set
        if let Some(ref password) = config.password {
            let auth_cmd = if let Some(ref username) = config.username {
                format!(
                    "*3\r\n$4\r\nAUTH\r\n${}\r\n{}\r\n${}\r\n{}\r\n",
                    username.len(),
                    username,
                    password.len(),
                    password
                )
            } else {
                format!(
                    "*2\r\n$4\r\nAUTH\r\n${}\r\n{}\r\n",
                    password.len(),
                    password
                )
            };
            stream
                .write_all(auth_cmd.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
            let mut buf = [0u8; 256];
            let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
            let resp = String::from_utf8_lossy(&buf[..n]);
            if resp.contains("-ERR") {
                return Err(format!("Auth failed: {resp}"));
            }
        }

        // SELECT db
        if config.db > 0 {
            let select_cmd = format!(
                "*2\r\n$6\r\nSELECT\r\n${}\r\n{}\r\n",
                config.db.to_string().len(),
                config.db
            );
            stream
                .write_all(select_cmd.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
            let mut buf = [0u8; 128];
            stream.read(&mut buf).await.map_err(|e| e.to_string())?;
        }

        let conn = RedisConn {
            stream: Arc::new(tokio::sync::Mutex::new(stream)),
        };
        self.connections.write().await.insert(id.to_string(), conn);
        info!("Connected to Redis {id}");
        Ok(())
    }

    pub async fn disconnect(&self, id: &str) {
        self.connections.write().await.remove(id);
    }

    /// Send raw RESP command and get response.
    async fn send_command(conn: &RedisConn, args: &[&str]) -> Result<String, String> {
        use std::fmt::Write as _;

        let mut cmd = format!("*{}\r\n", args.len());
        for arg in args {
            write!(cmd, "${}\r\n{}\r\n", arg.len(), arg).unwrap();
        }

        let mut stream = conn.stream.lock().await;
        stream
            .write_all(cmd.as_bytes())
            .await
            .map_err(|e| e.to_string())?;

        let mut buf = vec![0u8; 65536];
        let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&buf[..n]).into_owned())
    }

    /// Parse a simple RESP response (handles +, -, :, $, * prefixes).
    fn parse_resp_value(resp: &str) -> serde_json::Value {
        let trimmed = resp.trim();
        if trimmed.starts_with('+') {
            serde_json::Value::String(trimmed.strip_prefix('+').unwrap_or("").trim().to_string())
        } else if trimmed.starts_with('-') {
            serde_json::Value::String(trimmed.to_string())
        } else if trimmed.starts_with(':') {
            if let Ok(n) = trimmed
                .strip_prefix(':')
                .unwrap_or("")
                .trim()
                .parse::<i64>()
            {
                serde_json::Value::Number(n.into())
            } else {
                serde_json::Value::String(trimmed.to_string())
            }
        } else if trimmed.starts_with("$-1") {
            serde_json::Value::Null
        } else if trimmed.starts_with('$') {
            // Bulk string — extract value after \r\n
            if let Some(pos) = trimmed.find("\r\n") {
                let bulk_data = &trimmed[pos + 2..];
                if let Some(end) = bulk_data.find("\r\n") {
                    serde_json::Value::String(bulk_data[..end].to_string())
                } else {
                    serde_json::Value::String(bulk_data.trim().to_string())
                }
            } else {
                serde_json::Value::String(trimmed.to_string())
            }
        } else {
            serde_json::Value::String(trimmed.to_string())
        }
    }

    /// Scan keys with cursor-based pagination.
    pub async fn scan_keys(
        &self,
        conn_id: &str,
        req: &RedisScanReq,
    ) -> Result<RedisScanResult, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let count = req.count.unwrap_or(100).to_string();
        let pattern = req.pattern.as_deref().unwrap_or("*");

        let mut args: Vec<&str> = vec!["SCAN", &req.cursor, "MATCH", pattern, "COUNT", &count];
        if let Some(ref ktype) = req.key_type {
            args.push("TYPE");
            args.push(ktype);
        }

        let resp = Self::send_command(conn, &args).await?;

        // Parse SCAN response: *2\r\n$cursor_len\r\ncursor\r\n*count\r\n...
        let lines: Vec<&str> = resp.split("\r\n").collect();
        let mut cursor = "0".to_string();
        let mut keys = Vec::new();

        // Simple parsing — find cursor and keys
        if lines.len() >= 4 {
            // lines[0] = *2, lines[1] = $len, lines[2] = cursor value
            cursor = lines[2].to_string();
            // Parse keys array
            for line in lines.iter().skip(4) {
                if !line.is_empty() && !line.starts_with('*') && !line.starts_with('$') {
                    keys.push(RedisKeyInfo {
                        key: (*line).to_string(),
                        key_type: "unknown".into(),
                        ttl: -1,
                        size: None,
                    });
                }
            }
        }

        let finished = cursor == "0";
        Ok(RedisScanResult {
            cursor,
            keys,
            finished,
        })
    }

    /// Get value for a specific key.
    pub async fn get_key_value(&self, conn_id: &str, key: &str) -> Result<RedisKeyValue, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        // Get type
        let type_resp = Self::send_command(conn, &["TYPE", key]).await?;
        let key_type = Self::parse_resp_value(&type_resp);
        let key_type_str = key_type.as_str().unwrap_or("string").to_string();

        // Get TTL
        let ttl_resp = Self::send_command(conn, &["TTL", key]).await?;
        let ttl = Self::parse_resp_value(&ttl_resp).as_i64().unwrap_or(-1);

        // Get value based on type
        let value = match key_type_str.as_str() {
            "string" => {
                let resp = Self::send_command(conn, &["GET", key]).await?;
                Self::parse_resp_value(&resp)
            }
            "list" => {
                let resp = Self::send_command(conn, &["LRANGE", key, "0", "999"]).await?;
                Self::parse_resp_value(&resp)
            }
            "set" => {
                let resp = Self::send_command(conn, &["SMEMBERS", key]).await?;
                Self::parse_resp_value(&resp)
            }
            "hash" => {
                let resp = Self::send_command(conn, &["HGETALL", key]).await?;
                Self::parse_resp_value(&resp)
            }
            "zset" => {
                let resp =
                    Self::send_command(conn, &["ZRANGE", key, "0", "999", "WITHSCORES"]).await?;
                Self::parse_resp_value(&resp)
            }
            _ => serde_json::Value::Null,
        };

        Ok(RedisKeyValue {
            key: key.to_string(),
            key_type: key_type_str,
            ttl,
            value,
            encoding: None,
        })
    }

    /// Execute a raw Redis command.
    pub async fn execute_command(
        &self,
        conn_id: &str,
        command: &str,
    ) -> Result<RedisCommandResult, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;
        let start = Instant::now();

        // Parse command string into args
        let args: Vec<&str> = command.split_whitespace().collect();
        if args.is_empty() {
            return Err("Empty command".into());
        }

        let resp = Self::send_command(conn, &args).await?;
        let value = Self::parse_resp_value(&resp);

        Ok(RedisCommandResult {
            result: value,
            execution_time_ms: u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
        })
    }

    /// Set a key value.
    pub async fn set_key(
        &self,
        conn_id: &str,
        key: &str,
        value: &str,
        ttl: Option<i64>,
    ) -> Result<(), String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        if let Some(ttl_val) = ttl {
            if ttl_val > 0 {
                let ttl_str = ttl_val.to_string();
                Self::send_command(conn, &["SET", key, value, "EX", &ttl_str]).await?;
            } else {
                Self::send_command(conn, &["SET", key, value]).await?;
            }
        } else {
            Self::send_command(conn, &["SET", key, value]).await?;
        }

        Ok(())
    }

    /// Delete a key.
    pub async fn delete_key(&self, conn_id: &str, key: &str) -> Result<bool, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let resp = Self::send_command(conn, &["DEL", key]).await?;
        let val = Self::parse_resp_value(&resp);
        Ok(val.as_i64().unwrap_or(0) > 0)
    }

    /// Get server info.
    pub async fn server_info(&self, conn_id: &str) -> Result<RedisServerInfo, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let resp = Self::send_command(conn, &["INFO", "server"]).await?;
        let info_str = resp
            .lines()
            .filter(|l| !l.starts_with('$') && !l.starts_with('+') && !l.is_empty())
            .collect::<Vec<_>>()
            .join("\n");

        Ok(RedisServerInfo {
            version: extract_redis_field(&info_str, "redis_version"),
            connected_clients: extract_redis_field(&info_str, "connected_clients")
                .parse()
                .unwrap_or(0),
            used_memory_human: extract_redis_field(&info_str, "used_memory_human"),
            total_keys: 0, // Would need INFO keyspace
            uptime_days: extract_redis_field(&info_str, "uptime_in_days")
                .parse()
                .unwrap_or(0),
        })
    }
}

fn extract_redis_field(info: &str, field: &str) -> String {
    info.lines()
        .find(|l| l.starts_with(field))
        .and_then(|l| l.split(':').nth(1))
        .unwrap_or("")
        .trim()
        .to_string()
}

impl Default for RedisManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_list_connections() {
        let mgr = RedisManager::new();
        let conn = mgr
            .create_connection(CreateRedisConnectionReq {
                name: "test-redis".into(),
                host: "localhost".into(),
                port: None,
                password: None,
                username: None,
                db: None,
                group: None,
                ssl_enabled: None,
            })
            .await;
        assert_eq!(conn.name, "test-redis");
        assert_eq!(conn.port, 6379);
        let list = mgr.list_connections().await;
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_delete_connection() {
        let mgr = RedisManager::new();
        let conn = mgr
            .create_connection(CreateRedisConnectionReq {
                name: "temp".into(),
                host: "localhost".into(),
                port: None,
                password: None,
                username: None,
                db: None,
                group: None,
                ssl_enabled: None,
            })
            .await;
        assert!(mgr.delete_connection(&conn.id).await);
        assert!(mgr.get_connection(&conn.id).await.is_none());
    }
}
