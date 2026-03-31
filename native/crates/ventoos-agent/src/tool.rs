//! Tool system — definitions, registry, and built-in tools.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use serde_json::Value;

use crate::types::{RiskLevel, ToolDefinition};

// ─── Tool Executor Trait ───────────────────────────────────────────────────

/// Trait for executing tool calls. Implementations are injected from outside
/// the agent crate (e.g. the server crate wires real system capabilities).
pub trait ToolExecutor: Send + Sync {
    fn execute(
        &self,
        name: &str,
        arguments: &Value,
    ) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send + '_>>;
}

/// Stub executor that returns descriptive messages without performing real actions.
pub struct StubToolExecutor;

impl ToolExecutor for StubToolExecutor {
    fn execute(
        &self,
        name: &str,
        arguments: &Value,
    ) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send + '_>> {
        let name = name.to_string();
        let arguments = arguments.clone();
        Box::pin(async move {
            Ok(serde_json::json!({
                "status": "stub",
                "tool": name,
                "message": format!("Tool '{}' executed with args: {}", name, arguments),
                "note": "This is a stub response. Real tool execution is not yet connected."
            }))
        })
    }
}

// ─── Tool Registry ─────────────────────────────────────────────────────────

/// Registry holding all available tool definitions.
pub struct ToolRegistry {
    tools: HashMap<String, ToolDefinition>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// Create a registry pre-loaded with the built-in tools.
    pub fn with_builtins() -> Self {
        let mut registry = Self::new();
        for tool in builtin_tools() {
            registry.register(tool);
        }
        registry
    }

    /// Register a tool definition.
    pub fn register(&mut self, tool: ToolDefinition) {
        self.tools.insert(tool.name.clone(), tool);
    }

    /// Look up a tool by name.
    pub fn get(&self, name: &str) -> Option<&ToolDefinition> {
        self.tools.get(name)
    }

    /// List all registered tools.
    pub fn list(&self) -> Vec<&ToolDefinition> {
        let mut tools: Vec<_> = self.tools.values().collect();
        tools.sort_by_key(|t| &t.name);
        tools
    }

    /// List all tool definitions (owned).
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.list().into_iter().cloned().collect()
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::with_builtins()
    }
}

// ─── Built-in Tools ────────────────────────────────────────────────────────

/// The four atomic tools: read, write, edit, bash.
pub fn builtin_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "read".into(),
            description: "Read the contents of a file at the specified path. \
                Returns the file content as text. For large files, content may be truncated."
                .into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute file path to read"
                    }
                },
                "required": ["path"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "write".into(),
            description: "Write content to a file at the specified path. \
                Creates the file if it does not exist, or overwrites it if it does."
                .into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute file path to write"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
            risk_level: RiskLevel::Medium,
        },
        ToolDefinition {
            name: "edit".into(),
            description: "Apply a targeted edit to a file. Replaces old_text with new_text \
                in the file. Use this for surgical changes instead of rewriting entire files."
                .into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute file path to edit"
                    },
                    "old_text": {
                        "type": "string",
                        "description": "Exact text to find and replace"
                    },
                    "new_text": {
                        "type": "string",
                        "description": "Replacement text"
                    }
                },
                "required": ["path", "old_text", "new_text"]
            }),
            risk_level: RiskLevel::Medium,
        },
        ToolDefinition {
            name: "bash".into(),
            description: "Execute a bash command in a sandboxed shell. \
                Returns stdout, stderr, and exit code. Long-running commands \
                are subject to timeout."
                .into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The bash command to execute"
                    },
                    "timeout_secs": {
                        "type": "integer",
                        "description": "Timeout in seconds (default: 30)",
                        "default": 30
                    }
                },
                "required": ["command"]
            }),
            risk_level: RiskLevel::High,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_tools_count() {
        let tools = builtin_tools();
        assert_eq!(tools.len(), 4);
    }

    #[test]
    fn test_builtin_tool_names() {
        let tools = builtin_tools();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"read"));
        assert!(names.contains(&"write"));
        assert!(names.contains(&"edit"));
        assert!(names.contains(&"bash"));
    }

    #[test]
    fn test_registry_with_builtins() {
        let registry = ToolRegistry::with_builtins();
        assert_eq!(registry.list().len(), 4);
        assert!(registry.get("read").is_some());
        assert!(registry.get("write").is_some());
        assert!(registry.get("edit").is_some());
        assert!(registry.get("bash").is_some());
        assert!(registry.get("nonexistent").is_none());
    }

    #[test]
    fn test_registry_register_custom() {
        let mut registry = ToolRegistry::new();
        registry.register(ToolDefinition {
            name: "custom_tool".into(),
            description: "A custom tool".into(),
            parameters: serde_json::json!({"type": "object"}),
            risk_level: RiskLevel::Low,
        });
        assert_eq!(registry.list().len(), 1);
        assert!(registry.get("custom_tool").is_some());
    }

    #[test]
    fn test_tool_risk_levels() {
        let tools = builtin_tools();
        for tool in &tools {
            match tool.name.as_str() {
                "read" => assert_eq!(tool.risk_level, RiskLevel::Low),
                "write" | "edit" => assert_eq!(tool.risk_level, RiskLevel::Medium),
                "bash" => assert_eq!(tool.risk_level, RiskLevel::High),
                _ => panic!("Unexpected tool: {}", tool.name),
            }
        }
    }

    #[tokio::test]
    async fn test_stub_executor() {
        let executor = StubToolExecutor;
        let result = executor
            .execute("read", &serde_json::json!({"path": "/tmp/test"}))
            .await;
        assert!(result.is_ok());
        let val = result.unwrap();
        assert_eq!(val["status"], "stub");
        assert_eq!(val["tool"], "read");
    }
}
