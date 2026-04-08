use std::sync::Arc;

use ventoos_core::window::{WindowState, WindowStatus};

use crate::Database;

/// Manager for persisting window states in the system SQLite database.
pub struct WindowStateManager {
    db: Arc<Database>,
}

impl WindowStateManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Load all persisted window states.
    pub fn load_all(&self) -> Result<Vec<WindowState>, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, app_id, title, x, y, width, height, z_index, status, is_maximized, tab_states, app_state
                 FROM window_states ORDER BY z_index",
            )?;
            let rows = stmt.query_map([], |row| {
                let id_str: String = row.get(0)?;
                let status_str: String = row.get(8)?;
                let status = parse_window_status(&status_str);
                let tab_states: Option<String> = row.get(10)?;
                let app_state: Option<String> = row.get(11)?;
                Ok(WindowState {
                    id: uuid::Uuid::parse_str(&id_str)
                        .map(|id| id.to_string())
                        .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string()),
                    app_id: row.get(1)?,
                    title: row.get(2)?,
                    x: row.get(3)?,
                    y: row.get(4)?,
                    width: row.get(5)?,
                    height: row.get(6)?,
                    z_index: row.get(7)?,
                    status,
                    is_maximized: row.get::<_, i64>(9)? != 0,
                    tab_states: tab_states.and_then(|s| serde_json::from_str(&s).ok()),
                    app_state: app_state.and_then(|s| serde_json::from_str(&s).ok()),
                })
            })?;
            rows.collect()
        })
    }

    /// Save all window states (replaces existing data).
    pub fn save_all(&self, states: &[WindowState]) -> Result<(), rusqlite::Error> {
        self.db.with_conn(|conn| {
            conn.execute("DELETE FROM window_states", [])?;
            let mut stmt = conn.prepare(
                "INSERT INTO window_states (id, app_id, title, x, y, width, height, z_index, status, is_maximized, tab_states, app_state)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )?;
            for state in states {
                let tab_states_json = state.tab_states.as_ref().map(|v| v.to_string());
                let app_state_json = state.app_state.as_ref().map(|v| v.to_string());
                stmt.execute(rusqlite::params![
                    state.id.to_string(),
                    state.app_id,
                    state.title,
                    state.x,
                    state.y,
                    state.width,
                    state.height,
                    state.z_index,
                    format_window_status(&state.status),
                    i64::from(state.is_maximized),
                    tab_states_json,
                    app_state_json,
                ])?;
            }
            Ok(())
        })
    }

    /// Clear all persisted window states.
    pub fn clear_all(&self) -> Result<(), rusqlite::Error> {
        self.db.with_conn(|conn| {
            conn.execute("DELETE FROM window_states", [])?;
            Ok(())
        })
    }
}

fn parse_window_status(s: &str) -> WindowStatus {
    match s {
        "created" => WindowStatus::Created,
        "opening" => WindowStatus::Opening,
        "active" => WindowStatus::Active,
        "blurred" => WindowStatus::Blurred,
        "minimized" => WindowStatus::Minimized,
        "restored" => WindowStatus::Restored,
        "closing" => WindowStatus::Closing,
        "closed" => WindowStatus::Closed,
        _ => WindowStatus::Active,
    }
}

fn format_window_status(s: &WindowStatus) -> &'static str {
    match s {
        WindowStatus::Created => "created",
        WindowStatus::Opening => "opening",
        WindowStatus::Active => "active",
        WindowStatus::Blurred => "blurred",
        WindowStatus::Minimized => "minimized",
        WindowStatus::Restored => "restored",
        WindowStatus::Closing => "closing",
        WindowStatus::Closed => "closed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ventoos_core::types::new_id;

    fn make_state(app_id: &str, z: u32) -> WindowState {
        WindowState {
            id: new_id().to_string(),
            app_id: app_id.to_string(),
            title: format!("{app_id} window"),
            x: 100.0,
            y: 50.0,
            width: 800.0,
            height: 600.0,
            z_index: z,
            status: WindowStatus::Active,
            is_maximized: false,
            tab_states: None,
            app_state: None,
        }
    }

    #[test]
    fn test_save_and_load() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let mgr = WindowStateManager::new(db);

        let states = vec![make_state("explorer", 1), make_state("kubernetes", 2)];
        mgr.save_all(&states).unwrap();

        let loaded = mgr.load_all().unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].app_id, "explorer");
        assert_eq!(loaded[1].app_id, "kubernetes");
        assert_eq!(loaded[0].id, states[0].id);
        assert_eq!(loaded[1].id, states[1].id);
    }

    #[test]
    fn test_save_replaces() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let mgr = WindowStateManager::new(db);

        mgr.save_all(&[make_state("a", 1), make_state("b", 2)])
            .unwrap();
        assert_eq!(mgr.load_all().unwrap().len(), 2);

        mgr.save_all(&[make_state("c", 1)]).unwrap();
        let loaded = mgr.load_all().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].app_id, "c");
    }

    #[test]
    fn test_clear() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let mgr = WindowStateManager::new(db);

        mgr.save_all(&[make_state("x", 1)]).unwrap();
        assert_eq!(mgr.load_all().unwrap().len(), 1);

        mgr.clear_all().unwrap();
        assert!(mgr.load_all().unwrap().is_empty());
    }
}
