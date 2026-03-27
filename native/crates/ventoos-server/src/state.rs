use std::path::Path;
use std::sync::Arc;

use ventoos_connection::ConnectionManager;
use ventoos_persist::Database;
use ventoos_task::TaskEngine;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub connections: Arc<ConnectionManager>,
    pub tasks: Arc<TaskEngine>,
}

impl AppState {
    pub fn new(db_path: &Path) -> Result<Self, anyhow::Error> {
        let db = Database::open(db_path)?;
        Ok(Self {
            db: Arc::new(db),
            connections: Arc::new(ConnectionManager::new()),
            tasks: Arc::new(TaskEngine::new()),
        })
    }

    /// Create state with in-memory database (for testing).
    pub fn new_test() -> Result<Self, anyhow::Error> {
        let db = Database::open_in_memory()?;
        Ok(Self {
            db: Arc::new(db),
            connections: Arc::new(ConnectionManager::new()),
            tasks: Arc::new(TaskEngine::new()),
        })
    }
}
