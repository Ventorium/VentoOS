//! Integration tests for the AI Agent subsystem.

use std::sync::Arc;

use ventoos_agent::executor::{PlatformToolExecutor, register_platform_stubs};
use ventoos_agent::guard::{GuardChain, RiskGuard};
use ventoos_agent::tool::{StubToolExecutor, ToolRegistry};
use ventoos_agent::tools::platform_tools;
use ventoos_agent::types::RiskLevel;
use ventoos_agent::ToolExecutor;

// ─── Tool Registration & Discovery ────────────────────────────────────────

#[test]
fn test_all_platform_tools_registered_in_registry() {
    let registry = ToolRegistry::with_builtins();
    for tool in platform_tools() {
        assert!(
            registry.get(&tool.name).is_some(),
            "Platform tool '{}' not found in registry",
            tool.name
        );
    }
}

#[test]
fn test_k8s_tools_count() {
    let k8s = ventoos_agent::tools::k8s_tools::definitions();
    assert_eq!(k8s.len(), 9, "Expected 9 K8s tools");
}

#[test]
fn test_db_tools_count() {
    let db = ventoos_agent::tools::db_tools::definitions();
    assert_eq!(db.len(), 6, "Expected 6 DB tools");
}

#[test]
fn test_redis_tools_count() {
    let redis = ventoos_agent::tools::redis_tools::definitions();
    assert_eq!(redis.len(), 5, "Expected 5 Redis tools");
}

#[test]
fn test_vfs_tools_count() {
    let vfs = ventoos_agent::tools::vfs_tools::definitions();
    assert_eq!(vfs.len(), 6, "Expected 6 VFS tools");
}

#[test]
fn test_system_tools_count() {
    let sys = ventoos_agent::tools::system_tools::definitions();
    assert_eq!(sys.len(), 4, "Expected 4 System tools");
}

#[test]
fn test_platform_tool_names_are_unique() {
    let tools = platform_tools();
    let mut names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
    let total = names.len();
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), total, "Duplicate tool names detected");
}

#[test]
fn test_all_tools_have_valid_parameters_schema() {
    for tool in platform_tools() {
        assert!(
            tool.parameters.is_object(),
            "Tool '{}' parameters must be an object",
            tool.name
        );
        let obj = tool.parameters.as_object().unwrap();
        assert!(
            obj.contains_key("type"),
            "Tool '{}' parameters missing 'type' field",
            tool.name
        );
    }
}

// ─── Tool Routing / Dispatch ───────────────────────────────────────────────

#[tokio::test]
async fn test_platform_executor_routes_to_registered_handler() {
    let fallback = Arc::new(StubToolExecutor);
    let mut executor = PlatformToolExecutor::new(fallback);
    executor.register_fn("k8s_list_namespaces", |args| async move {
        let cluster = args["cluster_id"].as_str().unwrap_or("unknown");
        Ok(serde_json::json!({"namespaces": ["default", "kube-system"], "cluster": cluster}))
    });

    let result = executor
        .execute(
            "k8s_list_namespaces",
            &serde_json::json!({"cluster_id": "prod"}),
        )
        .await;
    assert!(result.is_ok());
    let val = result.unwrap();
    assert_eq!(val["cluster"], "prod");
    assert_eq!(val["namespaces"][0], "default");
}

#[tokio::test]
async fn test_platform_executor_unknown_tool_falls_through() {
    let fallback = Arc::new(StubToolExecutor);
    let mut executor = PlatformToolExecutor::new(fallback);
    register_platform_stubs(&mut executor);

    let result = executor
        .execute("read", &serde_json::json!({"path": "/tmp/test"}))
        .await;
    assert!(result.is_ok());
    let val = result.unwrap();
    assert_eq!(val["status"], "stub");
}

#[tokio::test]
async fn test_platform_stubs_return_not_connected() {
    let fallback = Arc::new(StubToolExecutor);
    let mut executor = PlatformToolExecutor::new(fallback);
    register_platform_stubs(&mut executor);

    for tool_name in &[
        "k8s_list_clusters",
        "db_list_connections",
        "redis_get_key",
        "vfs_list_mounts",
        "system_notify",
    ] {
        let result = executor
            .execute(tool_name, &serde_json::json!({}))
            .await;
        assert!(result.is_ok(), "Stub for '{}' should succeed", tool_name);
        let val = result.unwrap();
        assert_eq!(val["status"], "not_connected");
    }
}

