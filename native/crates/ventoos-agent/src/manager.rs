//! Top-level `AgentManager` — coordinates providers, tools, guards, sessions, and the agent runner.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing::info;

use crate::agent::AgentRunner;
use crate::guard::GuardChain;
use crate::provider::OpenAiProvider;
use crate::session::SessionStore;
use crate::tool::{StubToolExecutor, ToolExecutor, ToolRegistry};
use crate::types::{AgentConfig, AgentError, ProviderConfig};

/// Central coordinator for the AI agent subsystem.
pub struct AgentManager {
    pub(crate) sessions: Arc<SessionStore>,
    pub(crate) providers: Arc<RwLock<HashMap<String, ProviderConfig>>>,
    pub(crate) tool_registry: Arc<RwLock<ToolRegistry>>,
    pub(crate) guards: Arc<GuardChain>,
    pub(crate) config: Arc<RwLock<AgentConfig>>,
    pub(crate) executor: Arc<dyn ToolExecutor>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(SessionStore::new()),
            providers: Arc::new(RwLock::new(HashMap::new())),
            tool_registry: Arc::new(RwLock::new(ToolRegistry::with_builtins())),
            guards: Arc::new(GuardChain::with_defaults()),
            config: Arc::new(RwLock::new(AgentConfig::default())),
            executor: Arc::new(StubToolExecutor),
        }
    }

    /// Create a manager with a custom tool executor.
    pub fn with_executor(executor: Arc<dyn ToolExecutor>) -> Self {
        Self {
            sessions: Arc::new(SessionStore::new()),
            providers: Arc::new(RwLock::new(HashMap::new())),
            tool_registry: Arc::new(RwLock::new(ToolRegistry::with_builtins())),
            guards: Arc::new(GuardChain::with_defaults()),
            config: Arc::new(RwLock::new(AgentConfig::default())),
            executor,
        }
    }

    // ── Provider Management ────────────────────────────────────────────────

    pub async fn add_provider(&self, config: ProviderConfig) {
        info!("Adding provider: {} ({})", config.name, config.id);
        self.providers
            .write()
            .await
            .insert(config.id.clone(), config);
    }

    pub async fn get_provider(&self, id: &str) -> Option<ProviderConfig> {
        self.providers.read().await.get(id).cloned()
    }

    pub async fn list_providers(&self) -> Vec<ProviderConfig> {
        self.providers.read().await.values().cloned().collect()
    }

    pub async fn update_provider(&self, config: ProviderConfig) -> bool {
        let mut providers = self.providers.write().await;
        if providers.contains_key(&config.id) {
            providers.insert(config.id.clone(), config);
            true
        } else {
            false
        }
    }

    pub async fn delete_provider(&self, id: &str) -> bool {
        self.providers.write().await.remove(id).is_some()
    }

    // ── Configuration ──────────────────────────────────────────────────────

    pub async fn get_config(&self) -> AgentConfig {
        self.config.read().await.clone()
    }

    pub async fn update_config(&self, new_config: AgentConfig) {
        *self.config.write().await = new_config;
    }

    // ── Provider Resolution ────────────────────────────────────────────────

    /// Resolve the provider to use, given optional overrides in the request.
    pub(crate) async fn resolve_provider(
        &self,
        provider_id: Option<&str>,
    ) -> Result<OpenAiProvider, AgentError> {
        let config = self.config.read().await;
        let effective_id = provider_id
            .or(config.default_provider_id.as_deref())
            .ok_or(AgentError::NoProvider)?;

        let providers = self.providers.read().await;
        let provider_config = providers
            .get(effective_id)
            .ok_or_else(|| AgentError::ProviderNotFound(effective_id.to_string()))?;

        if !provider_config.enabled {
            return Err(AgentError::Provider(format!(
                "Provider '{}' is disabled",
                provider_config.name
            )));
        }

        Ok(OpenAiProvider::new(provider_config.clone()))
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
    use crate::types::ProviderType;

    fn test_provider() -> ProviderConfig {
        ProviderConfig {
            id: "p1".into(),
            name: "Test Provider".into(),
            provider_type: ProviderType::OpenAi,
            api_key: "sk-test".into(),
            base_url: "https://api.openai.com/v1".into(),
            default_model: "gpt-4o".into(),
            enabled: true,
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
    async fn test_get_provider() {
        let mgr = AgentManager::new();
        mgr.add_provider(test_provider()).await;

        assert!(mgr.get_provider("p1").await.is_some());
        assert!(mgr.get_provider("nonexistent").await.is_none());
    }

    #[tokio::test]
    async fn test_update_provider() {
        let mgr = AgentManager::new();
        mgr.add_provider(test_provider()).await;

        let mut updated = test_provider();
        updated.name = "Updated Provider".into();
        assert!(mgr.update_provider(updated).await);

        let p = mgr.get_provider("p1").await.unwrap();
        assert_eq!(p.name, "Updated Provider");
    }

    #[tokio::test]
    async fn test_delete_provider() {
        let mgr = AgentManager::new();
        mgr.add_provider(test_provider()).await;

        assert!(mgr.delete_provider("p1").await);
        assert!(!mgr.delete_provider("p1").await);
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
        let result = mgr.resolve_provider(None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_resolve_provider_with_default() {
        let mgr = AgentManager::new();
        mgr.add_provider(test_provider()).await;

        let mut cfg = mgr.get_config().await;
        cfg.default_provider_id = Some("p1".into());
        mgr.update_config(cfg).await;

        let result = mgr.resolve_provider(None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_resolve_provider_with_explicit_id() {
        let mgr = AgentManager::new();
        mgr.add_provider(test_provider()).await;

        let result = mgr.resolve_provider(Some("p1")).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_resolve_provider_not_found() {
        let mgr = AgentManager::new();
        let result = mgr.resolve_provider(Some("nonexistent")).await;
        assert!(result.is_err());
    }
}
