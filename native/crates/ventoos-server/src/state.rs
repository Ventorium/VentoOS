use std::path::Path;
use std::sync::Arc;

use ventoos_connection::ConnectionManager;
use ventoos_persist::Database;
use ventoos_task::TaskEngine;

use crate::auth::AuthManager;
use crate::ssh_manager::SshManager;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub connections: Arc<ConnectionManager>,
    pub tasks: Arc<TaskEngine>,
    pub auth: AuthManager,
    pub ssh: Arc<SshManager>,
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
        })
    }

    /// Create state with in-memory database (for testing).
    pub fn new_test() -> Result<Self, anyhow::Error> {
        let db = Arc::new(Database::open_in_memory()?);
        Ok(Self {
            auth: AuthManager::new(Arc::clone(&db)),
            db,
            connections: Arc::new(ConnectionManager::new()),
            tasks: Arc::new(TaskEngine::new()),
            ssh: Arc::new(SshManager::new()),
        })
    }
}
