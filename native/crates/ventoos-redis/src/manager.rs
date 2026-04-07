use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use tokio::io::{AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::resp::{self, RespValue};
use crate::types::{
    BatchDeleteRequest, BatchExportRequest, BatchResult, BatchTtlRequest, CreateRedisConnectionReq,
    MemoryStatsResult, MemoryUsageResult, MonitorEntry, PubSubMessage, RedisCommandResult,
    RedisConnectionConfig, RedisInfoParsed, RedisKeyInfo, RedisKeyValue, RedisScanReq,
    RedisScanResult, RedisServerInfo, RedisTestResult, StreamAddRequest, StreamEntry,
    StreamGroupCreateRequest,
};

// ── Internal types ──────────────────────────────────────────

/// Data connection: BufReader-wrapped TCP stream for RESP parsing.
struct RedisConn {
    stream: Arc<tokio::sync::Mutex<BufReader<TcpStream>>>,
}

/// Pub/Sub background state for one connection id.
struct PubSubState {
    writer: Arc<tokio::sync::Mutex<tokio::net::tcp::OwnedWriteHalf>>,
    tx: tokio::sync::broadcast::Sender<PubSubMessage>,
    shutdown: tokio::sync::watch::Sender<bool>,
    _handle: tokio::task::JoinHandle<()>,
}

/// MONITOR background state for one connection id.
struct MonitorState {
    tx: tokio::sync::broadcast::Sender<String>,
    shutdown: tokio::sync::watch::Sender<bool>,
    _handle: tokio::task::JoinHandle<()>,
}

/// Redis connection manager.
///
/// Manages multiple Redis connections and provides key browsing, value editing,
/// command execution, Pub/Sub subscriptions, and MONITOR streaming.
pub struct RedisManager {
    configs: Arc<RwLock<HashMap<String, RedisConnectionConfig>>>,
    connections: Arc<RwLock<HashMap<String, RedisConn>>>,
    pub_sub_states: Arc<RwLock<HashMap<String, PubSubState>>>,
    monitor_states: Arc<RwLock<HashMap<String, MonitorState>>>,
}

impl RedisManager {
    pub fn new() -> Self {
        Self {
            configs: Arc::new(RwLock::new(HashMap::new())),
            connections: Arc::new(RwLock::new(HashMap::new())),
            pub_sub_states: Arc::new(RwLock::new(HashMap::new())),
            monitor_states: Arc::new(RwLock::new(HashMap::new())),
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
            mode: req.mode.unwrap_or_default(),
            tls: req.tls,
            sentinel: req.sentinel,
            cluster: req.cluster,
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
        self.disconnect(id).await;
        self.configs.write().await.remove(id).is_some()
    }

    pub async fn test_connection(&self, id: &str) -> Option<RedisTestResult> {
        let config = self.configs.read().await.get(id)?.clone();
        let start = Instant::now();

        let addr = format!("{}:{}", config.host, config.port);
        match TcpStream::connect(&addr).await {
            Ok(mut stream) => {
                let cmd = resp::build_command(&["PING"]);
                if stream.write_all(&cmd).await.is_ok() {
                    let mut reader = BufReader::new(&mut stream);
                    if let Ok(val) = resp::parse_resp(&mut reader).await {
                        if val.is_ok() || val.as_str().is_some_and(|s| s.contains("PONG")) {
                            return Some(RedisTestResult {
                                success: true,
                                message: "PONG — Connected successfully".into(),
                                latency_ms: Some(elapsed_ms(&start)),
                                server_info: None,
                            });
                        }
                        if val
                            .as_str()
                            .is_some_and(|s| s.contains("NOAUTH") || s.contains("AUTH"))
                        {
                            return Some(RedisTestResult {
                                success: true,
                                message: "Server reachable (requires authentication)".into(),
                                latency_ms: Some(elapsed_ms(&start)),
                                server_info: None,
                            });
                        }
                    }
                }
                Some(RedisTestResult {
                    success: true,
                    message: "TCP connection established".into(),
                    latency_ms: Some(elapsed_ms(&start)),
                    server_info: None,
                })
            }
            Err(e) => Some(RedisTestResult {
                success: false,
                message: format!("Cannot reach {addr}: {e}"),
                latency_ms: Some(elapsed_ms(&start)),
                server_info: None,
            }),
        }
    }

    /// Connect to Redis (creates a data session). Attempts RESP3 upgrade.
    pub async fn connect(&self, id: &str) -> Result<(), String> {
        let config = self
            .configs
            .read()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| "Connection not found".to_string())?;

        let mut reader = Self::create_authenticated_stream(&config).await?;

        // Try RESP3 upgrade (graceful fallback)
        let hello_cmd = resp::build_command(&["HELLO", "3"]);
        if reader.get_mut().write_all(&hello_cmd).await.is_ok() {
            match resp::parse_resp(&mut reader).await {
                Ok(val) if !val.is_error() => debug!("RESP3 upgrade succeeded for {id}"),
                _ => debug!("RESP3 not supported for {id}, using RESP2"),
            }
        }

        let conn = RedisConn {
            stream: Arc::new(tokio::sync::Mutex::new(reader)),
        };
        self.connections.write().await.insert(id.to_string(), conn);
        info!("Connected to Redis {id}");
        Ok(())
    }

    /// Disconnect all sessions (data + pub/sub + monitor) for a connection.
    pub async fn disconnect(&self, id: &str) {
        // Shutdown pub/sub
        if let Some(state) = self.pub_sub_states.write().await.remove(id) {
            let _ = state.shutdown.send(true);
        }
        // Shutdown monitor
        if let Some(state) = self.monitor_states.write().await.remove(id) {
            let _ = state.shutdown.send(true);
        }
        // Remove data connection
        self.connections.write().await.remove(id);
    }

    // ── Pub/Sub ─────────────────────────────────────────────

    /// Subscribe to Redis channels. Returns a broadcast receiver for messages.
    ///
    /// Creates a dedicated connection for subscriptions (separate from data).
    pub async fn subscribe(
        &self,
        conn_id: &str,
        channels: Vec<String>,
    ) -> Result<tokio::sync::broadcast::Receiver<PubSubMessage>, String> {
        if channels.is_empty() {
            return Err("No channels specified".into());
        }

        // If already subscribed, add channels to existing connection
        {
            let states = self.pub_sub_states.read().await;
            if let Some(state) = states.get(conn_id) {
                let mut writer = state.writer.lock().await;
                let mut args: Vec<&str> = vec!["SUBSCRIBE"];
                for ch in &channels {
                    args.push(ch);
                }
                let cmd = resp::build_command(&args);
                writer.write_all(&cmd).await.map_err(|e| e.to_string())?;
                return Ok(state.tx.subscribe());
            }
        }

        let config = self
            .configs
            .read()
            .await
            .get(conn_id)
            .cloned()
            .ok_or_else(|| "Connection not found".to_string())?;

        let stream = Self::create_authenticated_tcp(&config).await?;
        let (read_half, write_half) = stream.into_split();
        let writer = Arc::new(tokio::sync::Mutex::new(write_half));

        // Send SUBSCRIBE command
        {
            let mut w = writer.lock().await;
            let mut args: Vec<&str> = vec!["SUBSCRIBE"];
            for ch in &channels {
                args.push(ch);
            }
            let cmd = resp::build_command(&args);
            w.write_all(&cmd).await.map_err(|e| e.to_string())?;
        }

        // Read subscription confirmations
        let mut sub_reader = BufReader::new(read_half);
        for _ in 0..channels.len() {
            let _ = resp::parse_resp(&mut sub_reader).await?;
        }

        let (tx, rx) = tokio::sync::broadcast::channel(256);
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);
        let tx_clone = tx.clone();

        let handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    result = resp::parse_resp(&mut sub_reader) => {
                        match result {
                            Ok(msg) => {
                                if let Some(arr) = msg.into_array()
                                    && arr.len() >= 3 {
                                        let kind = arr[0].as_str().unwrap_or("");
                                        if kind == "message" {
                                            let channel =
                                                arr[1].as_str().unwrap_or("").to_string();
                                            let message = arr[2].to_string_lossy();
                                            let _ = tx_clone.send(PubSubMessage {
                                                channel,
                                                message,
                                            });
                                        }
                                    }
                            }
                            Err(e) => {
                                warn!("Pub/Sub reader error: {e}");
                                break;
                            }
                        }
                    }
                    _ = shutdown_rx.changed() => break,
                }
            }
        });

        self.pub_sub_states.write().await.insert(
            conn_id.to_string(),
            PubSubState {
                writer,
                tx: tx.clone(),
                shutdown: shutdown_tx,
                _handle: handle,
            },
        );

        Ok(rx)
    }

    /// Unsubscribe from channels (or all if `channels` is empty).
    pub async fn unsubscribe(&self, conn_id: &str, channels: Vec<String>) -> Result<(), String> {
        let states = self.pub_sub_states.read().await;
        let state = states.get(conn_id).ok_or("No active subscription")?;
        let mut writer = state.writer.lock().await;

        let mut args: Vec<&str> = vec!["UNSUBSCRIBE"];
        for ch in &channels {
            args.push(ch);
        }
        let cmd = resp::build_command(&args);
        writer.write_all(&cmd).await.map_err(|e| e.to_string())?;

        if channels.is_empty() {
            drop(writer);
            drop(states);
            if let Some(state) = self.pub_sub_states.write().await.remove(conn_id) {
                let _ = state.shutdown.send(true);
            }
        }

        Ok(())
    }

    // ── MONITOR ─────────────────────────────────────────────

    /// Start MONITOR mode. Returns a broadcast receiver for command traces.
    ///
    /// Uses a dedicated connection.
    pub async fn monitor(
        &self,
        conn_id: &str,
    ) -> Result<tokio::sync::broadcast::Receiver<String>, String> {
        {
            let states = self.monitor_states.read().await;
            if let Some(state) = states.get(conn_id) {
                return Ok(state.tx.subscribe());
            }
        }

        let config = self
            .configs
            .read()
            .await
            .get(conn_id)
            .cloned()
            .ok_or_else(|| "Connection not found".to_string())?;

        let mut reader = Self::create_authenticated_stream(&config).await?;

        let cmd = resp::build_command(&["MONITOR"]);
        reader
            .get_mut()
            .write_all(&cmd)
            .await
            .map_err(|e| e.to_string())?;

        let confirm = resp::parse_resp(&mut reader).await?;
        if confirm.is_error() {
            return Err(format!("MONITOR failed: {}", confirm.to_string_lossy()));
        }

        let (tx, rx) = tokio::sync::broadcast::channel(1024);
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);
        let tx_clone = tx.clone();

        let handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    result = resp::parse_resp(&mut reader) => {
                        match result {
                            Ok(val) => {
                                let _ = tx_clone.send(val.to_string_lossy());
                            }
                            Err(e) => {
                                warn!("MONITOR reader error: {e}");
                                break;
                            }
                        }
                    }
                    _ = shutdown_rx.changed() => break,
                }
            }
        });

        self.monitor_states.write().await.insert(
            conn_id.to_string(),
            MonitorState {
                tx: tx.clone(),
                shutdown: shutdown_tx,
                _handle: handle,
            },
        );

        Ok(rx)
    }

    /// Stop MONITOR mode.
    pub async fn stop_monitor(&self, conn_id: &str) {
        if let Some(state) = self.monitor_states.write().await.remove(conn_id) {
            let _ = state.shutdown.send(true);
        }
    }

    // ── Key operations ──────────────────────────────────────

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

        // SCAN returns: Array([BulkString(cursor), Array([key1, key2, ...])])
        let arr = resp
            .into_array()
            .ok_or("Invalid SCAN response: expected array")?;
        if arr.len() < 2 {
            return Err("Invalid SCAN response: expected 2-element array".into());
        }

        let cursor = arr[0].as_str().unwrap_or("0").to_string();
        let keys = arr[1]
            .clone()
            .into_array()
            .unwrap_or_default()
            .iter()
            .map(|k| RedisKeyInfo {
                key: k.as_str().unwrap_or("").to_string(),
                key_type: "unknown".into(),
                ttl: -1,
                size: None,
            })
            .collect();

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

        let type_resp = Self::send_command(conn, &["TYPE", key]).await?;
        let key_type_str = type_resp.as_str().unwrap_or("string").to_string();

        let ttl_resp = Self::send_command(conn, &["TTL", key]).await?;
        let ttl = ttl_resp.as_i64().unwrap_or(-1);

        let value = match key_type_str.as_str() {
            "string" => {
                let r = Self::send_command(conn, &["GET", key]).await?;
                r.to_json()
            }
            "list" => {
                let r = Self::send_command(conn, &["LRANGE", key, "0", "999"]).await?;
                r.to_json()
            }
            "set" => {
                let r = Self::send_command(conn, &["SMEMBERS", key]).await?;
                r.to_json()
            }
            "hash" => {
                let r = Self::send_command(conn, &["HGETALL", key]).await?;
                r.to_json()
            }
            "zset" => {
                let r =
                    Self::send_command(conn, &["ZRANGE", key, "0", "999", "WITHSCORES"]).await?;
                r.to_json()
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

        let args: Vec<&str> = command.split_whitespace().collect();
        if args.is_empty() {
            return Err("Empty command".into());
        }

        let resp = Self::send_command(conn, &args).await?;
        Ok(RedisCommandResult {
            result: resp.to_json(),
            execution_time_ms: elapsed_ms(&start),
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
        Ok(resp.as_i64().unwrap_or(0) > 0)
    }

    /// Get server info.
    pub async fn server_info(&self, conn_id: &str) -> Result<RedisServerInfo, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let resp = Self::send_command(conn, &["INFO"]).await?;
        let info_str = resp.to_string_lossy();

        Ok(RedisServerInfo {
            version: extract_redis_field(&info_str, "redis_version"),
            connected_clients: extract_redis_field(&info_str, "connected_clients")
                .parse()
                .unwrap_or(0),
            used_memory_human: extract_redis_field(&info_str, "used_memory_human"),
            total_keys: parse_keyspace_total(&info_str),
            uptime_days: extract_redis_field(&info_str, "uptime_in_days")
                .parse()
                .unwrap_or(0),
        })
    }

    // ── Stream operations ───────────────────────────────────

    /// Read stream entries with XRANGE.
    pub async fn stream_range(
        &self,
        conn_id: &str,
        key: &str,
        start: &str,
        end: &str,
        count: Option<u32>,
    ) -> Result<Vec<StreamEntry>, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let count_str = count.unwrap_or(100).to_string();
        let resp =
            Self::send_command(conn, &["XRANGE", key, start, end, "COUNT", &count_str]).await?;

        parse_stream_entries(resp)
    }

    /// Add a message to a stream with XADD.
    pub async fn stream_add(
        &self,
        conn_id: &str,
        key: &str,
        req: &StreamAddRequest,
    ) -> Result<String, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let id = req.id.as_deref().unwrap_or("*");
        let mut args: Vec<&str> = vec!["XADD", key, id];
        let field_strs: Vec<String> = req
            .fields
            .iter()
            .flat_map(|(k, v)| vec![k.clone(), v.clone()])
            .collect();
        for s in &field_strs {
            args.push(s);
        }

        let resp = Self::send_command(conn, &args).await?;
        Ok(resp.to_string_lossy())
    }

    /// Get stream length with XLEN.
    pub async fn stream_len(&self, conn_id: &str, key: &str) -> Result<i64, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let resp = Self::send_command(conn, &["XLEN", key]).await?;
        Ok(resp.as_i64().unwrap_or(0))
    }

    /// Create a consumer group with XGROUP CREATE.
    pub async fn stream_group_create(
        &self,
        conn_id: &str,
        key: &str,
        req: &StreamGroupCreateRequest,
    ) -> Result<(), String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let start_id = req.start_id.as_deref().unwrap_or("$");
        let resp = Self::send_command(
            conn,
            &[
                "XGROUP",
                "CREATE",
                key,
                &req.group_name,
                start_id,
                "MKSTREAM",
            ],
        )
        .await?;
        if resp.is_error() {
            return Err(resp.to_string_lossy());
        }
        Ok(())
    }

    // ── Batch operations ────────────────────────────────────

    /// Scan keys matching pattern and delete them.
    pub async fn batch_delete(
        &self,
        conn_id: &str,
        req: &BatchDeleteRequest,
    ) -> Result<BatchResult, String> {
        let keys = self.scan_all_keys(conn_id, &req.pattern).await?;
        let deleted = self.delete_keys_batch(conn_id, &keys).await?;
        Ok(BatchResult {
            affected: deleted,
            keys,
        })
    }

    /// Scan keys matching pattern and set TTL.
    pub async fn batch_set_ttl(
        &self,
        conn_id: &str,
        req: &BatchTtlRequest,
    ) -> Result<BatchResult, String> {
        let keys = self.scan_all_keys(conn_id, &req.pattern).await?;
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let ttl_str = req.ttl.to_string();
        let mut affected = 0i64;
        for key in &keys {
            let resp = Self::send_command(conn, &["EXPIRE", key, &ttl_str]).await?;
            if resp.as_i64().unwrap_or(0) > 0 {
                affected += 1;
            }
        }

        Ok(BatchResult { affected, keys })
    }

    /// Scan keys matching pattern and export as JSON.
    pub async fn batch_export(
        &self,
        conn_id: &str,
        req: &BatchExportRequest,
    ) -> Result<serde_json::Value, String> {
        let keys = self.scan_all_keys(conn_id, &req.pattern).await?;
        let mut result = serde_json::Map::new();

        for key in &keys {
            if let Ok(kv) = self.get_key_value(conn_id, key).await {
                result.insert(key.clone(), kv.value);
            }
        }

        Ok(serde_json::Value::Object(result))
    }

    /// Scan all keys matching a pattern (iterates through all cursors).
    async fn scan_all_keys(&self, conn_id: &str, pattern: &str) -> Result<Vec<String>, String> {
        let mut all_keys = Vec::new();
        let mut cursor = "0".to_string();

        loop {
            let req = RedisScanReq {
                cursor: cursor.clone(),
                pattern: Some(pattern.to_string()),
                count: Some(200),
                key_type: None,
            };
            let result = self.scan_keys(conn_id, &req).await?;
            for ki in &result.keys {
                all_keys.push(ki.key.clone());
            }
            cursor = result.cursor;
            if result.finished || cursor == "0" {
                break;
            }
            // Safety limit
            if all_keys.len() > 10_000 {
                break;
            }
        }

        Ok(all_keys)
    }

    /// Delete multiple keys.
    async fn delete_keys_batch(&self, conn_id: &str, keys: &[String]) -> Result<i64, String> {
        if keys.is_empty() {
            return Ok(0);
        }
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let mut total = 0i64;
        for chunk in keys.chunks(100) {
            let mut args: Vec<&str> = vec!["DEL"];
            for key in chunk {
                args.push(key);
            }
            let resp = Self::send_command(conn, &args).await?;
            total += resp.as_i64().unwrap_or(0);
        }
        Ok(total)
    }

    // ── Stats / INFO ────────────────────────────────────────

    /// Parse INFO command output into structured sections.
    pub async fn info_parsed(&self, conn_id: &str) -> Result<RedisInfoParsed, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let resp = Self::send_command(conn, &["INFO"]).await?;
        let info_str = resp.to_string_lossy();
        Ok(parse_info_sections(&info_str))
    }

    /// Get memory usage for a single key.
    pub async fn memory_usage(
        &self,
        conn_id: &str,
        key: &str,
    ) -> Result<MemoryUsageResult, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let resp = Self::send_command(conn, &["MEMORY", "USAGE", key]).await?;
        let bytes = resp.as_i64().unwrap_or(-1);
        Ok(MemoryUsageResult {
            key: key.to_string(),
            bytes,
        })
    }

    /// Get global memory stats.
    pub async fn memory_stats(&self, conn_id: &str) -> Result<MemoryStatsResult, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let resp = Self::send_command(conn, &["MEMORY", "STATS"]).await?;
        Ok(MemoryStatsResult {
            stats: resp.to_json(),
        })
    }

    /// Publish a message to a channel.
    pub async fn publish(
        &self,
        conn_id: &str,
        channel: &str,
        message: &str,
    ) -> Result<i64, String> {
        let connections = self.connections.read().await;
        let conn = connections.get(conn_id).ok_or("Not connected")?;

        let resp = Self::send_command(conn, &["PUBLISH", channel, message]).await?;
        Ok(resp.as_i64().unwrap_or(0))
    }

    /// Parse a MONITOR output line into structured data.
    pub fn parse_monitor_line(line: &str) -> MonitorEntry {
        // MONITOR format: "1234567890.123456 [0 127.0.0.1:12345] \"SET\" \"key\" \"value\""
        let mut timestamp = 0.0_f64;
        let mut client = String::new();
        let mut command = String::new();
        let mut args = Vec::new();

        let raw = line.to_string();

        if let Some(space_idx) = line.find(' ') {
            timestamp = line[..space_idx].parse().unwrap_or(0.0);
            let rest = &line[space_idx + 1..];

            if let Some(bracket_end) = rest.find(']') {
                client = rest[1..bracket_end].to_string();
                let cmd_part = rest[bracket_end + 2..].trim();

                let parts: Vec<&str> = cmd_part.split(' ').collect();
                for (i, part) in parts.iter().enumerate() {
                    let cleaned = part.trim_matches('"');
                    if i == 0 {
                        command = cleaned.to_string();
                    } else {
                        args.push(cleaned.to_string());
                    }
                }
            }
        }

        MonitorEntry {
            timestamp,
            client,
            command,
            args,
            raw,
        }
    }

    // ── Internal helpers ────────────────────────────────────

    /// Send a RESP command on a data connection and parse the response.
    async fn send_command(conn: &RedisConn, args: &[&str]) -> Result<RespValue, String> {
        let cmd = resp::build_command(args);
        let mut stream = conn.stream.lock().await;
        stream
            .get_mut()
            .write_all(&cmd)
            .await
            .map_err(|e| format!("Write error: {e}"))?;
        resp::parse_resp(&mut *stream).await
    }

    /// Create a raw `TcpStream` with AUTH + SELECT already performed.
    async fn create_authenticated_tcp(config: &RedisConnectionConfig) -> Result<TcpStream, String> {
        let reader = Self::create_authenticated_stream(config).await?;
        Ok(reader.into_inner())
    }

    /// Create a `BufReader<TcpStream>` with AUTH + SELECT already performed.
    async fn create_authenticated_stream(
        config: &RedisConnectionConfig,
    ) -> Result<BufReader<TcpStream>, String> {
        let addr = format!("{}:{}", config.host, config.port);
        let stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Connection failed: {e}"))?;
        let mut reader = BufReader::new(stream);

        if let Some(ref password) = config.password {
            let args: Vec<&str> = if let Some(ref username) = config.username {
                vec!["AUTH", username, password]
            } else {
                vec!["AUTH", password]
            };
            let cmd = resp::build_command(&args);
            reader
                .get_mut()
                .write_all(&cmd)
                .await
                .map_err(|e| e.to_string())?;
            let r = resp::parse_resp(&mut reader).await?;
            if r.is_error() {
                return Err(format!("Auth failed: {}", r.to_string_lossy()));
            }
        }

        if config.db > 0 {
            let db_str = config.db.to_string();
            let cmd = resp::build_command(&["SELECT", &db_str]);
            reader
                .get_mut()
                .write_all(&cmd)
                .await
                .map_err(|e| e.to_string())?;
            let r = resp::parse_resp(&mut reader).await?;
            if r.is_error() {
                return Err(format!("SELECT failed: {}", r.to_string_lossy()));
            }
        }

        Ok(reader)
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

fn elapsed_ms(start: &Instant) -> u64 {
    u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX)
}

