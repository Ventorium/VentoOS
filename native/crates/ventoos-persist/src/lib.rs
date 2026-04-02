mod migrations;
pub mod settings;
pub mod storage;
pub mod window_state;

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use tracing::info;

pub use settings::SettingsManager;
pub use storage::StorageManager;
pub use window_state::WindowStateManager;

/// The database manager handles `SQLite` persistence.
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Open or create a database at the given path.
    pub fn open(path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;
        info!("Database opened at {}", path.display());
        Ok(db)
    }

    /// Open an in-memory database (for testing).
    pub fn open_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;
        Ok(db)
    }

    /// Execute a closure with a database connection reference.
    pub fn with_conn<F, T>(&self, f: F) -> Result<T, rusqlite::Error>
    where
        F: FnOnce(&Connection) -> Result<T, rusqlite::Error>,
    {
        let conn = self.conn.lock().expect("Database mutex poisoned");
        f(&conn)
    }

    fn run_migrations(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("Database mutex poisoned");
        migrations::run(&conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_in_memory() {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
            let tables: Vec<String> = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            assert!(tables.contains(&"connections".to_string()));
            assert!(tables.contains(&"tasks".to_string()));
            assert!(tables.contains(&"notifications".to_string()));
            assert!(tables.contains(&"window_states".to_string()));
            Ok(())
        })
        .unwrap();
    }
}
