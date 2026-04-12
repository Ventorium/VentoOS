use std::sync::Arc;

use ventoos_core::notification::{Notification, NotificationLevel, NotificationSource};
use ventoos_core::types::{Id, new_id};

use crate::Database;

/// Maximum notifications to keep in the database.
const MAX_NOTIFICATIONS: usize = 100;

/// Notification persistence manager.
pub struct NotificationStore {
    db: Arc<Database>,
}

impl NotificationStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// List all notifications, newest first.
    pub fn list(&self) -> Result<Vec<Notification>, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, message, level, source, read, action_url, task_id, created_at \
                 FROM notifications ORDER BY created_at DESC LIMIT ?1",
            )?;
            let rows = stmt.query_map([MAX_NOTIFICATIONS as i64], |row| {
                Ok(Notification {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    message: row.get(2)?,
                    level: parse_level(&row.get::<_, String>(3)?),
                    source: parse_source(&row.get::<_, String>(4)?),
                    read: row.get::<_, i32>(5)? != 0,
                    action_url: row.get(6)?,
                    task_id: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })?;
            rows.collect()
        })
    }

    /// Get a single notification by ID.
    pub fn get(&self, id: &Id) -> Result<Option<Notification>, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, message, level, source, read, action_url, task_id, created_at \
                 FROM notifications WHERE id = ?1",
            )?;
            let result = stmt.query_row([id], |row| {
                Ok(Notification {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    message: row.get(2)?,
                    level: parse_level(&row.get::<_, String>(3)?),
                    source: parse_source(&row.get::<_, String>(4)?),
                    read: row.get::<_, i32>(5)? != 0,
                    action_url: row.get(6)?,
                    task_id: row.get(7)?,
                    created_at: row.get(8)?,
                })
            });
            match result {
                Ok(n) => Ok(Some(n)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(e),
            }
        })
    }

    /// Create a new notification. Returns the created notification's ID.
    /// If `dedup_key` is provided, replaces any existing notification with the same key.
    pub fn create(
        &self,
        title: &str,
        message: &str,
        level: NotificationLevel,
        source: NotificationSource,
        dedup_key: Option<&str>,
    ) -> Result<Id, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let id = new_id();

            // Handle dedup: if dedup_key provided, delete existing
            if let Some(key) = dedup_key {
                conn.execute(
                    "DELETE FROM notifications WHERE action_url = ?1",
                    rusqlite::params![format!("dedup:{}", key)],
                )?;
            }

            conn.execute(
                "INSERT INTO notifications (id, title, message, level, source, read, action_url, task_id, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, NULL, datetime('now'))",
                rusqlite::params![
                    id,
                    title,
                    message,
                    level_to_str(&level),
                    source_to_str(&source),
                    dedup_key.map(|k| format!("dedup:{}", k)),
                ],
            )?;

            // Enforce cap: delete oldest notifications exceeding MAX_NOTIFICATIONS
            conn.execute(
                "DELETE FROM notifications WHERE id NOT IN (\
                    SELECT id FROM notifications ORDER BY created_at DESC LIMIT ?1\
                )",
                [MAX_NOTIFICATIONS as i64],
            )?;

            Ok(id)
        })
    }

    /// Mark a single notification as read.
    pub fn mark_read(&self, id: &Id) -> Result<bool, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let rows = conn.execute(
                "UPDATE notifications SET read = 1 WHERE id = ?1",
                [id],
            )?;
            Ok(rows > 0)
        })
    }

    /// Mark all notifications as read.
    pub fn mark_all_read(&self) -> Result<usize, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let rows = conn.execute("UPDATE notifications SET read = 1 WHERE read = 0", [])?;
            Ok(rows)
        })
    }

    /// Delete a single notification.
    pub fn delete(&self, id: &Id) -> Result<bool, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let rows = conn.execute("DELETE FROM notifications WHERE id = ?1", [id])?;
            Ok(rows > 0)
        })
    }

    /// Delete all notifications.
    pub fn clear_all(&self) -> Result<usize, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let rows = conn.execute("DELETE FROM notifications", [])?;
            Ok(rows)
        })
    }

    /// Count unread notifications.
    pub fn unread_count(&self) -> Result<usize, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM notifications WHERE read = 0",
                [],
                |row| row.get(0),
            )?;
            Ok(count as usize)
        })
    }
}

