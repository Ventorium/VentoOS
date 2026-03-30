use std::path::Path;
use std::sync::Arc;

use ventoos_agent::AgentManager;
use ventoos_connection::ConnectionManager;
use ventoos_db::DbManager;
use ventoos_k8s::K8sManager;
use ventoos_persist::Database;
use ventoos_redis::RedisManager;
use ventoos_task::TaskEngine;
use ventoos_vfs::VfsManager;

use crate::auth::AuthManager;
use crate::process_manager::ProcessManager;
use crate::ssh_manager::SshManager;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub db: Arc<Database>,
    pub connections: Arc<ConnectionManager>,
    pub tasks: Arc<TaskEngine>,
    pub auth: AuthManager,
    pub ssh: Arc<SshManager>,
    pub processes: Arc<ProcessManager>,
    pub db_manager: Arc<DbManager>,
    pub redis_manager: Arc<RedisManager>,
    pub k8s_manager: Arc<K8sManager>,
    pub vfs_manager: Arc<VfsManager>,
    pub agent_manager: Arc<AgentManager>,
}

impl AppState {
    pub fn new(db_path: &Path) -> Result<Self, anyhow::Error> {
        let db = Arc::new(Database::open(db_path)?);
        Ok(Self {
            auth: AuthManager::new(Arc::clone(&db)),
            db,
            connections: Arc::new(ConnectionManager::new()),
            tasks: Arc::new(TaskEngine::new()),
            ssh: Arc::new(SshManager::new()),
            processes: Arc::new(ProcessManager::new()),
            db_manager: Arc::new(DbManager::new()),
            redis_manager: Arc::new(RedisManager::new()),
            k8s_manager: Arc::new(K8sManager::new()),
            vfs_manager: Arc::new(VfsManager::new()),
            agent_manager: Arc::new(AgentManager::new()),
        })
    }

    /// Create state with in-memory database (for testing).
    #[allow(dead_code)]
    pub fn new_test() -> Result<Self, anyhow::Error> {
        let db = Arc::new(Database::open_in_memory()?);
        Ok(Self {
            auth: AuthManager::new(Arc::clone(&db)),
            db,
            connections: Arc::new(ConnectionManager::new()),
            tasks: Arc::new(TaskEngine::new()),
            ssh: Arc::new(SshManager::new()),
            processes: Arc::new(ProcessManager::new()),
            db_manager: Arc::new(DbManager::new()),
            redis_manager: Arc::new(RedisManager::new()),
            k8s_manager: Arc::new(K8sManager::new()),
            vfs_manager: Arc::new(VfsManager::new()),
            agent_manager: Arc::new(AgentManager::new()),
        })
    }
}
