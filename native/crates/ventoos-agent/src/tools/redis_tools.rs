//! Redis tool definitions.

use crate::types::{RiskLevel, ToolDefinition};

pub fn definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "redis_list_connections".into(),
            description: "List all registered Redis connections.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "redis_get_key".into(),
            description: "Get the value of a Redis key.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "Redis connection identifier" },
                    "key": { "type": "string", "description": "Redis key" },
                    "db": { "type": "integer", "description": "Database index (default: 0)", "default": 0 }
                },
                "required": ["connection_id", "key"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "redis_set_key".into(),
            description: "Set a Redis key to a value. Medium risk: modifies data.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string" },
                    "key": { "type": "string" },
                    "value": { "type": "string", "description": "Value to set" },
                    "ttl_secs": { "type": "integer", "description": "TTL in seconds (optional)" },
                    "db": { "type": "integer", "default": 0 }
                },
                "required": ["connection_id", "key", "value"]
            }),
            risk_level: RiskLevel::Medium,
        },
        ToolDefinition {
            name: "redis_delete_key".into(),
            description: "Delete a Redis key. HIGH RISK: permanently removes the key.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string" },
                    "key": { "type": "string" },
                    "db": { "type": "integer", "default": 0 }
                },
                "required": ["connection_id", "key"]
            }),
            risk_level: RiskLevel::High,
        },
        ToolDefinition {
            name: "redis_execute_command".into(),
            description: "Execute an arbitrary Redis command. Medium risk: may read or modify data.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string" },
                    "command": { "type": "string", "description": "Redis command (e.g. 'INFO', 'KEYS *', 'SCAN 0')" },
                    "db": { "type": "integer", "default": 0 }
                },
                "required": ["connection_id", "command"]
            }),
            risk_level: RiskLevel::Medium,
        },
    ]
}
