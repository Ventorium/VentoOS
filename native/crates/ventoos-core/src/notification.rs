use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::types::Id;

/// Notification severity level.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NotificationLevel {
    Info,
    Success,
    Warning,
    Error,
}

/// Notification source category.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NotificationSource {
    System,
    Connection,
    Task,
    Agent,
    App,
}

/// A notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: Id,
    pub title: String,
    pub message: String,
    pub level: NotificationLevel,
    pub source: NotificationSource,
    pub read: bool,
    pub action_url: Option<String>,
    pub task_id: Option<Id>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::new_id;

    #[test]
    fn test_notification_serialization() {
        let n = Notification {
            id: new_id(),
            title: "Task completed".to_string(),
            message: "Database backup finished successfully".to_string(),
            level: NotificationLevel::Success,
            source: NotificationSource::Task,
            read: false,
            action_url: None,
            task_id: Some(new_id()),
            created_at: Utc::now(),
        };
        let json = serde_json::to_string(&n).unwrap();
        let deserialized: Notification = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.title, "Task completed");
        assert!(!deserialized.read);
    }
}
