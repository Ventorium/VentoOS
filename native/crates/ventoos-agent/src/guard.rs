//! Guard system — security harness for tool execution.
//!
//! Guards validate tool arguments before execution, preventing dangerous
//! operations such as accessing sensitive file paths or running destructive
//! shell commands.

use serde_json::Value;

use crate::types::AgentError;

// ─── Guard Trait ───────────────────────────────────────────────────────────

/// A guard that validates tool call arguments before execution.
pub trait Guard: Send + Sync {
    /// Check whether the given tool call is allowed.
    /// Returns `Ok(())` if allowed, or `Err(AgentError::GuardRejected)` if blocked.
    fn check(&self, tool_name: &str, arguments: &Value) -> Result<(), AgentError>;
}

// ─── Guard Chain ───────────────────────────────────────────────────────────

/// Chains multiple guards together; all must pass for the call to be allowed.
pub struct GuardChain {
    guards: Vec<Box<dyn Guard>>,
}

impl GuardChain {
    pub fn new() -> Self {
        Self { guards: Vec::new() }
    }

    /// Create a chain with the default built-in guards.
    pub fn with_defaults() -> Self {
        let mut chain = Self::new();
        chain.add(Box::new(PathGuard));
        chain.add(Box::new(CommandGuard));
        chain.add(Box::new(RiskGuard::default()));
        chain
    }

    pub fn add(&mut self, guard: Box<dyn Guard>) {
        self.guards.push(guard);
    }

    /// Run all guards. Returns the first rejection, or `Ok(())` if all pass.
    pub fn check_all(&self, tool_name: &str, arguments: &Value) -> Result<(), AgentError> {
        for guard in &self.guards {
            guard.check(tool_name, arguments)?;
        }
        Ok(())
    }
}

impl Default for GuardChain {
    fn default() -> Self {
        Self::with_defaults()
    }
}

// ─── Path Guard ────────────────────────────────────────────────────────────

/// Blocks access to sensitive file-system paths.
pub struct PathGuard;

/// Paths that are always denied.
const DENIED_PATHS: &[&str] = &[
    "/etc/shadow",
    "/etc/gshadow",
    "/etc/master.passwd",
    "/proc/kcore",
    "/dev/mem",
    "/dev/kmem",
];

/// Path prefixes that are denied.
const DENIED_PREFIXES: &[&str] = &["/proc/", "/sys/"];

impl Guard for PathGuard {
    fn check(&self, tool_name: &str, arguments: &Value) -> Result<(), AgentError> {
        // Only check tools that operate on file paths.
        if !matches!(tool_name, "read" | "write" | "edit") {
            return Ok(());
        }

        let path = arguments.get("path").and_then(Value::as_str).unwrap_or("");

        if path.is_empty() {
            return Ok(());
        }

        // Exact match deny
        for denied in DENIED_PATHS {
            if path == *denied {
                return Err(AgentError::GuardRejected(format!(
                    "Access to path '{path}' is forbidden"
                )));
            }
        }

        // Prefix deny
        for prefix in DENIED_PREFIXES {
            if path.starts_with(prefix) {
                return Err(AgentError::GuardRejected(format!(
                    "Access to paths under '{prefix}' is forbidden"
                )));
            }
        }

        Ok(())
    }
}

// ─── Command Guard ─────────────────────────────────────────────────────────

/// Blocks execution of dangerous shell commands.
pub struct CommandGuard;

/// Patterns that indicate dangerous commands.
const DANGEROUS_PATTERNS: &[&str] = &[
    "rm -rf /",
    "rm -fr /",
    "mkfs",
    "dd if=/dev/zero",
    "dd if=/dev/random",
    ":(){ :|:& };:",
    "> /dev/sda",
    "chmod -R 777 /",
    "chown -R",
    "shutdown",
    "reboot",
    "init 0",
    "init 6",
    "halt",
    "poweroff",
];

impl Guard for CommandGuard {
    fn check(&self, tool_name: &str, arguments: &Value) -> Result<(), AgentError> {
        if tool_name != "bash" {
            return Ok(());
        }

        let command = arguments
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("");

        if command.is_empty() {
            return Ok(());
        }

        let lower = command.to_lowercase();

        for pattern in DANGEROUS_PATTERNS {
            if lower.contains(pattern) {
                return Err(AgentError::GuardRejected(format!(
                    "Dangerous command blocked: contains '{pattern}'"
                )));
            }
        }

        Ok(())
    }
}

// ─── Risk Guard ────────────────────────────────────────────────────────────

/// Guard that checks the risk level of platform tools.
///
/// High-risk tools are logged and can optionally be blocked in strict mode.
/// In normal mode this guard passes — the actual confirmation workflow
/// is handled by the agent engine via WebSocket before calling the executor.
#[derive(Default)]
pub struct RiskGuard {
    /// If true, `High` risk tools are rejected outright.
    /// If false (default), they pass through for the confirmation flow.
    pub strict_mode: bool,
}

/// Set of tool names that are always considered high-risk, regardless of
/// their declared risk level, because they modify production state.
const HIGH_RISK_TOOLS: &[&str] = &[
    "k8s_apply_yaml",
    "k8s_delete_resource",
    "k8s_exec_command",
    "db_execute_write",
    "redis_delete_key",
    "vfs_delete",
];

