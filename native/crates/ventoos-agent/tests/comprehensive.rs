//! Comprehensive tests for the `ventoos-agent` crate.
//!
//! Covers: AgentManager (providers, profiles, channels, config),
//! SessionStore, ToolRegistry, GuardChain, and serialization of core types.

use std::sync::Arc;

use serde_json::json;

use ventoos_agent::guard::{CommandGuard, Guard, GuardChain, PathGuard, RiskGuard};
use ventoos_agent::manager::AgentManager;
use ventoos_agent::session::SessionStore;
use ventoos_agent::tool::{StubToolExecutor, ToolExecutor, ToolRegistry};
use ventoos_agent::types::*;

// ─── Helpers ───────────────────────────────────────────────────────────────

fn make_provider(id: &str, name: &str, vendor: ProviderVendor) -> ProviderConfig {
    ProviderConfig {
        id: id.into(),
        name: name.into(),
        provider_type: vendor.provider_type(),
        vendor,
        api_key: "sk-test-key-12345678".into(),
        base_url: vendor.default_base_url().into(),
        default_model: vendor.default_model().into(),
        enabled: true,
        capabilities: None,
    }
}

fn make_profile(id: &str, name: &str, builtin: bool) -> AgentProfile {
    AgentProfile {
        id: id.into(),
        name: name.into(),
        description: format!("Profile: {name}"),
        preset_kind: AgentPresetKind::Custom,
        is_builtin: builtin,
        system_prompt: format!("You are {name}."),
        behavior: AgentBehaviorConfig::default(),
        tool_config: AgentToolConfig::default(),
        default_provider_id: None,
        default_model: None,
        temperature: 0.2,
        max_tokens: 1024,
        reasoning_mode: ReasoningMode::Off,
    }
}

