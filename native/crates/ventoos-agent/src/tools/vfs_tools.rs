//! VFS (Virtual File System) tool definitions.

use crate::types::{RiskLevel, ToolDefinition};

pub fn definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "vfs_list_mounts".into(),
            description: "List all VFS mount points.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "vfs_list_directory".into(),
            description: "List files and directories at a given path within a mount.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "mount_id": { "type": "string", "description": "Mount point identifier" },
                    "path": { "type": "string", "description": "Directory path within the mount" }
                },
                "required": ["mount_id", "path"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "vfs_read_file".into(),
            description: "Read the content of a file from a VFS mount.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "mount_id": { "type": "string" },
                    "path": { "type": "string", "description": "File path within the mount" }
                },
                "required": ["mount_id", "path"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "vfs_write_file".into(),
            description:
                "Write content to a file in a VFS mount. Medium risk: modifies remote file.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "mount_id": { "type": "string" },
                    "path": { "type": "string" },
                    "content": { "type": "string", "description": "File content to write" }
                },
                "required": ["mount_id", "path", "content"]
            }),
            risk_level: RiskLevel::Medium,
        },
        ToolDefinition {
            name: "vfs_delete".into(),
            description:
                "Delete a file or directory from a VFS mount. HIGH RISK: permanent deletion.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "mount_id": { "type": "string" },
                    "path": { "type": "string" },
                    "recursive": { "type": "boolean", "description": "Recursively delete directory contents", "default": false }
                },
                "required": ["mount_id", "path"]
            }),
            risk_level: RiskLevel::High,
        },
        ToolDefinition {
            name: "vfs_search".into(),
            description: "Search for files matching a pattern within a VFS mount.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "mount_id": { "type": "string" },
                    "path": { "type": "string", "description": "Base directory to search from" },
                    "pattern": { "type": "string", "description": "Search pattern (glob or name substring)" },
                    "max_results": { "type": "integer", "description": "Maximum results (default: 50)", "default": 50 }
                },
                "required": ["mount_id", "pattern"]
            }),
            risk_level: RiskLevel::Low,
        },
    ]
}
