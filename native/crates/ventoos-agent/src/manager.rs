//! Top-level `AgentManager` — coordinates providers, tools, guards, sessions, profiles, and probes.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing::info;

use crate::agent::AgentRunner;
use crate::executor::{PlatformToolExecutor, register_platform_stubs};
use crate::guard::GuardChain;
use crate::provider::ProviderClient;
use crate::session::SessionStore;
use crate::tool::{StubToolExecutor, ToolExecutor, ToolRegistry};
use crate::types::{
    AgentConfig, AgentError, AgentProfile, ChannelConfig, ChatRequest, ProviderConfig,
    ProviderProbeRequest, ProviderProbeResult, ProviderTemplate, builtin_agent_profiles,
    builtin_provider_templates,
};

/// Central coordinator for the AI agent subsystem.
pub struct AgentManager {
    pub(crate) sessions: Arc<SessionStore>,
    pub(crate) providers: Arc<RwLock<HashMap<String, ProviderConfig>>>,
    pub(crate) profiles: Arc<RwLock<HashMap<String, AgentProfile>>>,
    pub(crate) channels: Arc<RwLock<HashMap<String, ChannelConfig>>>,
    pub(crate) tool_registry: Arc<RwLock<ToolRegistry>>,
    pub(crate) guards: Arc<GuardChain>,
    pub(crate) config: Arc<RwLock<AgentConfig>>,
    pub(crate) executor: Arc<dyn ToolExecutor>,
}

impl AgentManager {
    pub fn new() -> Self {
        let stub = Arc::new(StubToolExecutor);
        let mut platform_executor = PlatformToolExecutor::new(stub);
        register_platform_stubs(&mut platform_executor);
        Self::with_executor(Arc::new(platform_executor))
    }

    /// Create a manager with a custom tool executor.
    pub fn with_executor(executor: Arc<dyn ToolExecutor>) -> Self {
        let profiles = builtin_agent_profiles()
            .into_iter()
            .map(|profile| (profile.id.clone(), profile))
            .collect();

        Self {
            sessions: Arc::new(SessionStore::new()),
            providers: Arc::new(RwLock::new(HashMap::new())),
            profiles: Arc::new(RwLock::new(profiles)),
            channels: Arc::new(RwLock::new(HashMap::new())),
            tool_registry: Arc::new(RwLock::new(ToolRegistry::with_builtins())),
            guards: Arc::new(GuardChain::with_defaults()),
            config: Arc::new(RwLock::new(AgentConfig::default())),
            executor,
        }
    }

    // ── Provider Management ────────────────────────────────────────────────

    pub async fn add_provider(&self, config: ProviderConfig) {
        let normalized = config.normalized();
        info!("Adding provider: {} ({})", normalized.name, normalized.id);
        self.providers
            .write()
            .await
            .insert(normalized.id.clone(), normalized);
    }

    pub async fn get_provider(&self, id: &str) -> Option<ProviderConfig> {
        self.providers.read().await.get(id).cloned()
    }

    pub async fn list_providers(&self) -> Vec<ProviderConfig> {
        let mut providers: Vec<_> = self.providers.read().await.values().cloned().collect();
        providers.sort_by(|a, b| a.name.cmp(&b.name));
        providers
    }

    pub async fn update_provider(&self, config: ProviderConfig) -> bool {
        let mut providers = self.providers.write().await;
        if providers.contains_key(&config.id) {
            let normalized = config.normalized();
            providers.insert(normalized.id.clone(), normalized);
            true
        } else {
            false
        }
    }

    pub async fn delete_provider(&self, id: &str) -> bool {
        self.providers.write().await.remove(id).is_some()
    }

    #[must_use]
    pub fn provider_templates(&self) -> Vec<ProviderTemplate> {
        builtin_provider_templates()
    }

    pub async fn probe_provider(
        &self,
        request: ProviderProbeRequest,
    ) -> Result<ProviderProbeResult, AgentError> {
        let provider = request.provider.clone().normalized();
        ProviderClient::new(provider).probe(&request).await
    }

    // ── Agent Profile Management ───────────────────────────────────────────

    pub async fn add_profile(&self, profile: AgentProfile) {
        self.profiles
            .write()
            .await
            .insert(profile.id.clone(), profile);
    }

    pub async fn get_profile(&self, id: &str) -> Option<AgentProfile> {
        self.profiles.read().await.get(id).cloned()
    }

    pub async fn list_profiles(&self) -> Vec<AgentProfile> {
        let mut profiles: Vec<_> = self.profiles.read().await.values().cloned().collect();
        profiles.sort_by(|a, b| a.name.cmp(&b.name));
        profiles
    }

    pub async fn update_profile(&self, profile: AgentProfile) -> bool {
        let mut profiles = self.profiles.write().await;
        if profiles.contains_key(&profile.id) {
            profiles.insert(profile.id.clone(), profile);
            true
        } else {
            false
        }
    }