// ─── Risk Assessment ──────────────────────────────────────────────────────

#[test]
fn test_high_risk_tools_identified() {
    let high_risk_names = [
        "k8s_apply_yaml",
        "k8s_delete_resource",
        "k8s_exec_command",
        "db_execute_write",
        "redis_delete_key",
        "vfs_delete",
    ];

    for name in &high_risk_names {
        assert!(
            RiskGuard::is_high_risk(name),
            "'{}' should be identified as high-risk",
            name
        );
    }
}

#[test]
fn test_low_risk_tools_not_flagged() {
    let low_risk_names = [
        "k8s_list_clusters",
        "db_list_tables",
        "redis_get_key",
        "vfs_read_file",
        "system_get_context",
    ];

    for name in &low_risk_names {
        assert!(
            !RiskGuard::is_high_risk(name),
            "'{}' should NOT be high-risk",
            name
        );
    }
}

#[test]
fn test_risk_levels_match_definitions() {
    let tools = platform_tools();
    let high_risk_names: Vec<&str> = vec![
        "k8s_apply_yaml",
        "k8s_delete_resource",
        "k8s_exec_command",
        "db_execute_write",
        "redis_delete_key",
        "vfs_delete",
    ];

    for tool in &tools {
        if high_risk_names.contains(&tool.name.as_str()) {
            assert_eq!(
                tool.risk_level,
                RiskLevel::High,
                "Tool '{}' should have High risk level",
                tool.name
            );
        }
    }
}

// ─── Guard Rule Matching ──────────────────────────────────────────────────

#[test]
fn test_guard_chain_allows_low_risk_platform_tools() {
    let chain = GuardChain::with_defaults();
    let args = serde_json::json!({"cluster_id": "prod"});
    assert!(chain.check_all("k8s_list_clusters", &args).is_ok());
    assert!(chain.check_all("db_list_connections", &args).is_ok());
    assert!(chain.check_all("vfs_read_file", &args).is_ok());
}

#[test]
fn test_strict_guard_blocks_high_risk_platform_tools() {
    let mut chain = GuardChain::new();
    chain.add(Box::new(RiskGuard { strict_mode: true }));

    let args = serde_json::json!({});
    assert!(chain.check_all("k8s_delete_resource", &args).is_err());
    assert!(chain.check_all("db_execute_write", &args).is_err());
    assert!(chain.check_all("vfs_delete", &args).is_err());
}

// ─── Session Persistence ──────────────────────────────────────────────────

#[tokio::test]
async fn test_session_create_and_retrieve() {
    let store = ventoos_agent::session::SessionStore::new();
    let sessions_before = store.list().await;
    assert!(sessions_before.is_empty());

    let (session, created) = store
        .get_or_create(None, "Test session", None, None, None, None)
        .await;
    assert!(created);
    assert_eq!(session.title, "Test session");

    let retrieved = store.get(&session.id).await;
    assert!(retrieved.is_some());
    assert_eq!(retrieved.unwrap().id, session.id);
}

#[tokio::test]
async fn test_session_message_persistence() {
    let store = ventoos_agent::session::SessionStore::new();
    let (session, _) = store
        .get_or_create(None, "chat", None, None, None, None)
        .await;

    let msg = ventoos_agent::types::AgentMessage::user("Hello");
    store.push_message(&session.id, msg).await;

    let updated = store.get(&session.id).await.unwrap();
    assert_eq!(updated.messages.len(), 1);
    assert_eq!(updated.messages[0].content.as_deref(), Some("Hello"));
}

#[tokio::test]
async fn test_session_delete() {
    let store = ventoos_agent::session::SessionStore::new();
    let (session, _) = store
        .get_or_create(None, "to-delete", None, None, None, None)
        .await;

    assert!(store.delete(&session.id).await);
    assert!(store.get(&session.id).await.is_none());
}