impl RiskGuard {
    /// Returns `true` if the tool is in the high-risk list.
    pub fn is_high_risk(tool_name: &str) -> bool {
        HIGH_RISK_TOOLS.contains(&tool_name)
    }
}

impl Guard for RiskGuard {
    fn check(&self, tool_name: &str, _arguments: &Value) -> Result<(), AgentError> {
        if self.strict_mode && Self::is_high_risk(tool_name) {
            return Err(AgentError::GuardRejected(format!(
                "Tool '{tool_name}' is high-risk and blocked in strict mode. \
                 Disable strict mode or request user confirmation."
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── PathGuard ──

    #[test]
    fn test_path_guard_allows_safe_path() {
        let guard = PathGuard;
        let args = serde_json::json!({"path": "/home/user/file.txt"});
        assert!(guard.check("read", &args).is_ok());
    }

    #[test]
    fn test_path_guard_blocks_shadow() {
        let guard = PathGuard;
        let args = serde_json::json!({"path": "/etc/shadow"});
        assert!(guard.check("read", &args).is_err());
    }

    #[test]
    fn test_path_guard_blocks_proc() {
        let guard = PathGuard;
        let args = serde_json::json!({"path": "/proc/1/mem"});
        assert!(guard.check("read", &args).is_err());
    }

    #[test]
    fn test_path_guard_blocks_sys() {
        let guard = PathGuard;
        let args = serde_json::json!({"path": "/sys/firmware/efi"});
        assert!(guard.check("write", &args).is_err());
    }

    #[test]
    fn test_path_guard_ignores_bash_tool() {
        let guard = PathGuard;
        let args = serde_json::json!({"path": "/etc/shadow"});
        // PathGuard should only check read/write/edit
        assert!(guard.check("bash", &args).is_ok());
    }

    // ── CommandGuard ──

    #[test]
    fn test_command_guard_allows_safe_command() {
        let guard = CommandGuard;
        let args = serde_json::json!({"command": "ls -la /tmp"});
        assert!(guard.check("bash", &args).is_ok());
    }

    #[test]
    fn test_command_guard_blocks_rm_rf_root() {
        let guard = CommandGuard;
        let args = serde_json::json!({"command": "rm -rf /"});
        assert!(guard.check("bash", &args).is_err());
    }

    #[test]
    fn test_command_guard_blocks_mkfs() {
        let guard = CommandGuard;
        let args = serde_json::json!({"command": "mkfs.ext4 /dev/sda1"});
        assert!(guard.check("bash", &args).is_err());
    }

    #[test]
    fn test_command_guard_blocks_fork_bomb() {
        let guard = CommandGuard;
        let args = serde_json::json!({"command": ":(){ :|:& };:"});
        assert!(guard.check("bash", &args).is_err());
    }

    #[test]
    fn test_command_guard_ignores_read_tool() {
        let guard = CommandGuard;
        let args = serde_json::json!({"command": "rm -rf /"});
        // CommandGuard only checks bash tool
        assert!(guard.check("read", &args).is_ok());
    }

    // ── GuardChain ──

    #[test]
    fn test_guard_chain_all_pass() {
        let chain = GuardChain::with_defaults();
        let args = serde_json::json!({"path": "/home/user/test.txt"});
        assert!(chain.check_all("read", &args).is_ok());
    }

    #[test]
    fn test_guard_chain_path_fail() {
        let chain = GuardChain::with_defaults();
        let args = serde_json::json!({"path": "/etc/shadow"});
        assert!(chain.check_all("read", &args).is_err());
    }

    #[test]
    fn test_guard_chain_command_fail() {
        let chain = GuardChain::with_defaults();
        let args = serde_json::json!({"command": "rm -rf /"});
        assert!(chain.check_all("bash", &args).is_err());
    }

    // ── RiskGuard ──

    #[test]
    fn test_risk_guard_default_passes_high_risk() {
        let guard = RiskGuard::default();
        let args = serde_json::json!({});
        // Default (non-strict) allows high-risk tools through
        assert!(guard.check("k8s_delete_resource", &args).is_ok());
    }

    #[test]
    fn test_risk_guard_strict_blocks_high_risk() {
        let guard = RiskGuard { strict_mode: true };
        let args = serde_json::json!({});
        assert!(guard.check("k8s_delete_resource", &args).is_err());
        assert!(guard.check("db_execute_write", &args).is_err());
        assert!(guard.check("vfs_delete", &args).is_err());
    }

    #[test]
    fn test_risk_guard_strict_allows_low_risk() {
        let guard = RiskGuard { strict_mode: true };
        let args = serde_json::json!({});
        assert!(guard.check("k8s_list_clusters", &args).is_ok());
        assert!(guard.check("vfs_read_file", &args).is_ok());
    }

    #[test]
    fn test_is_high_risk() {
        assert!(RiskGuard::is_high_risk("k8s_apply_yaml"));
        assert!(RiskGuard::is_high_risk("k8s_exec_command"));
        assert!(!RiskGuard::is_high_risk("k8s_list_clusters"));
        assert!(!RiskGuard::is_high_risk("read"));
    }
}