fn level_to_str(level: &NotificationLevel) -> &'static str {
    match level {
        NotificationLevel::Info => "info",
        NotificationLevel::Success => "success",
        NotificationLevel::Warning => "warning",
        NotificationLevel::Error => "error",
    }
}

fn parse_level(s: &str) -> NotificationLevel {
    match s {
        "success" => NotificationLevel::Success,
        "warning" => NotificationLevel::Warning,
        "error" => NotificationLevel::Error,
        _ => NotificationLevel::Info,
    }
}

fn source_to_str(source: &NotificationSource) -> &'static str {
    match source {
        NotificationSource::System => "system",
        NotificationSource::Connection => "connection",
        NotificationSource::Task => "task",
        NotificationSource::Agent => "agent",
        NotificationSource::App => "app",
    }
}

fn parse_source(s: &str) -> NotificationSource {
    match s {
        "connection" => NotificationSource::Connection,
        "task" => NotificationSource::Task,
        "agent" => NotificationSource::Agent,
        "app" => NotificationSource::App,
        _ => NotificationSource::System,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store() -> NotificationStore {
        let db = Arc::new(Database::open_in_memory().unwrap());
        NotificationStore::new(db)
    }

    #[test]
    fn test_create_and_list() {
        let store = make_store();
        let id = store
            .create("Test", "Hello", NotificationLevel::Info, NotificationSource::System, None)
            .unwrap();

        let list = store.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, id);
        assert_eq!(list[0].title, "Test");
        assert!(!list[0].read);
    }

    #[test]
    fn test_mark_read() {
        let store = make_store();
        let id = store
            .create("Test", "Msg", NotificationLevel::Info, NotificationSource::System, None)
            .unwrap();

        assert!(store.mark_read(&id).unwrap());
        let n = store.get(&id).unwrap().unwrap();
        assert!(n.read);
    }

    #[test]
    fn test_mark_all_read() {
        let store = make_store();
        store.create("A", "a", NotificationLevel::Info, NotificationSource::System, None).unwrap();
        store.create("B", "b", NotificationLevel::Warning, NotificationSource::Task, None).unwrap();

        assert_eq!(store.mark_all_read().unwrap(), 2);
        let list = store.list().unwrap();
        assert!(list.iter().all(|n| n.read));
    }

    #[test]
    fn test_delete() {
        let store = make_store();
        let id = store
            .create("Test", "Msg", NotificationLevel::Info, NotificationSource::System, None)
            .unwrap();
        assert!(store.delete(&id).unwrap());
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn test_clear_all() {
        let store = make_store();
        store.create("A", "a", NotificationLevel::Info, NotificationSource::System, None).unwrap();
        store.create("B", "b", NotificationLevel::Error, NotificationSource::Agent, None).unwrap();
        assert_eq!(store.clear_all().unwrap(), 2);
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn test_unread_count() {
        let store = make_store();
        let id = store
            .create("A", "a", NotificationLevel::Info, NotificationSource::System, None)
            .unwrap();
        store.create("B", "b", NotificationLevel::Warning, NotificationSource::Task, None).unwrap();
        assert_eq!(store.unread_count().unwrap(), 2);
        store.mark_read(&id).unwrap();
        assert_eq!(store.unread_count().unwrap(), 1);
    }

    #[test]
    fn test_dedup_replaces() {
        let store = make_store();
        store.create("Old", "old msg", NotificationLevel::Info, NotificationSource::System, Some("key1")).unwrap();
        store.create("New", "new msg", NotificationLevel::Warning, NotificationSource::System, Some("key1")).unwrap();
        let list = store.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "New");
    }

    #[test]
    fn test_max_cap() {
        let store = make_store();
        for i in 0..110 {
            store.create(
                &format!("Notif {}", i),
                "msg",
                NotificationLevel::Info,
                NotificationSource::System,
                None,
            ).unwrap();
        }
        let list = store.list().unwrap();
        assert_eq!(list.len(), 100);
        // Newest first — should start from index 109
        assert_eq!(list[0].title, "Notif 109");
    }
}
