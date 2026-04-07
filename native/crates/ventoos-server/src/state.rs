use std::path::Path;
use std::sync::Arc;

use ventoos_agent::{AgentManager, AgentPlugin};
use ventoos_core::plugin::AppPlugin;
use ventoos_db::{DbManager, DbPlugin};
use ventoos_k8s::{K8sManager, K8sPlugin};
use ventoos_persist::{Database, SettingsManager, StorageManager, WindowStateManager};
use ventoos_redis::{RedisManager, RedisPlugin};
use ventoos_ssh::{SshManager, SshPlugin};
use ventoos_task::TaskEngine;
use ventoos_vfs::{VfsManager, VfsPlugin};

use crate::auth::AuthManager;
use crate::process_manager::ProcessManager;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub db: Arc<Database>,
    pub tasks: Arc<TaskEngine>,
    pub auth: AuthManager,
    pub ssh: Arc<SshManager>,
    pub processes: Arc<ProcessManager>,
    pub settings_mgr: Arc<SettingsManager>,
    pub window_states: Arc<WindowStateManager>,
    pub storage: Arc<StorageManager>,
    /// Application plugins (K8s, DB, Redis, VFS, Agent, SSH).
    pub plugins: Arc<Vec<Box<dyn AppPlugin>>>,
}

impl AppState {
    pub async fn new(db_path: &Path, data_dir: &Path) -> Result<Self, anyhow::Error> {
        let db = Arc::new(Database::open(db_path)?);

        let ssh = Arc::new(SshManager::new());
        let db_manager = Arc::new(DbManager::new());
        let redis_manager = Arc::new(RedisManager::new());
        let k8s_manager = Arc::new(K8sManager::new());
        let vfs_manager = Arc::new(
            VfsManager::with_db_and_ssh_provider(Arc::clone(&db), Arc::clone(&ssh) as _).await,
        );
        let agent_manager = Arc::new(AgentManager::new());

        let plugins: Vec<Box<dyn AppPlugin>> = vec![
            Box::new(K8sPlugin::new(k8s_manager)),
            Box::new(DbPlugin::new(db_manager)),
            Box::new(RedisPlugin::new(redis_manager)),
            Box::new(VfsPlugin::new(vfs_manager)),
            Box::new(AgentPlugin::new(agent_manager)),
            Box::new(SshPlugin::new(Arc::clone(&ssh))),
        ];

        Ok(Self {
            settings_mgr: Arc::new(SettingsManager::new(Arc::clone(&db))),
            window_states: Arc::new(WindowStateManager::new(Arc::clone(&db))),
            storage: Arc::new(StorageManager::new(data_dir)),
            auth: AuthManager::new(Arc::clone(&db)),
            db,
            tasks: Arc::new(TaskEngine::new()),
            ssh,
            processes: Arc::new(ProcessManager::new()),
            plugins: Arc::new(plugins),
        })
    }

    /// Create state with in-memory database (for testing).
    #[allow(dead_code)]
    pub fn new_test() -> Result<Self, anyhow::Error> {
        let db = Arc::new(Database::open_in_memory()?);

        let ssh = Arc::new(SshManager::new());
        let db_manager = Arc::new(DbManager::new());
        let redis_manager = Arc::new(RedisManager::new());
        let k8s_manager = Arc::new(K8sManager::new());
        let vfs_manager = Arc::new(VfsManager::with_ssh_provider(Arc::clone(&ssh) as _));
        let agent_manager = Arc::new(AgentManager::new());

        let plugins: Vec<Box<dyn AppPlugin>> = vec![
            Box::new(K8sPlugin::new(k8s_manager)),
            Box::new(DbPlugin::new(db_manager)),
            Box::new(RedisPlugin::new(redis_manager)),
            Box::new(VfsPlugin::new(vfs_manager)),
            Box::new(AgentPlugin::new(agent_manager)),
            Box::new(SshPlugin::new(Arc::clone(&ssh))),
        ];

        let tmp_dir = std::env::temp_dir().join("ventoos-test");

        Ok(Self {
            settings_mgr: Arc::new(SettingsManager::new(Arc::clone(&db))),
            window_states: Arc::new(WindowStateManager::new(Arc::clone(&db))),
            storage: Arc::new(StorageManager::new(&tmp_dir)),
            auth: AuthManager::new(Arc::clone(&db)),
            db,
            tasks: Arc::new(TaskEngine::new()),
            ssh,
            processes: Arc::new(ProcessManager::new()),
            plugins: Arc::new(plugins),
        })
    }
}