fn make_channel(id: &str, name: &str, kind: ChannelKind) -> ChannelConfig {
    ChannelConfig::new(id.into(), name.into(), kind)
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT MANAGER — PROVIDERS (1–10)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn t01_add_provider() {
    let mgr = AgentManager::new();
    mgr.add_provider(make_provider("p1", "OpenAI", ProviderVendor::OpenAi))
        .await;
    let p = mgr.get_provider("p1").await;
    assert!(p.is_some());
    assert_eq!(p.unwrap().name, "OpenAI");
}

#[tokio::test]
async fn t02_get_provider() {
    let mgr = AgentManager::new();
    mgr.add_provider(make_provider("p1", "Provider", ProviderVendor::OpenAi))
        .await;
    let p = mgr.get_provider("p1").await.unwrap();
    assert_eq!(p.id, "p1");
    assert_eq!(p.vendor, ProviderVendor::OpenAi);
}

#[tokio::test]
async fn t03_list_providers() {
    let mgr = AgentManager::new();
    assert!(mgr.list_providers().await.is_empty());
    mgr.add_provider(make_provider("p1", "A", ProviderVendor::OpenAi))
        .await;
    assert_eq!(mgr.list_providers().await.len(), 1);
}

#[tokio::test]
async fn t04_update_provider() {
    let mgr = AgentManager::new();
    mgr.add_provider(make_provider("p1", "Old", ProviderVendor::OpenAi))
        .await;
    let mut updated = make_provider("p1", "New", ProviderVendor::OpenAi);
    updated.default_model = "gpt-4".into();
    assert!(mgr.update_provider(updated).await);
    let p = mgr.get_provider("p1").await.unwrap();
    assert_eq!(p.name, "New");
}

#[tokio::test]
async fn t05_delete_provider() {
    let mgr = AgentManager::new();
    mgr.add_provider(make_provider("p1", "P", ProviderVendor::OpenAi))
        .await;
    assert!(mgr.delete_provider("p1").await);
    assert!(mgr.get_provider("p1").await.is_none());
}

#[tokio::test]
async fn t06_update_nonexistent_provider_returns_false() {
    let mgr = AgentManager::new();
    assert!(!mgr.update_provider(make_provider("x", "X", ProviderVendor::OpenAi)).await);
}

#[tokio::test]
async fn t07_delete_nonexistent_provider_returns_false() {
    let mgr = AgentManager::new();
    assert!(!mgr.delete_provider("nope").await);
}

#[tokio::test]
async fn t08_list_multiple_providers_sorted() {
    let mgr = AgentManager::new();
    mgr.add_provider(make_provider("p2", "Bravo", ProviderVendor::Anthropic))
        .await;
    mgr.add_provider(make_provider("p1", "Alpha", ProviderVendor::OpenAi))
        .await;
    let list = mgr.list_providers().await;
    assert_eq!(list.len(), 2);
    // Should be sorted by name
    assert_eq!(list[0].name, "Alpha");
    assert_eq!(list[1].name, "Bravo");
}

#[tokio::test]
async fn t09_provider_templates_count_and_vendors() {
    let mgr = AgentManager::new();
    let templates = mgr.provider_templates();
    assert_eq!(templates.len(), 10);
    let vendors: Vec<ProviderVendor> = templates.iter().map(|t| t.vendor).collect();
    assert!(vendors.contains(&ProviderVendor::OpenAi));
    assert!(vendors.contains(&ProviderVendor::Anthropic));
    assert!(vendors.contains(&ProviderVendor::Ollama));
    assert!(vendors.contains(&ProviderVendor::Gemini));
    assert!(vendors.contains(&ProviderVendor::Custom));
}

#[tokio::test]
async fn t10_all_provider_vendor_variants() {
    let all_vendors = [
        ProviderVendor::OpenAi,
        ProviderVendor::AzureOpenAi,
        ProviderVendor::Anthropic,
        ProviderVendor::Gemini,
        ProviderVendor::OpenRouter,
        ProviderVendor::Ollama,
        ProviderVendor::DeepSeek,
        ProviderVendor::SiliconFlow,
        ProviderVendor::Groq,
        ProviderVendor::Custom,
    ];
    for vendor in &all_vendors {
        assert!(!vendor.display_name().is_empty());
        assert!(!vendor.default_base_url().is_empty());
        assert!(!vendor.default_model().is_empty());
        // provider_type should be valid
        let _ = vendor.provider_type();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT MANAGER — PROFILES (11–18)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn t11_add_profile() {
    let mgr = AgentManager::new();
    mgr.add_profile(make_profile("custom1", "Custom", false)).await;
    let p = mgr.get_profile("custom1").await;
    assert!(p.is_some());
}

#[tokio::test]
async fn t12_get_profile() {
    let mgr = AgentManager::new();
    mgr.add_profile(make_profile("cp", "My Profile", false)).await;
    let p = mgr.get_profile("cp").await.unwrap();
    assert_eq!(p.name, "My Profile");
    assert!(!p.is_builtin);
}

#[tokio::test]
async fn t13_list_profiles() {
    let mgr = AgentManager::new();
    mgr.add_profile(make_profile("cp", "Custom", false)).await;
    let profiles = mgr.list_profiles().await;
    // At least 4 builtins + 1 custom
    assert!(profiles.len() >= 5);
}

#[tokio::test]
async fn t14_update_profile() {
    let mgr = AgentManager::new();
    mgr.add_profile(make_profile("cp", "Old", false)).await;
    let mut updated = make_profile("cp", "Updated", false);
    updated.temperature = 0.9;
    assert!(mgr.update_profile(updated).await);
    let p = mgr.get_profile("cp").await.unwrap();
    assert_eq!(p.name, "Updated");
    assert!((p.temperature - 0.9).abs() < f32::EPSILON);
}

#[tokio::test]
async fn t15_delete_profile() {
    let mgr = AgentManager::new();
    mgr.add_profile(make_profile("cp", "ToDelete", false)).await;
    assert!(mgr.delete_profile("cp").await);
    assert!(mgr.get_profile("cp").await.is_none());
}

#[tokio::test]
async fn t16_update_nonexistent_profile_returns_false() {
    let mgr = AgentManager::new();
    assert!(!mgr.update_profile(make_profile("nope", "X", false)).await);
}

#[tokio::test]
async fn t17_delete_nonexistent_profile_returns_false() {
    let mgr = AgentManager::new();
    assert!(!mgr.delete_profile("nope").await);
}

#[tokio::test]
async fn t18_builtin_profiles_loaded_and_undeletable() {
    let mgr = AgentManager::new();
    let profiles = mgr.list_profiles().await;
    // Should have at least 4 built-in profiles
    let builtins: Vec<_> = profiles.iter().filter(|p| p.is_builtin).collect();
    assert!(builtins.len() >= 4);
    // Builtin profiles cannot be deleted
    assert!(!mgr.delete_profile("general-assistant").await);
    assert!(!mgr.delete_profile("coding-assistant").await);
    // They should still exist after delete attempt
    assert!(mgr.get_profile("general-assistant").await.is_some());
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT MANAGER — CHANNELS (19–25)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn t19_add_channel() {
    let mgr = AgentManager::new();
    mgr.add_channel(make_channel("ch1", "TG Bot", ChannelKind::Telegram))
        .await;
    assert!(mgr.get_channel("ch1").await.is_some());
}

#[tokio::test]
async fn t20_get_channel() {
    let mgr = AgentManager::new();
    mgr.add_channel(make_channel("ch1", "Feishu", ChannelKind::Feishu))
        .await;
    let ch = mgr.get_channel("ch1").await.unwrap();
    assert_eq!(ch.name, "Feishu");
    assert_eq!(ch.kind, ChannelKind::Feishu);
    assert!(ch.enabled);
}

#[tokio::test]
async fn t21_list_channels() {
    let mgr = AgentManager::new();
    assert!(mgr.list_channels().await.is_empty());
    mgr.add_channel(make_channel("ch1", "A", ChannelKind::Qq))
        .await;
    mgr.add_channel(make_channel("ch2", "B", ChannelKind::DingTalk))
        .await;
    assert_eq!(mgr.list_channels().await.len(), 2);
}

#[tokio::test]
async fn t22_update_channel() {
    let mgr = AgentManager::new();
    mgr.add_channel(make_channel("ch1", "Old", ChannelKind::WeCom))
        .await;
    let mut updated = make_channel("ch1", "Updated", ChannelKind::WeCom);
    updated.enabled = false;
    assert!(mgr.update_channel(updated).await);
    let ch = mgr.get_channel("ch1").await.unwrap();
    assert_eq!(ch.name, "Updated");
    assert!(!ch.enabled);
}

#[tokio::test]
async fn t23_delete_channel() {
    let mgr = AgentManager::new();
    mgr.add_channel(make_channel("ch1", "Ch", ChannelKind::Telegram))
        .await;
    assert!(mgr.delete_channel("ch1").await);
    assert!(mgr.get_channel("ch1").await.is_none());
}

#[tokio::test]
async fn t24_update_nonexistent_channel_returns_false() {
    let mgr = AgentManager::new();
    assert!(!mgr.update_channel(make_channel("x", "X", ChannelKind::Qq)).await);
}

#[tokio::test]
async fn t25_delete_nonexistent_channel_returns_false() {
    let mgr = AgentManager::new();
    assert!(!mgr.delete_channel("nope").await);
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT MANAGER — CONFIG (26–28)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn t26_get_default_config() {
    let mgr = AgentManager::new();
    let cfg = mgr.get_config().await;
    assert_eq!(cfg.max_iterations, 10);
    assert!(cfg.tools_enabled);
    assert!(cfg.default_provider_id.is_none());
}

#[tokio::test]
async fn t27_update_config() {
    let mgr = AgentManager::new();
    let mut cfg = mgr.get_config().await;
    cfg.max_iterations = 25;
    cfg.tools_enabled = false;
    mgr.update_config(cfg).await;
    let updated = mgr.get_config().await;
    assert_eq!(updated.max_iterations, 25);
    assert!(!updated.tools_enabled);
}

#[tokio::test]
async fn t28_config_persistence_across_reads() {
    let mgr = AgentManager::new();
    let mut cfg = mgr.get_config().await;
    cfg.default_provider_id = Some("p1".into());
    cfg.default_model = Some("gpt-4".into());
    mgr.update_config(cfg).await;

    // Read twice to confirm persistence
    let c1 = mgr.get_config().await;
    let c2 = mgr.get_config().await;
    assert_eq!(c1.default_provider_id, Some("p1".into()));
    assert_eq!(c2.default_model, Some("gpt-4".into()));
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION STORE (29–41)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn t29_create_session() {
    let store = SessionStore::new();
    let session = store
        .create("s1".into(), "Hello".into(), None, None, None, None)
        .await;
    assert_eq!(session.id, "s1");
    assert_eq!(session.title, "Hello");
    assert!(session.messages.is_empty());
}

#[tokio::test]
async fn t30_get_existing_session() {
    let store = SessionStore::new();
    store
        .create("s1".into(), "Test".into(), None, None, None, None)
        .await;
    let s = store.get("s1").await;
    assert!(s.is_some());
    assert_eq!(s.unwrap().id, "s1");
}

#[tokio::test]
async fn t31_get_nonexistent_session_returns_none() {
    let store = SessionStore::new();
    assert!(store.get("nonexistent").await.is_none());
}

#[tokio::test]
async fn t32_list_sessions_sorted_by_recency() {
    let store = SessionStore::new();
    store
        .create("s1".into(), "First".into(), None, None, None, None)
        .await;
    // Push a message to s1 to update its timestamp
    store
        .push_message("s1", AgentMessage::user("update"))
        .await;

    store
        .create("s2".into(), "Second".into(), None, None, None, None)
        .await;
    // Push to s2 later => s2 is more recent
    store
        .push_message("s2", AgentMessage::user("latest"))
        .await;

    let list = store.list().await;
    assert_eq!(list.len(), 2);
    // Most recently updated first
    assert_eq!(list[0].id, "s2");
}

#[tokio::test]
async fn t33_delete_session() {
    let store = SessionStore::new();
    store
        .create("s1".into(), "X".into(), None, None, None, None)
        .await;
    assert!(store.delete("s1").await);
    assert!(store.get("s1").await.is_none());
}

#[tokio::test]
async fn t34_delete_nonexistent_session_returns_false() {
    let store = SessionStore::new();
    assert!(!store.delete("nope").await);
}

#[tokio::test]
async fn t35_push_message_and_verify() {
    let store = SessionStore::new();
    store
        .create("s1".into(), "Chat".into(), None, None, None, None)
        .await;
    let ok = store
        .push_message("s1", AgentMessage::user("hello world"))
        .await;
    assert!(ok);
    let s = store.get("s1").await.unwrap();
    assert_eq!(s.messages.len(), 1);
    assert_eq!(s.messages[0].role, MessageRole::User);
    assert_eq!(s.messages[0].content.as_deref(), Some("hello world"));
}

#[tokio::test]
async fn t36_push_message_to_nonexistent_returns_false() {
    let store = SessionStore::new();
    assert!(!store.push_message("nope", AgentMessage::user("hi")).await);
}

#[tokio::test]
async fn t37_get_or_create_new_session() {
    let store = SessionStore::new();
    let (session, created) = store
        .get_or_create(None, "New Session", None, None, None, None)
        .await;
    assert!(created);
    assert_eq!(session.title, "New Session");
    // Should be retrievable
    assert!(store.get(&session.id).await.is_some());
}

#[tokio::test]
async fn t38_get_or_create_existing_session() {
    let store = SessionStore::new();
    store
        .create("existing".into(), "Pre".into(), None, None, None, None)
        .await;
    let (session, created) = store
        .get_or_create(Some("existing"), "Ignored", None, None, None, None)
        .await;
    assert!(!created);
    assert_eq!(session.id, "existing");
    assert_eq!(session.title, "Pre"); // Title not overwritten
}

#[tokio::test]
async fn t39_bind_channel_conversation() {
    let store = SessionStore::new();
    store
        .create("s1".into(), "Bound".into(), None, None, None, None)
        .await;
    let binding = ChannelConversationBinding::new(
        "ch1".into(),
        ChannelKind::Telegram,
        "conv-123".into(),
        None,
        "user-456".into(),
        "s1".into(),
        Some("general-assistant".into()),
    );
    store.bind_channel_conversation(binding).await;

    let s = store.get("s1").await.unwrap();
    assert!(s.channel_binding.is_some());
    let b = s.channel_binding.unwrap();
    assert_eq!(b.channel_id, "ch1");
    assert_eq!(b.session_id, "s1");
}

#[tokio::test]
async fn t40_find_session_by_channel_binding() {
    let store = SessionStore::new();
    store
        .create("s1".into(), "Chat".into(), None, None, None, None)
        .await;
    let binding = ChannelConversationBinding::new(
        "ch-tg".into(),
        ChannelKind::Telegram,
        "conv-abc".into(),
        None,
        "user-1".into(),
        "s1".into(),
        None,
    );
    store.bind_channel_conversation(binding).await;

    let found = store
        .find_session_by_channel("ch-tg", ChannelKind::Telegram, "conv-abc", None)
        .await;
    assert_eq!(found, Some("s1".into()));

    // Non-matching returns None
    let not_found = store
        .find_session_by_channel("ch-tg", ChannelKind::Qq, "conv-abc", None)
        .await;
    assert!(not_found.is_none());
}

#[tokio::test]
async fn t41_multiple_messages_in_session() {
    let store = SessionStore::new();
    store
        .create("s1".into(), "Multi".into(), None, None, None, None)
        .await;
    store
        .push_message("s1", AgentMessage::user("msg1"))
        .await;
    store
        .push_message("s1", AgentMessage::assistant("reply1"))
        .await;
    store
        .push_message("s1", AgentMessage::user("msg2"))
        .await;

    let s = store.get("s1").await.unwrap();
    assert_eq!(s.messages.len(), 3);
    assert_eq!(s.messages[0].role, MessageRole::User);
    assert_eq!(s.messages[1].role, MessageRole::Assistant);
    assert_eq!(s.messages[2].role, MessageRole::User);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY (42–49)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn t42_new_empty_registry() {
    let registry = ToolRegistry::new();
    assert!(registry.list().is_empty());
}

#[test]
fn t43_with_builtins_has_atomic_tools() {
    let registry = ToolRegistry::with_builtins();
    // At least the 4 atomic tools
    assert!(registry.list().len() >= 4);
    assert!(registry.get("read").is_some());
    assert!(registry.get("write").is_some());
    assert!(registry.get("edit").is_some());
    assert!(registry.get("bash").is_some());
}

#[test]
fn t44_register_custom_tool() {
    let mut registry = ToolRegistry::new();
    registry.register(ToolDefinition {
        name: "my_tool".into(),
        description: "Custom tool".into(),
        parameters: json!({"type": "object"}),
        risk_level: RiskLevel::Low,
    });
    assert_eq!(registry.list().len(), 1);
}

#[test]
fn t45_get_existing_tool() {
    let registry = ToolRegistry::with_builtins();
    let tool = registry.get("read").unwrap();
    assert_eq!(tool.name, "read");
    assert!(!tool.description.is_empty());
}

#[test]
fn t46_get_nonexistent_returns_none() {
    let registry = ToolRegistry::with_builtins();
    assert!(registry.get("nonexistent_tool").is_none());
}

#[test]
fn t47_list_all_tools() {
    let registry = ToolRegistry::with_builtins();
    let tools = registry.list();
    // Verify they are sorted by name
    for w in tools.windows(2) {
        assert!(w[0].name <= w[1].name);
    }
}

#[test]
fn t48_definitions_returns_owned_copies() {
    let registry = ToolRegistry::with_builtins();
    let defs = registry.definitions();
    assert!(!defs.is_empty());
    // Owned copies should have the same data
    let first = &defs[0];
    let from_get = registry.get(&first.name).unwrap();
    assert_eq!(first.name, from_get.name);
    assert_eq!(first.description, from_get.description);
}

#[test]
fn t49_tool_risk_levels() {
    let registry = ToolRegistry::with_builtins();
    assert_eq!(registry.get("read").unwrap().risk_level, RiskLevel::Low);
    assert_eq!(registry.get("write").unwrap().risk_level, RiskLevel::Medium);
    assert_eq!(registry.get("edit").unwrap().risk_level, RiskLevel::Medium);
    assert_eq!(registry.get("bash").unwrap().risk_level, RiskLevel::High);
}

// ═══════════════════════════════════════════════════════════════════════════
// GUARD CHAIN (50–56)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn t50_path_guard_blocks_etc_shadow() {
    let guard = PathGuard;
    let args = json!({"path": "/etc/shadow"});
    assert!(guard.check("read", &args).is_err());
}

#[test]
fn t51_path_guard_allows_safe_paths() {
    let guard = PathGuard;
    let ok_paths = ["/home/user/file.txt", "/tmp/data.json", "/var/log/app.log"];
    for path in &ok_paths {
        let args = json!({"path": path});
        assert!(guard.check("read", &args).is_ok(), "should allow {path}");
    }
}

#[test]
fn t52_command_guard_blocks_rm_rf_root() {
    let guard = CommandGuard;
    let args = json!({"command": "rm -rf /"});
    assert!(guard.check("bash", &args).is_err());
}

#[test]
fn t53_command_guard_allows_safe_commands() {
    let guard = CommandGuard;
    let safe = ["ls -la /tmp", "cat /etc/hostname", "echo hello", "pwd"];
    for cmd in &safe {
        let args = json!({"command": cmd});
        assert!(guard.check("bash", &args).is_ok(), "should allow: {cmd}");
    }
}

#[test]
fn t54_risk_guard_strict_blocks_high_risk() {
    let guard = RiskGuard { strict_mode: true };
    let args = json!({});
    assert!(guard.check("k8s_delete_resource", &args).is_err());
    assert!(guard.check("db_execute_write", &args).is_err());
    assert!(guard.check("redis_delete_key", &args).is_err());
    assert!(guard.check("vfs_delete", &args).is_err());
    // Low-risk should pass even in strict mode
    assert!(guard.check("read", &args).is_ok());
    assert!(guard.check("k8s_list_clusters", &args).is_ok());
}

#[test]
fn t55_empty_guard_chain_passes_all() {
    let chain = GuardChain::new();
    let args = json!({"path": "/etc/shadow", "command": "rm -rf /"});
    // Empty chain has no guards, so everything passes
    assert!(chain.check_all("read", &args).is_ok());
    assert!(chain.check_all("bash", &args).is_ok());
}

#[test]
fn t56_with_defaults_chain() {
    let chain = GuardChain::with_defaults();
    // Safe operation should pass
    let safe = json!({"path": "/tmp/safe.txt"});
    assert!(chain.check_all("read", &safe).is_ok());
    // Dangerous operations should be caught
    let dangerous_path = json!({"path": "/proc/kcore"});
    assert!(chain.check_all("read", &dangerous_path).is_err());
    let dangerous_cmd = json!({"command": "rm -rf /"});
    assert!(chain.check_all("bash", &dangerous_cmd).is_err());
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — SERIALIZATION (57–61)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn t57_provider_config_serialization() {
    let cfg = make_provider("p1", "Test", ProviderVendor::OpenAi);
    let json_str = serde_json::to_string(&cfg).unwrap();
    let deserialized: ProviderConfig = serde_json::from_str(&json_str).unwrap();
    assert_eq!(deserialized.id, "p1");
    assert_eq!(deserialized.name, "Test");
    assert_eq!(deserialized.vendor, ProviderVendor::OpenAi);
}

#[test]
fn t58_agent_profile_serialization() {
    let profile = make_profile("ap1", "Agent Profile", false);
    let json_str = serde_json::to_string(&profile).unwrap();
    let deserialized: AgentProfile = serde_json::from_str(&json_str).unwrap();
    assert_eq!(deserialized.id, "ap1");
    assert_eq!(deserialized.name, "Agent Profile");
    assert!(!deserialized.is_builtin);
}

#[test]
fn t59_chat_request_serialization() {
    let req = ChatRequest {
        session_id: Some("s1".into()),
        message: "Hello".into(),
        provider_id: Some("p1".into()),
        model: None,
        system_prompt: None,
        agent_profile_id: None,
    };
    let json_str = serde_json::to_string(&req).unwrap();
    let deserialized: ChatRequest = serde_json::from_str(&json_str).unwrap();
    assert_eq!(deserialized.session_id, Some("s1".into()));
    assert_eq!(deserialized.message, "Hello");
    assert_eq!(deserialized.provider_id, Some("p1".into()));
}

#[test]
fn t60_provider_capabilities_all_flags() {
    let caps = ProviderCapabilities::for_vendor(ProviderVendor::OpenAi);
    assert!(caps.supports_streaming);
    assert!(caps.supports_tools);
    assert!(caps.supports_reasoning_control);
    assert!(caps.supports_connection_test);
    // Anthropic/Gemini have different capabilities
    let anthropic_caps = ProviderCapabilities::for_vendor(ProviderVendor::Anthropic);
    assert!(anthropic_caps.supports_streaming);
    assert!(!anthropic_caps.supports_tools);
    // Serialization round-trip
    let json_str = serde_json::to_string(&caps).unwrap();
    let deserialized: ProviderCapabilities = serde_json::from_str(&json_str).unwrap();
    assert_eq!(caps, deserialized);
}

#[test]
fn t61_channel_config_serialization() {
    let ch = make_channel("ch1", "TestChannel", ChannelKind::DingTalk);
    let json_str = serde_json::to_string(&ch).unwrap();
    let deserialized: ChannelConfig = serde_json::from_str(&json_str).unwrap();
    assert_eq!(deserialized.id, "ch1");
    assert_eq!(deserialized.name, "TestChannel");
    assert_eq!(deserialized.kind, ChannelKind::DingTalk);
    assert!(deserialized.enabled);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRA COVERAGE (62+)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn t62_stub_executor_returns_stub_response() {
    let executor = StubToolExecutor;
    let result = executor
        .execute("read", &json!({"path": "/tmp/test"}))
        .await;
    assert!(result.is_ok());
    let val = result.unwrap();
    assert_eq!(val["status"], "stub");
    assert_eq!(val["tool"], "read");
}

#[test]
fn t63_agent_message_constructors() {
    let sys = AgentMessage::system("system prompt");
    assert_eq!(sys.role, MessageRole::System);
    assert_eq!(sys.content.as_deref(), Some("system prompt"));

    let user = AgentMessage::user("hello");
    assert_eq!(user.role, MessageRole::User);

    let asst = AgentMessage::assistant("reply");
    assert_eq!(asst.role, MessageRole::Assistant);

    let tool = AgentMessage::tool_result("tc-1", "read", "file content");
    assert_eq!(tool.role, MessageRole::Tool);
    assert_eq!(tool.tool_call_id, Some("tc-1".into()));
    assert_eq!(tool.name, Some("read".into()));
}

#[test]
fn t64_mask_api_key() {
    assert_eq!(mask_api_key("short"), "****");
    assert_eq!(mask_api_key("sk-abcdefghijklmnop"), "sk-a...mnop");
    assert_eq!(mask_api_key("12345678"), "****");
    assert_eq!(mask_api_key("123456789"), "1234...6789");
}

#[test]
fn t65_provider_config_normalized() {
    let cfg = ProviderConfig {
        id: "p1".into(),
        name: "".into(),       // empty -> filled from vendor
        provider_type: ProviderType::OpenAiCompatible, // will be corrected
        vendor: ProviderVendor::Anthropic,
        api_key: "key".into(),
        base_url: "".into(),   // empty -> filled from vendor
        default_model: "".into(), // empty -> filled from vendor
        enabled: true,
        capabilities: None,
    };
    let n = cfg.normalized();
    assert_eq!(n.name, "Anthropic");
    assert_eq!(n.provider_type, ProviderType::Native);
    assert!(!n.base_url.is_empty());
    assert!(!n.default_model.is_empty());
    assert!(n.capabilities.is_some());
}

#[test]
fn t66_provider_config_masked() {
    let cfg = make_provider("p1", "P", ProviderVendor::OpenAi);
    let masked = cfg.masked();
    assert_ne!(masked.api_key, cfg.api_key);
    assert!(masked.api_key.contains("..."));
}

#[test]
fn t67_channel_conversation_binding_key() {
    let binding = ChannelConversationBinding::new(
        "ch1".into(),
        ChannelKind::Telegram,
        "conv1".into(),
        Some("thread1".into()),
        "user1".into(),
        "s1".into(),
        None,
    );
    let key = binding.key();
    assert!(key.contains("ch1"));
    assert!(key.contains("conv1"));
    assert!(key.contains("thread1"));
}

#[test]
fn t68_builtin_agent_profiles_content() {
    let profiles = builtin_agent_profiles();
    assert!(profiles.len() >= 4);
    let ids: Vec<&str> = profiles.iter().map(|p| p.id.as_str()).collect();
    assert!(ids.contains(&"general-assistant"));
    assert!(ids.contains(&"coding-assistant"));
    assert!(ids.contains(&"ops-assistant"));
    assert!(ids.contains(&"network-assistant"));
    for p in &profiles {
        assert!(p.is_builtin);
        assert!(!p.system_prompt.is_empty());
    }
}

#[test]
fn t69_agent_profile_effective_system_prompt() {
    let mut profile = make_profile("p", "P", false);
    profile.system_prompt = "Base prompt".into();
    profile.behavior.read_only_mode = true;
    profile.behavior.concise_output = true;
    profile.tool_config.allow_bash = false;
    profile.behavior.extra_rules = vec!["Custom rule".into()];

    let effective = profile.effective_system_prompt();
    assert!(effective.contains("Base prompt"));
    assert!(effective.contains("read-only"));
    assert!(effective.contains("concise"));
    assert!(effective.contains("bash"));
    assert!(effective.contains("Custom rule"));
}

#[test]
fn t70_path_guard_blocks_proc_prefix() {
    let guard = PathGuard;
    let args = json!({"path": "/proc/1/mem"});
    assert!(guard.check("read", &args).is_err());
}

#[test]
fn t71_path_guard_blocks_sys_prefix() {
    let guard = PathGuard;
    let args = json!({"path": "/sys/firmware/efi"});
    assert!(guard.check("write", &args).is_err());
}

#[test]
fn t72_path_guard_ignores_non_file_tools() {
    let guard = PathGuard;
    // PathGuard only checks read/write/edit, not bash
    let args = json!({"path": "/etc/shadow"});
    assert!(guard.check("bash", &args).is_ok());
    assert!(guard.check("k8s_list", &args).is_ok());
}

#[test]
fn t73_command_guard_blocks_mkfs() {
    let guard = CommandGuard;
    let args = json!({"command": "mkfs.ext4 /dev/sda1"});
    assert!(guard.check("bash", &args).is_err());
}

#[test]
fn t74_command_guard_blocks_fork_bomb() {
    let guard = CommandGuard;
    let args = json!({"command": ":(){ :|:& };:"});
    assert!(guard.check("bash", &args).is_err());
}

#[test]
fn t75_command_guard_ignores_non_bash_tools() {
    let guard = CommandGuard;
    let args = json!({"command": "rm -rf /"});
    assert!(guard.check("read", &args).is_ok());
}

#[test]
fn t76_risk_guard_is_high_risk_check() {
    assert!(RiskGuard::is_high_risk("k8s_apply_yaml"));
    assert!(RiskGuard::is_high_risk("k8s_delete_resource"));
    assert!(RiskGuard::is_high_risk("k8s_exec_command"));
    assert!(RiskGuard::is_high_risk("db_execute_write"));
    assert!(RiskGuard::is_high_risk("redis_delete_key"));
    assert!(RiskGuard::is_high_risk("vfs_delete"));
    assert!(!RiskGuard::is_high_risk("read"));
    assert!(!RiskGuard::is_high_risk("k8s_list_clusters"));
}

#[test]
fn t77_risk_guard_default_allows_high_risk() {
    // Default (non-strict) mode allows high-risk tools through for the confirmation flow
    let guard = RiskGuard::default();
    assert!(guard.check("k8s_delete_resource", &json!({})).is_ok());
}

#[test]
fn t78_provider_type_serde_roundtrip() {
    let native = ProviderType::Native;
    let compat = ProviderType::OpenAiCompatible;
    let j1 = serde_json::to_string(&native).unwrap();
    let j2 = serde_json::to_string(&compat).unwrap();
    assert_eq!(serde_json::from_str::<ProviderType>(&j1).unwrap(), native);
    assert_eq!(serde_json::from_str::<ProviderType>(&j2).unwrap(), compat);
}

#[test]
fn t79_provider_vendor_serde_roundtrip() {
    let vendors = [
        ProviderVendor::OpenAi,
        ProviderVendor::AzureOpenAi,
        ProviderVendor::Anthropic,
        ProviderVendor::Gemini,
        ProviderVendor::OpenRouter,
        ProviderVendor::Ollama,
        ProviderVendor::DeepSeek,
        ProviderVendor::SiliconFlow,
        ProviderVendor::Groq,
        ProviderVendor::Custom,
    ];
    for vendor in vendors {
        let json_str = serde_json::to_string(&vendor).unwrap();
        let back: ProviderVendor = serde_json::from_str(&json_str).unwrap();
        assert_eq!(back, vendor);
    }
}

#[test]
fn t80_agent_config_default_values() {
    let cfg = AgentConfig::default();
    assert_eq!(cfg.max_iterations, 10);
    assert!(cfg.tools_enabled);
    assert!(cfg.default_provider_id.is_none());
    assert!(cfg.default_model.is_none());
    assert_eq!(
        cfg.default_agent_profile_id,
        Some("general-assistant".into())
    );
    assert!(!cfg.default_system_prompt.is_empty());
}

#[tokio::test]
async fn t81_session_store_default_trait() {
    let store = SessionStore::default();
    assert!(store.list().await.is_empty());
}

#[tokio::test]
async fn t82_agent_manager_default_trait() {
    let mgr = AgentManager::default();
    // Should have built-in profiles
    let profiles = mgr.list_profiles().await;
    assert!(!profiles.is_empty());
}

#[tokio::test]
async fn t83_agent_manager_with_executor() {
    let executor = Arc::new(StubToolExecutor);
    let mgr = AgentManager::with_executor(executor);
    // Should work the same as new()
    assert!(mgr.list_providers().await.is_empty());
    assert!(!mgr.list_profiles().await.is_empty());
}

#[test]
fn t84_tool_definition_clone() {
    let tool = ToolDefinition {
        name: "test".into(),
        description: "desc".into(),
        parameters: json!({"type": "object"}),
        risk_level: RiskLevel::Low,
    };
    let cloned = tool.clone();
    assert_eq!(tool.name, cloned.name);
    assert_eq!(tool.risk_level, cloned.risk_level);
}

#[test]
fn t85_stream_event_variants() {
    let delta = StreamEvent::ContentDelta {
        content: "hello".into(),
    };
    let json_str = serde_json::to_string(&delta).unwrap();
    assert!(json_str.contains("content_delta"));

    let done = StreamEvent::Done {
        session_id: "s1".into(),
    };
    let json_str = serde_json::to_string(&done).unwrap();
    assert!(json_str.contains("done"));

    let error = StreamEvent::Error {
        message: "fail".into(),
    };
    let json_str = serde_json::to_string(&error).unwrap();
    assert!(json_str.contains("error"));
}

#[test]
fn t86_channel_kind_variants() {
    let kinds = [
        ChannelKind::Qq,
        ChannelKind::DingTalk,
        ChannelKind::Feishu,
        ChannelKind::WeCom,
        ChannelKind::Telegram,
    ];
    for kind in kinds {
        let json_str = serde_json::to_string(&kind).unwrap();
        let back: ChannelKind = serde_json::from_str(&json_str).unwrap();
        assert_eq!(back, kind);
    }
}

#[test]
fn t87_risk_level_serde() {
    let levels = [
        RiskLevel::Low,
        RiskLevel::Medium,
        RiskLevel::High,
        RiskLevel::Critical,
    ];
    for level in levels {
        let json_str = serde_json::to_string(&level).unwrap();
        let back: RiskLevel = serde_json::from_str(&json_str).unwrap();
        assert_eq!(back, level);
    }
}

#[test]
fn t88_guard_chain_add_custom_guard() {
    struct AlwaysReject;
    impl Guard for AlwaysReject {
        fn check(&self, _tool: &str, _args: &serde_json::Value) -> Result<(), AgentError> {
            Err(AgentError::GuardRejected("rejected".into()))
        }
    }

    let mut chain = GuardChain::new();
    chain.add(Box::new(AlwaysReject));
    assert!(chain.check_all("read", &json!({})).is_err());
}

#[tokio::test]
async fn t89_session_create_with_provider_and_model() {
    let store = SessionStore::new();
    let session = store
        .create(
            "s1".into(),
            "Chat".into(),
            Some("p1".into()),
            Some("gpt-4".into()),
            Some("Be helpful".into()),
            Some("general-assistant".into()),
        )
        .await;
    assert_eq!(session.provider_id, Some("p1".into()));
    assert_eq!(session.model, Some("gpt-4".into()));
    assert_eq!(session.system_prompt, Some("Be helpful".into()));
    assert_eq!(
        session.agent_profile_id,
        Some("general-assistant".into())
    );
}

#[test]
fn t90_truncate_title() {
    use ventoos_agent::session::truncate_title;
    assert_eq!(truncate_title("short"), "short");
    let long = "a".repeat(100);
    let truncated = truncate_title(&long);
    assert!(truncated.len() < 100);
    assert!(truncated.ends_with("..."));
}

#[tokio::test]
async fn t91_provider_overwrite_on_add() {
    let mgr = AgentManager::new();
    mgr.add_provider(make_provider("p1", "First", ProviderVendor::OpenAi))
        .await;
    mgr.add_provider(make_provider("p1", "Second", ProviderVendor::Anthropic))
        .await;
    let p = mgr.get_provider("p1").await.unwrap();
    // Second add overwrites the first
    assert_eq!(p.name, "Second");
    assert_eq!(p.vendor, ProviderVendor::Anthropic);
}

#[test]
fn t92_channel_config_new_defaults() {
    let ch = ChannelConfig::new("c1".into(), "Bot".into(), ChannelKind::Telegram);
    assert!(ch.enabled);
    assert!(ch.auto_route_agent);
    assert!(ch.webhook_url.is_none());
    assert!(ch.bot_user_id.is_none());
    assert!(ch.default_agent_profile_id.is_none());
}

#[test]
fn t93_agent_behavior_config_default() {
    let cfg = AgentBehaviorConfig::default();
    assert!(cfg.require_impact_for_destructive);
    assert!(!cfg.read_only_mode);
    assert!(cfg.concise_output);
    assert!(cfg.extra_rules.is_empty());
}

#[test]
fn t94_agent_tool_config_default() {
    let cfg = AgentToolConfig::default();
    assert!(cfg.allow_bash);
    assert!(!cfg.enabled_tools.is_empty());
    assert!(cfg.enabled_tools.contains(&"read".to_string()));
}

#[test]
fn t95_message_role_serde() {
    let roles = [
        MessageRole::System,
        MessageRole::User,
        MessageRole::Assistant,
        MessageRole::Tool,
    ];
    for role in roles {
        let json_str = serde_json::to_string(&role).unwrap();
        let back: MessageRole = serde_json::from_str(&json_str).unwrap();
        assert_eq!(back, role);
    }
}

#[tokio::test]
async fn t96_channels_sorted_by_name() {
    let mgr = AgentManager::new();
    mgr.add_channel(make_channel("c2", "Zeta", ChannelKind::WeCom))
        .await;
    mgr.add_channel(make_channel("c1", "Alpha", ChannelKind::Qq))
        .await;
    let channels = mgr.list_channels().await;
    assert_eq!(channels[0].name, "Alpha");
    assert_eq!(channels[1].name, "Zeta");
}

#[test]
fn t97_provider_template_ollama_no_api_key() {
    let templates = builtin_provider_templates();
    let ollama = templates.iter().find(|t| t.vendor == ProviderVendor::Ollama).unwrap();
    assert!(!ollama.requires_api_key);
    // All others require API key
    for t in &templates {
        if t.vendor != ProviderVendor::Ollama {
            assert!(t.requires_api_key, "{:?} should require api key", t.vendor);
        }
    }
}

#[test]
fn t98_reasoning_mode_serde() {
    let modes = [
        ReasoningMode::Off,
        ReasoningMode::Low,
        ReasoningMode::Medium,
        ReasoningMode::High,
    ];
    for mode in modes {
        let json_str = serde_json::to_string(&mode).unwrap();
        let back: ReasoningMode = serde_json::from_str(&json_str).unwrap();
        assert_eq!(back, mode);
    }
}

#[test]
fn t99_command_guard_blocks_dd() {
    let guard = CommandGuard;
    let args = json!({"command": "dd if=/dev/zero of=/dev/sda"});
    assert!(guard.check("bash", &args).is_err());
}

#[test]
fn t100_command_guard_blocks_shutdown() {
    let guard = CommandGuard;
    let args = json!({"command": "shutdown now"});
    assert!(guard.check("bash", &args).is_err());
}
