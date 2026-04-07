use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

use rusqlite::Connection;
use tracing::info;

/// Per-app key-value storage manager.
///
/// Each application gets its own SQLite database under `$DATA_DIR/apps/{app_id}/store.db`.
pub struct StorageManager {
    data_dir: PathBuf,
    dbs: RwLock<HashMap<String, Arc<Mutex<Connection>>>>,
}

impl StorageManager {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.to_path_buf(),
            dbs: RwLock::new(HashMap::new()),
        }
    }

    /// Get or create the per-app SQLite database connection.
    fn get_db(&self, app_id: &str) -> Result<Arc<Mutex<Connection>>, rusqlite::Error> {
        // Fast path: check if already opened
        {
            let dbs = self.dbs.read().expect("StorageManager RwLock poisoned");
            if let Some(db) = dbs.get(app_id) {
                return Ok(Arc::clone(db));
            }
        }

        // Slow path: create directory and open database
        let app_dir = self.data_dir.join("apps").join(app_id);
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let db_path = app_dir.join("store.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )?;

        info!("Opened app storage for '{app_id}' at {}", db_path.display());

        let db = Arc::new(Mutex::new(conn));
        let mut dbs = self.dbs.write().expect("StorageManager RwLock poisoned");
        dbs.insert(app_id.to_string(), Arc::clone(&db));
        Ok(db)
    }

    /// Get a value by key for a specific app.
    pub fn get_value(&self, app_id: &str, key: &str) -> Result<Option<String>, rusqlite::Error> {
        let db = self.get_db(app_id)?;
        let conn = db.lock().expect("App DB mutex poisoned");
        let mut stmt = conn.prepare("SELECT value FROM kv_store WHERE key = ?1")?;
        let result = stmt.query_row([key], |row| row.get(0));
        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Set a value by key for a specific app.
    pub fn set_value(&self, app_id: &str, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        let db = self.get_db(app_id)?;
        let conn = db.lock().expect("App DB mutex poisoned");
        conn.execute(
            "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }

    /// Delete a value by key. Returns true if a row was deleted.
    pub fn delete_value(&self, app_id: &str, key: &str) -> Result<bool, rusqlite::Error> {
        let db = self.get_db(app_id)?;
        let conn = db.lock().expect("App DB mutex poisoned");
        let rows = conn.execute("DELETE FROM kv_store WHERE key = ?1", [key])?;
        Ok(rows > 0)
    }

    /// List all keys for a specific app.
    pub fn list_keys(&self, app_id: &str) -> Result<Vec<String>, rusqlite::Error> {
        let db = self.get_db(app_id)?;
        let conn = db.lock().expect("App DB mutex poisoned");
        let mut stmt = conn.prepare("SELECT key FROM kv_store ORDER BY key")?;
        let keys = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(keys)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_manager() -> (StorageManager, TempDir) {
        let dir = TempDir::new().unwrap();
        let mgr = StorageManager::new(dir.path());
        (mgr, dir)
    }

    #[test]
    fn test_set_get_delete() {
        let (mgr, _dir) = test_manager();
        assert_eq!(mgr.get_value("explorer", "foo").unwrap(), None);

        mgr.set_value("explorer", "foo", "bar").unwrap();
        assert_eq!(
            mgr.get_value("explorer", "foo").unwrap(),
            Some("bar".to_string())
        );

        assert!(mgr.delete_value("explorer", "foo").unwrap());
        assert_eq!(mgr.get_value("explorer", "foo").unwrap(), None);
        assert!(!mgr.delete_value("explorer", "foo").unwrap());
    }

    #[test]
    fn test_list_keys() {
        let (mgr, _dir) = test_manager();
        mgr.set_value("myapp", "b", "2").unwrap();
        mgr.set_value("myapp", "a", "1").unwrap();
        mgr.set_value("myapp", "c", "3").unwrap();

        let keys = mgr.list_keys("myapp").unwrap();
        assert_eq!(keys, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_isolation_between_apps() {
        let (mgr, _dir) = test_manager();
        mgr.set_value("app1", "key", "val1").unwrap();
        mgr.set_value("app2", "key", "val2").unwrap();

        assert_eq!(
            mgr.get_value("app1", "key").unwrap(),
            Some("val1".to_string())
        );
        assert_eq!(
            mgr.get_value("app2", "key").unwrap(),
            Some("val2".to_string())
        );
    }
}
