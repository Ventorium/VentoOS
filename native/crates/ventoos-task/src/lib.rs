use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use tokio::sync::{broadcast, RwLock};
use ventoos_core::task::{CreateTaskRequest, Task, TaskPriority, TaskStatus, RiskLevel};
use ventoos_core::types::{new_id, Id};

/// Event emitted when a task changes.
#[derive(Debug, Clone)]
pub struct TaskEvent {
    pub task_id: Id,
    pub status: TaskStatus,
    pub progress: Option<f32>,
    pub message: Option<String>,
}

/// In-memory task engine for managing async tasks.
pub struct TaskEngine {
    tasks: Arc<RwLock<HashMap<Id, Task>>>,
    event_tx: broadcast::Sender<TaskEvent>,
}

impl TaskEngine {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// Subscribe to task events.
    pub fn subscribe(&self) -> broadcast::Receiver<TaskEvent> {
        self.event_tx.subscribe()
    }

    /// Create a new task.
    pub async fn create_task(&self, req: CreateTaskRequest) -> Task {
        let now = Utc::now();
        let task = Task {
            id: new_id(),
            name: req.name,
            description: req.description,
            status: TaskStatus::Queued,
            priority: req.priority.unwrap_or(TaskPriority::Normal),
            risk_level: req.risk_level.unwrap_or(RiskLevel::None),
            source: req.source,
            progress: None,
            parent_task_id: req.parent_task_id,
            connection_id: req.connection_id,
            resource_id: req.resource_id,
            result: None,
            error: None,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
        };
        let mut tasks = self.tasks.write().await;
        tasks.insert(task.id, task.clone());
        let _ = self.event_tx.send(TaskEvent {
            task_id: task.id,
            status: TaskStatus::Queued,
            progress: None,
            message: Some(format!("Task '{}' created", task.name)),
        });
        task
    }

    /// Get a task by ID.
    pub async fn get_task(&self, id: Id) -> Option<Task> {
        let tasks = self.tasks.read().await;
        tasks.get(&id).cloned()
    }

    /// List all tasks.
    pub async fn list_tasks(&self) -> Vec<Task> {
        let tasks = self.tasks.read().await;
        let mut list: Vec<Task> = tasks.values().cloned().collect();
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }

    /// Update task status.
    pub async fn update_status(&self, id: Id, status: TaskStatus) -> Option<Task> {
        let mut tasks = self.tasks.write().await;
        if let Some(task) = tasks.get_mut(&id) {
            task.status = status.clone();
            task.updated_at = Utc::now();
            if status == TaskStatus::Running && task.started_at.is_none() {
                task.started_at = Some(Utc::now());
            }
            if matches!(
                status,
                TaskStatus::Success
                    | TaskStatus::Failed
                    | TaskStatus::Cancelled
                    | TaskStatus::PartialSuccess
            ) {
                task.completed_at = Some(Utc::now());
            }
            let updated = task.clone();
            let _ = self.event_tx.send(TaskEvent {
                task_id: id,
                status,
                progress: updated.progress,
                message: None,
            });
            Some(updated)
        } else {
            None
        }
    }

    /// Update task progress.
    pub async fn update_progress(&self, id: Id, progress: f32) -> Option<Task> {
        let mut tasks = self.tasks.write().await;
        if let Some(task) = tasks.get_mut(&id) {
            task.progress = Some(progress);
            task.updated_at = Utc::now();
            let updated = task.clone();
            let _ = self.event_tx.send(TaskEvent {
                task_id: id,
                status: updated.status.clone(),
                progress: Some(progress),
                message: None,
            });
            Some(updated)
        } else {
            None
        }
    }

    /// Cancel a task.
    pub async fn cancel_task(&self, id: Id) -> Option<Task> {
        self.update_status(id, TaskStatus::Cancelled).await
    }
}

impl Default for TaskEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ventoos_core::task::TaskSource;

    #[tokio::test]
    async fn test_create_and_get_task() {
        let engine = TaskEngine::new();
        let task = engine
            .create_task(CreateTaskRequest {
                name: "test task".to_string(),
                description: None,
                priority: None,
                risk_level: None,
                source: TaskSource::User,
                parent_task_id: None,
                connection_id: None,
                resource_id: None,
            })
            .await;

        assert_eq!(task.name, "test task");
        assert_eq!(task.status, TaskStatus::Queued);

        let fetched = engine.get_task(task.id).await;
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().name, "test task");
    }

    #[tokio::test]
    async fn test_task_status_transitions() {
        let engine = TaskEngine::new();
        let task = engine
            .create_task(CreateTaskRequest {
                name: "transition test".to_string(),
                description: None,
                priority: None,
                risk_level: None,
                source: TaskSource::User,
                parent_task_id: None,
                connection_id: None,
                resource_id: None,
            })
            .await;

        let updated = engine
            .update_status(task.id, TaskStatus::Running)
            .await
            .unwrap();
        assert_eq!(updated.status, TaskStatus::Running);
        assert!(updated.started_at.is_some());

        let completed = engine
            .update_status(task.id, TaskStatus::Success)
            .await
            .unwrap();
        assert_eq!(completed.status, TaskStatus::Success);
        assert!(completed.completed_at.is_some());
    }

    #[tokio::test]
    async fn test_task_events() {
        let engine = TaskEngine::new();
        let mut rx = engine.subscribe();

        let task = engine
            .create_task(CreateTaskRequest {
                name: "event test".to_string(),
                description: None,
                priority: None,
                risk_level: None,
                source: TaskSource::System,
                parent_task_id: None,
                connection_id: None,
                resource_id: None,
            })
            .await;

        let event = rx.recv().await.unwrap();
        assert_eq!(event.task_id, task.id);
        assert_eq!(event.status, TaskStatus::Queued);
    }

    #[tokio::test]
    async fn test_cancel_task() {
        let engine = TaskEngine::new();
        let task = engine
            .create_task(CreateTaskRequest {
                name: "cancel test".to_string(),
                description: None,
                priority: None,
                risk_level: None,
                source: TaskSource::User,
                parent_task_id: None,
                connection_id: None,
                resource_id: None,
            })
            .await;

        let cancelled = engine.cancel_task(task.id).await.unwrap();
        assert_eq!(cancelled.status, TaskStatus::Cancelled);
    }
}
