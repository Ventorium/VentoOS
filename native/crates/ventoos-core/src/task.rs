use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::types::Id;

/// Task status following the state machine:
/// queued -> running -> `waiting_confirmation` -> running -> success
/// queued -> running -> failed / cancelled / `partial_success`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Queued,
    Running,
    WaitingConfirmation,
    Success,
    Failed,
    Cancelled,
    PartialSuccess,
}

/// Task priority level.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Low,
    Normal,
    High,
    Critical,
}

/// Risk level of a task.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    None,
    Low,
    Medium,
    High,
    Critical,
}

/// Task source indicates who/what triggered the task.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskSource {
    User,
    Agent,
    System,
}

/// A task represents an asynchronous execution unit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: Id,
    pub name: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub risk_level: RiskLevel,
    pub source: TaskSource,
    pub progress: Option<f32>,
    pub parent_task_id: Option<Id>,
    pub connection_id: Option<Id>,
    pub resource_id: Option<Id>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

/// Task creation request.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTaskRequest {
    pub name: String,
    pub description: Option<String>,
    pub priority: Option<TaskPriority>,
    pub risk_level: Option<RiskLevel>,
    pub source: TaskSource,
    pub parent_task_id: Option<Id>,
    pub connection_id: Option<Id>,
    pub resource_id: Option<Id>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::new_id;

    #[test]
    fn test_task_status_serialization() {
        let status = TaskStatus::WaitingConfirmation;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"waiting_confirmation\"");
    }

    #[test]
    fn test_task_creation() {
        let task = Task {
            id: new_id(),
            name: "Deploy update".to_string(),
            description: Some("Rolling update for service-x".to_string()),
            status: TaskStatus::Queued,
            priority: TaskPriority::Normal,
            risk_level: RiskLevel::Medium,
            source: TaskSource::User,
            progress: None,
            parent_task_id: None,
            connection_id: None,
            resource_id: None,
            result: None,
            error: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            started_at: None,
            completed_at: None,
        };
        let json = serde_json::to_string(&task).unwrap();
        let deserialized: Task = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "Deploy update");
        assert_eq!(deserialized.status, TaskStatus::Queued);
    }
}
