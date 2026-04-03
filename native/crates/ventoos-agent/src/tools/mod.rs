//! Platform Tool definitions for the `VentoOS` AI Agent.
//!
//! Each sub-module exports tool definitions (`Vec<ToolDefinition>`) that describe
//! the platform capabilities available to the agent (K8s, DB, Redis, VFS, System).
//! The definitions are pure data — execution is handled by the [`ToolExecutor`] trait.

pub mod db_tools;
pub mod k8s_tools;
pub mod redis_tools;
pub mod system_tools;
pub mod vfs_tools;

use crate::types::ToolDefinition;

/// Return all platform tool definitions (K8s + DB + Redis + VFS + System).
pub fn platform_tools() -> Vec<ToolDefinition> {
    let mut tools = Vec::new();
    tools.extend(k8s_tools::definitions());
    tools.extend(db_tools::definitions());
    tools.extend(redis_tools::definitions());
    tools.extend(vfs_tools::definitions());
    tools.extend(system_tools::definitions());
    tools
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_tools_are_unique() {
        let tools = platform_tools();
        let mut names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        let total = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), total, "Duplicate tool names detected");
    }

    #[test]
    fn platform_tools_non_empty() {
        assert!(!platform_tools().is_empty());
    }
}
