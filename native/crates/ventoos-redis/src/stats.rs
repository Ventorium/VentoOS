//! INFO command parsing and statistics.
//!
//! Parses Redis INFO output into structured sections and provides
//! helpers for MEMORY USAGE and MEMORY STATS.

use std::collections::HashMap;

use crate::types::RedisInfoParsed;

/// Parse the raw INFO string into structured sections.
///
/// Each section starts with `# SectionName` and contains `key:value` lines.
pub fn parse_info(info: &str) -> RedisInfoParsed {
    let mut sections: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut current = String::new();

    for line in info.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('#') {
            current = line.trim_start_matches('#').trim().to_lowercase();
            sections.entry(current.clone()).or_default();
        } else if let Some((key, value)) = line.split_once(':')
            && let Some(section) = sections.get_mut(&current) {
                section.insert(key.to_string(), value.to_string());
            }
    }

    RedisInfoParsed { sections }
}

/// Extract commonly used stats from parsed INFO.
pub fn extract_stats(parsed: &RedisInfoParsed) -> HashMap<String, serde_json::Value> {
    let mut stats = HashMap::new();

    // Server
    if let Some(server) = parsed.sections.get("server") {
        if let Some(v) = server.get("redis_version") {
            stats.insert(
                "version".to_string(),
                serde_json::Value::String(v.clone()),
            );
        }
        if let Some(v) = server.get("uptime_in_days") {
            stats.insert(
                "uptime_days".to_string(),
                serde_json::Value::String(v.clone()),
            );
        }
    }

    // Clients
    if let Some(clients) = parsed.sections.get("clients")
        && let Some(v) = clients.get("connected_clients") {
            stats.insert(
                "connected_clients".to_string(),
                serde_json::Value::String(v.clone()),
            );
        }

    // Memory
    if let Some(memory) = parsed.sections.get("memory") {
        for key in &[
            "used_memory_human",
            "used_memory_peak_human",
            "maxmemory_human",
            "mem_fragmentation_ratio",
        ] {
            if let Some(v) = memory.get(*key) {
                stats.insert(key.to_string(), serde_json::Value::String(v.clone()));
            }
        }
    }

    // Stats
    if let Some(s) = parsed.sections.get("stats") {
        for key in &[
            "total_connections_received",
            "total_commands_processed",
            "instantaneous_ops_per_sec",
            "expired_keys",
            "evicted_keys",
            "keyspace_hits",
            "keyspace_misses",
        ] {
            if let Some(v) = s.get(*key) {
                stats.insert(key.to_string(), serde_json::Value::String(v.clone()));
            }
        }
    }

    stats
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_info() {
        let info = "# Server\r\nredis_version:7.0.0\r\nuptime_in_days:10\r\n\r\n# Clients\r\nconnected_clients:5\r\n";
        let parsed = parse_info(info);

        assert!(parsed.sections.contains_key("server"));
        assert_eq!(
            parsed.sections["server"].get("redis_version"),
            Some(&"7.0.0".to_string())
        );
        assert_eq!(
            parsed.sections["clients"].get("connected_clients"),
            Some(&"5".to_string())
        );
    }
}