    pub async fn delete_profile(&self, id: &str) -> bool {
        let mut profiles = self.profiles.write().await;
        if let Some(existing) = profiles.get(id)
            && existing.is_builtin
        {
            return false;
        }
        profiles.remove(id).is_some()
    }

    // ── Channel Management ─────────────────────────────────────────────────

    pub async fn add_channel(&self, config: ChannelConfig) {
        self.channels
            .write()
            .await
            .insert(config.id.clone(), config);
    }

    pub async fn get_channel(&self, id: &str) -> Option<ChannelConfig> {
        self.channels.read().await.get(id).cloned()
    }

    pub async fn list_channels(&self) -> Vec<ChannelConfig> {
        let mut channels: Vec<_> = self.channels.read().await.values().cloned().collect();
        channels.sort_by(|a, b| a.name.cmp(&b.name));
        channels
    }

    pub async fn update_channel(&self, config: ChannelConfig) -> bool {
        let mut channels = self.channels.write().await;
        if channels.contains_key(&config.id) {
            channels.insert(config.id.clone(), config);
            true
        } else {
            false
        }
    }

    pub async fn delete_channel(&self, id: &str) -> bool {
        self.channels.write().await.remove(id).is_some()
    }

    // ── Configuration ──────────────────────────────────────────────────────

    pub async fn get_config(&self) -> AgentConfig {
        self.config.read().await.clone()
    }

    pub async fn update_config(&self, new_config: AgentConfig) {
        *self.config.write().await = new_config;
    }

    // ── Request Preparation / Provider Resolution ──────────────────────────

    pub async fn prepare_chat_request(&self, req: &ChatRequest) -> Result<ChatRequest, AgentError> {
        if let Some(session_id) = req.session_id.as_deref()
            && let Some(session) = self.sessions.get(session_id).await
        {
            return Ok(ChatRequest {
                session_id: req.session_id.clone(),
                message: req.message.clone(),
                provider_id: req.provider_id.clone().or(session.provider_id),
                model: req.model.clone().or(session.model),
                system_prompt: req.system_prompt.clone().or(session.system_prompt),
                agent_profile_id: req.agent_profile_id.clone().or(session.agent_profile_id),
            });
        }

        let config = self.config.read().await.clone();
        let effective_profile_id = req
            .agent_profile_id
            .clone()
            .or(config.default_agent_profile_id.clone());

        let profile = if let Some(profile_id) = effective_profile_id.as_deref() {
            Some(
                self.get_profile(profile_id)
                    .await
                    .ok_or_else(|| AgentError::AgentProfileNotFound(profile_id.to_string()))?,
            )
        } else {
            None
        };

        Ok(ChatRequest {
            session_id: req.session_id.clone(),
            message: req.message.clone(),
            provider_id: req
                .provider_id
                .clone()
                .or_else(|| profile.as_ref().and_then(|p| p.default_provider_id.clone()))
                .or(config.default_provider_id),
            model: req
                .model
                .clone()
                .or_else(|| profile.as_ref().and_then(|p| p.default_model.clone()))
                .or(config.default_model),
            system_prompt: req
                .system_prompt
                .clone()
                .or_else(|| profile.as_ref().map(AgentProfile::effective_system_prompt))
                .or(Some(config.default_system_prompt)),
            agent_profile_id: effective_profile_id,
        })
    }

    /// Resolve the provider to use, given optional overrides in the request.
    pub(crate) async fn resolve_provider_for_request(
        &self,
        req: &ChatRequest,
    ) -> Result<ProviderClient, AgentError> {
        let prepared = self.prepare_chat_request(req).await?;
        let effective_id = prepared.provider_id.ok_or(AgentError::NoProvider)?;

        let providers = self.providers.read().await;
        let provider_config = providers
            .get(&effective_id)
            .ok_or_else(|| AgentError::ProviderNotFound(effective_id.clone()))?;

        if !provider_config.enabled {
            return Err(AgentError::Provider(format!(
                "Provider '{}' is disabled",
                provider_config.name
            )));
        }

        Ok(ProviderClient::new(provider_config.clone()))
    }

    /// Create an `AgentRunner` with the current configuration.
    pub(crate) async fn create_runner(&self) -> AgentRunner {
        let config = self.config.read().await.clone();
        AgentRunner::new(Arc::clone(&self.sessions), config)
    }
}

