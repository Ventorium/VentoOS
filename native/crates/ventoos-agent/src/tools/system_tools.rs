//! System tool definitions.

use crate::types::{RiskLevel, ToolDefinition};

pub fn definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "system_open_window".into(),
            description: "Open an application window in VentoOS desktop.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "app_id": { "type": "string", "description": "Application ID (e.g. 'k8s-workbench', 'database', 'redis', 'explorer')" },
                    "app_state": { "type": "object", "description": "Optional initial state to pass to the application" }
                },
                "required": ["app_id"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "system_notify".into(),
            description: "Send a desktop notification to the user.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Notification title" },
                    "message": { "type": "string", "description": "Notification body" },
                    "level": { "type": "string", "enum": ["info", "success", "warning", "error"], "default": "info" }
                },
                "required": ["title", "message"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "system_get_context".into(),
            description: "Get current user context including active connections, open windows, and recent operations.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "system_get_active_window".into(),
            description: "Get information about the currently focused application window.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            risk_level: RiskLevel::Low,
        },
    ]
}