/// Parse total key count from INFO keyspace section.
fn parse_keyspace_total(info: &str) -> i64 {
    let mut total = 0i64;
    for line in info.lines() {
        if line.starts_with("db")
            && line.contains("keys=")
            && let Some(keys_part) = line.split("keys=").nth(1)
            && let Some(num_str) = keys_part.split(',').next()
        {
            total += num_str.parse::<i64>().unwrap_or(0);
        }
    }
    total
}

/// Parse INFO output into structured sections.
fn parse_info_sections(info: &str) -> RedisInfoParsed {
    let mut sections = std::collections::HashMap::new();
    let mut current_section = String::new();

    for line in info.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('#') {
            current_section = line.trim_start_matches('#').trim().to_lowercase();
            sections
                .entry(current_section.clone())
                .or_insert_with(std::collections::HashMap::new);
        } else if let Some((key, value)) = line.split_once(':')
            && let Some(section) = sections.get_mut(&current_section)
        {
            section.insert(key.to_string(), value.to_string());
        }
    }

    RedisInfoParsed { sections }
}

/// Parse XRANGE response into stream entries.
fn parse_stream_entries(resp: RespValue) -> Result<Vec<StreamEntry>, String> {
    let arr = resp
        .into_array()
        .ok_or("Invalid stream response: expected array")?;

    let mut entries = Vec::new();
    for item in arr {
        let entry_arr = item
            .into_array()
            .ok_or("Invalid stream entry: expected array")?;
        if entry_arr.len() < 2 {
            continue;
        }

        let id = entry_arr[0].as_str().unwrap_or("").to_string();
        let fields_arr = entry_arr[1].clone().into_array().unwrap_or_default();

        let mut fields_map = serde_json::Map::new();
        let mut i = 0;
        while i + 1 < fields_arr.len() {
            let key = fields_arr[i].as_str().unwrap_or("").to_string();
            let value = fields_arr[i + 1].to_string_lossy();
            fields_map.insert(key, serde_json::Value::String(value));
            i += 2;
        }

        entries.push(StreamEntry {
            id,
            fields: serde_json::Value::Object(fields_map),
        });
    }

    Ok(entries)
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
                mode: None,
                tls: None,
                sentinel: None,
                cluster: None,
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
                mode: None,
                tls: None,
                sentinel: None,
                cluster: None,
            })
            .await;
        assert!(mgr.delete_connection(&conn.id).await);
        assert!(mgr.get_connection(&conn.id).await.is_none());
    }

    #[tokio::test]
    async fn test_default_connection_values() {
        let mgr = RedisManager::new();
        let conn = mgr
            .create_connection(CreateRedisConnectionReq {
                name: "defaults".into(),
                host: "10.0.0.1".into(),
                port: None,
                password: None,
                username: None,
                db: None,
                group: None,
                ssl_enabled: None,
                mode: None,
                tls: None,
                sentinel: None,
                cluster: None,
            })
            .await;
        assert_eq!(conn.port, 6379);
        assert_eq!(conn.db, 0);
        assert!(!conn.ssl_enabled);
        assert!(conn.password.is_none());
    }

    #[tokio::test]
    async fn test_extract_redis_field() {
        let info = "redis_version:7.0.5\r\nredis_mode:standalone\r\nuptime_in_days:42\r\n";
        assert_eq!(extract_redis_field(info, "redis_version"), "7.0.5");
        assert_eq!(extract_redis_field(info, "uptime_in_days"), "42");
        assert_eq!(extract_redis_field(info, "missing_field"), "");
    }

    #[tokio::test]
    async fn test_list_connections_sorted() {
        let mgr = RedisManager::new();
        for name in ["charlie", "alice", "bob"] {
            mgr.create_connection(CreateRedisConnectionReq {
                name: name.into(),
                host: "localhost".into(),
                port: None,
                password: None,
                username: None,
                db: None,
                group: None,
                ssl_enabled: None,
                mode: None,
                tls: None,
                sentinel: None,
                cluster: None,
            })
            .await;
        }
        let list = mgr.list_connections().await;
        let names: Vec<&str> = list.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["alice", "bob", "charlie"]);
    }
}
