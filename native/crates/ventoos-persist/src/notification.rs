use std::sync::Arc;

use chrono::{DateTime, NaiveDateTime, Utc};
use ventoos_core::notification::{Notification, NotificationLevel, NotificationSource};
use ventoos_core::types::Id;
use uuid::Uuid;

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
            let rows = stmt.query_map([i64::try_from(MAX_NOTIFICATIONS).unwrap_or(i64::MAX)], |row| {
                Ok(row_to_notification(row))
            })?;
            rows.collect()
        })
    }

    /// Get a single notification by ID.
    pub fn get(&self, id: &Id) -> Result<Option<Notification>, rusqlite::Error> {
        let id_str = id.to_string();
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, message, level, source, read, action_url, task_id, created_at \
                 FROM notifications WHERE id = ?1",
            )?;
            let result = stmt.query_row([id_str], |row| Ok(row_to_notification(row)));
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
        level: &NotificationLevel,
        source: &NotificationSource,
        dedup_key: Option<&str>,
    ) -> Result<Id, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let id = Uuid::new_v4();

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
                    id.to_string(),
                    title,
                    message,
                    level_to_str(level),
                    source_to_str(source),
                    dedup_key.map(|k| format!("dedup:{k}")),
                ],
            )?;

            // Enforce cap: delete oldest notifications exceeding MAX_NOTIFICATIONS
            conn.execute(
                "DELETE FROM notifications WHERE id NOT IN (\
                    SELECT id FROM notifications ORDER BY created_at DESC LIMIT ?1\
                )",
                [i64::try_from(MAX_NOTIFICATIONS).unwrap_or(i64::MAX)],
            )?;

            Ok(id)
        })
    }

    /// Mark a single notification as read.
    pub fn mark_read(&self, id: &Id) -> Result<bool, rusqlite::Error> {
        let id_str = id.to_string();
        self.db.with_conn(|conn| {
            let rows = conn.execute(
                "UPDATE notifications SET read = 1 WHERE id = ?1",
                [id_str],
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
        let id_str = id.to_string();
        self.db.with_conn(|conn| {
            let rows = conn.execute("DELETE FROM notifications WHERE id = ?1", [id_str])?;
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
    #[allow(dead_code)]
    pub fn unread_count(&self) -> Result<usize, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM notifications WHERE read = 0",
                [],
                |row| row.get(0),
            )?;
            Ok(usize::try_from(count).unwrap_or(0))
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

/// Parse a row into a Notification.
fn row_to_notification(row: &rusqlite::Row) -> Notification {
    let id_str: String = row.get(0).unwrap_or_default();
    let id: Id = id_str.parse().unwrap_or_else(|_| Uuid::nil());
    let created_at_str: String = row.get(8).unwrap_or_default();
    let created_at = NaiveDateTime::parse_from_str(&created_at_str, "%Y-%m-%d %H:%M:%S").map_or_else(|_| Utc::now(), |dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc));

    Notification {
        id,
        title: row.get(1).unwrap_or_default(),
        message: row.get(2).unwrap_or_default(),
        level: parse_level(&row.get::<_, String>(3).unwrap_or_default()),
        source: parse_source(&row.get::<_, String>(4).unwrap_or_default()),
        read: row.get::<_, i32>(5).unwrap_or(0) != 0,
        action_url: row.get(6).unwrap_or(None),
        task_id: row.get::<_, Option<String>>(7).unwrap_or(None).and_then(|s| s.parse().ok()),
        created_at,
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
            .create("Test", "Hello", &NotificationLevel::Info, &NotificationSource::System, None)
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
            .create("Test", "Msg", &NotificationLevel::Info, &NotificationSource::System, None)
            .unwrap();

        assert!(store.mark_read(&id).unwrap());
        let n = store.get(&id).unwrap().unwrap();
        assert!(n.read);
    }

    #[test]
    fn test_mark_all_read() {
        let store = make_store();
        store.create("A", "a", &NotificationLevel::Info, &NotificationSource::System, None).unwrap();
        store.create("B", "b", &NotificationLevel::Warning, &NotificationSource::Task, None).unwrap();

        assert_eq!(store.mark_all_read().unwrap(), 2);
        let list = store.list().unwrap();
        assert!(list.iter().all(|n| n.read));
    }

    #[test]
    fn test_delete() {
        let store = make_store();
        let id = store
            .create("Test", "Msg", &NotificationLevel::Info, &NotificationSource::System, None)
            .unwrap();
        assert!(store.delete(&id).unwrap());
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn test_clear_all() {
        let store = make_store();
        store.create("A", "a", &NotificationLevel::Info, &NotificationSource::System, None).unwrap();
        store.create("B", "b", &NotificationLevel::Error, &NotificationSource::Agent, None).unwrap();
        assert_eq!(store.clear_all().unwrap(), 2);
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn test_unread_count() {
        let store = make_store();
        let id = store
            .create("A", "a", &NotificationLevel::Info, &NotificationSource::System, None)
            .unwrap();
        store.create("B", "b", &NotificationLevel::Warning, &NotificationSource::Task, None).unwrap();
        assert_eq!(store.unread_count().unwrap(), 2);
        store.mark_read(&id).unwrap();
        assert_eq!(store.unread_count().unwrap(), 1);
    }

    #[test]
    fn test_dedup_replaces() {
        let store = make_store();
        store.create("Old", "old msg", &NotificationLevel::Info, &NotificationSource::System, Some("key1")).unwrap();
        store.create("New", "new msg", &NotificationLevel::Warning, &NotificationSource::System, Some("key1")).unwrap();
        let list = store.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "New");
    }

    #[test]
    fn test_max_cap() {
        let store = make_store();
        for i in 0..110 {
            store.create(
                &format!("Notif {i}"),
                "msg",
                &NotificationLevel::Info,
                &NotificationSource::System,
                None,
            ).unwrap();
        }
        let list = store.list().unwrap();
        assert_eq!(list.len(), 100);
        assert_eq!(list[0].title, "Notif 109");
    }
}