impl Default for AgentManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        AgentBehaviorConfig, AgentPresetKind, AgentToolConfig, ChannelConfig, ChannelKind,
        ProviderType, ProviderVendor,
    };

    fn test_provider() -> ProviderConfig {
        ProviderConfig {
            id: "p1".into(),
            name: "Test Provider".into(),
            provider_type: ProviderType::Native,
            vendor: ProviderVendor::OpenAi,
            api_key: "sk-test".into(),
            base_url: "https://api.openai.com/v1".into(),
            default_model: "gpt-4o".into(),
            enabled: true,
            capabilities: None,
        }
    }

    fn custom_profile() -> AgentProfile {
        AgentProfile {
            id: "custom-profile".into(),
            name: "Custom Profile".into(),
            description: "desc".into(),
            preset_kind: AgentPresetKind::Custom,
            is_builtin: false,
            system_prompt: "You are custom".into(),
            behavior: AgentBehaviorConfig::default(),
            tool_config: AgentToolConfig::default(),
            default_provider_id: Some("p1".into()),
            default_model: Some("gpt-4o-mini".into()),
            temperature: 0.2,
            max_tokens: 512,
            reasoning_mode: crate::types::ReasoningMode::Off,
        }
    }

    #[tokio::test]
    async fn test_add_and_list_providers() {
        let mgr = AgentManager::new();
        mgr.add_provider(test_provider()).await;

        let providers = mgr.list_providers().await;
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].name, "Test Provider");
    }

    #[tokio::test]
    async fn test_provider_templates() {
        let mgr = AgentManager::new();
        let templates = mgr.provider_templates();
        assert_eq!(templates.len(), 10);
    }

    #[tokio::test]
    async fn test_builtin_profiles_loaded() {
        let mgr = AgentManager::new();
        let profiles = mgr.list_profiles().await;
        assert!(profiles.len() >= 4);
        assert!(profiles.iter().any(|profile| profile.is_builtin));
    }

    #[tokio::test]
    async fn test_add_update_delete_custom_profile() {
        let mgr = AgentManager::new();
        mgr.add_profile(custom_profile()).await;
        let profile = mgr.get_profile("custom-profile").await;
        assert!(profile.is_some());

        let mut updated = custom_profile();
        updated.name = "Updated".into();
        assert!(mgr.update_profile(updated).await);
        assert_eq!(
            mgr.get_profile("custom-profile")
                .await
                .expect("profile exists")
                .name,
            "Updated"
        );

        assert!(mgr.delete_profile("custom-profile").await);
    }

    #[tokio::test]
    async fn test_delete_builtin_profile_is_blocked() {
        let mgr = AgentManager::new();
        assert!(!mgr.delete_profile("general-assistant").await);
    }

    #[tokio::test]
    async fn test_prepare_chat_request_uses_profile_defaults() {
        let mgr = AgentManager::new();
        mgr.add_provider(test_provider()).await;
        mgr.add_profile(custom_profile()).await;

        let prepared = mgr
            .prepare_chat_request(&ChatRequest {
                session_id: None,
                message: "hello".into(),
                provider_id: None,
                model: None,
                system_prompt: None,
                agent_profile_id: Some("custom-profile".into()),
            })
            .await
            .expect("request should prepare");

        assert_eq!(prepared.provider_id.as_deref(), Some("p1"));
        assert_eq!(prepared.model.as_deref(), Some("gpt-4o-mini"));
        assert_eq!(prepared.agent_profile_id.as_deref(), Some("custom-profile"));
        assert!(prepared.system_prompt.is_some());
    }

    #[tokio::test]
    async fn test_config_management() {
        let mgr = AgentManager::new();
        let cfg = mgr.get_config().await;
        assert_eq!(cfg.max_iterations, 10);

        let mut new_cfg = cfg;
        new_cfg.max_iterations = 20;
        mgr.update_config(new_cfg).await;

        assert_eq!(mgr.get_config().await.max_iterations, 20);
    }

    #[tokio::test]
    async fn test_resolve_provider_no_provider() {
        let mgr = AgentManager::new();
        let result = mgr
            .resolve_provider_for_request(&ChatRequest {
                session_id: None,
                message: "hello".into(),
                provider_id: None,
                model: None,
                system_prompt: None,
                agent_profile_id: None,
            })
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_resolve_provider_with_default() {
        let mgr = AgentManager::new();
        mgr.add_provider(test_provider()).await;

        let mut cfg = mgr.get_config().await;
        cfg.default_provider_id = Some("p1".into());
        mgr.update_config(cfg).await;

        let result = mgr
            .resolve_provider_for_request(&ChatRequest {
                session_id: None,
                message: "hello".into(),
                provider_id: None,
                model: None,
                system_prompt: None,
                agent_profile_id: None,
            })
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_resolve_provider_not_found() {
        let mgr = AgentManager::new();
        let result = mgr
            .resolve_provider_for_request(&ChatRequest {
                session_id: None,
                message: "hello".into(),
                provider_id: Some("nonexistent".into()),
                model: None,
                system_prompt: None,
                agent_profile_id: None,
            })
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_add_and_list_channel_configs() {
        let mgr = AgentManager::new();
        mgr.add_channel(ChannelConfig::new(
            "channel-tg".into(),
            "Telegram Bot".into(),
            ChannelKind::Telegram,
        ))
        .await;

        let channels = mgr.list_channels().await;
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].kind, ChannelKind::Telegram);
        assert!(channels[0].enabled);
    }
}
