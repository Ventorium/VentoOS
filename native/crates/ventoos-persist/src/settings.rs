use std::collections::HashMap;
use std::sync::Arc;

use crate::Database;

/// System-level settings manager.
///
/// Reads/writes to the `settings` table in the system `SQLite` database.
pub struct SettingsManager {
    db: Arc<Database>,
}

impl SettingsManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Get a single setting value by key.
    pub fn get(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
            let result = stmt.query_row([key], |row| row.get(0));
            match result {
                Ok(val) => Ok(Some(val)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(e),
            }
        })
    }

    /// Set a setting value by key (upsert).
    pub fn set(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        self.db.with_conn(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![key, value],
            )?;
            Ok(())
        })
    }

    /// Get multiple settings by keys.
    pub fn get_batch(&self, keys: &[&str]) -> Result<HashMap<String, String>, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let placeholders: Vec<String> = keys
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 1))
                .collect();
            let sql = format!(
                "SELECT key, value FROM settings WHERE key IN ({})",
                placeholders.join(", ")
            );
            let mut stmt = conn.prepare(&sql)?;
            let params: Vec<&dyn rusqlite::types::ToSql> = keys
                .iter()
                .map(|k| k as &dyn rusqlite::types::ToSql)
                .collect();
            let rows = stmt.query_map(params.as_slice(), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            let mut map = HashMap::new();
            for row in rows {
                let (k, v) = row?;
                map.insert(k, v);
            }
            Ok(map)
        })
    }

    /// Delete a setting by key.
    pub fn delete(&self, key: &str) -> Result<bool, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let rows = conn.execute("DELETE FROM settings WHERE key = ?1", [key])?;
            Ok(rows > 0)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_set() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let mgr = SettingsManager::new(db);

        assert_eq!(mgr.get("wallpaper").unwrap(), None);
        mgr.set("wallpaper", "/wallpapers/dark-mountain.jpg")
            .unwrap();
        assert_eq!(
            mgr.get("wallpaper").unwrap(),
            Some("/wallpapers/dark-mountain.jpg".to_string())
        );
    }

    #[test]
    fn test_get_batch() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let mgr = SettingsManager::new(db);

        mgr.set("wallpaper", "/w.jpg").unwrap();
        mgr.set("theme_mode", "dark").unwrap();
        mgr.set("dock_size", "48").unwrap();

        let batch = mgr
            .get_batch(&["wallpaper", "theme_mode", "nonexistent"])
            .unwrap();
        assert_eq!(batch.get("wallpaper"), Some(&"/w.jpg".to_string()));
        assert_eq!(batch.get("theme_mode"), Some(&"dark".to_string()));
        assert_eq!(batch.get("nonexistent"), None);
    }
}
