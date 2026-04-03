//! Database tool definitions.

use crate::types::{RiskLevel, ToolDefinition};

pub fn definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "db_list_connections".into(),
            description: "List all registered database connections.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "db_list_schemas".into(),
            description: "List schemas in a database connection.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "Database connection identifier" }
                },
                "required": ["connection_id"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "db_list_tables".into(),
            description: "List tables in a database schema.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string" },
                    "schema": { "type": "string", "description": "Schema name (default: public)" }
                },
                "required": ["connection_id"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "db_describe_table".into(),
            description: "Describe the structure of a database table (columns, types, constraints).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string" },
                    "schema": { "type": "string" },
                    "table": { "type": "string", "description": "Table name" }
                },
                "required": ["connection_id", "table"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "db_execute_query".into(),
            description: "Execute a read-only SQL query (SELECT). Medium risk: may expose sensitive data.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string" },
                    "sql": { "type": "string", "description": "SQL query to execute" },
                    "limit": { "type": "integer", "description": "Max rows to return (default: 100)", "default": 100 }
                },
                "required": ["connection_id", "sql"]
            }),
            risk_level: RiskLevel::Medium,
        },
        ToolDefinition {
            name: "db_execute_write".into(),
            description: "Execute a write SQL statement (INSERT, UPDATE, DELETE, DDL). HIGH RISK: modifies database data or schema.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string" },
                    "sql": { "type": "string", "description": "SQL statement to execute" }
                },
                "required": ["connection_id", "sql"]
            }),
            risk_level: RiskLevel::High,
        },
    ]
}
