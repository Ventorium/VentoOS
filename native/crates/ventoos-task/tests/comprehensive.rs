use ventoos_core::task::{
    CreateTaskRequest, RiskLevel, TaskPriority, TaskSource, TaskStatus,
};
use ventoos_core::types::new_id;
use ventoos_task::TaskEngine;

/// Helper to build a minimal CreateTaskRequest.
fn minimal_request(name: &str) -> CreateTaskRequest {
    CreateTaskRequest {
        name: name.to_string(),
        description: None,
        priority: None,
        risk_level: None,
        source: TaskSource::User,
        parent_task_id: None,
        connection_id: None,
        resource_id: None,
    }
}

// ---------------------------------------------------------------------------
// 1. Create task with minimal request
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_create_task_minimal() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("minimal")).await;

    assert_eq!(task.name, "minimal");
    assert_eq!(task.status, TaskStatus::Queued);
    assert_eq!(task.priority, TaskPriority::Normal);
    assert_eq!(task.risk_level, RiskLevel::None);
    assert_eq!(task.source, TaskSource::User);
    assert!(task.description.is_none());
    assert!(task.progress.is_none());
    assert!(task.parent_task_id.is_none());
    assert!(task.connection_id.is_none());
    assert!(task.resource_id.is_none());
    assert!(task.result.is_none());
    assert!(task.error.is_none());
    assert!(task.started_at.is_none());
    assert!(task.completed_at.is_none());
}

// ---------------------------------------------------------------------------
// 2. Create task with all fields filled
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_create_task_all_fields() {
    let engine = TaskEngine::new();
    let parent = new_id();
    let conn = new_id();
    let res = new_id();

    let task = engine
        .create_task(CreateTaskRequest {
            name: "full task".to_string(),
            description: Some("a description".to_string()),
            priority: Some(TaskPriority::High),
            risk_level: Some(RiskLevel::Medium),
            source: TaskSource::Agent,
            parent_task_id: Some(parent),
            connection_id: Some(conn),
            resource_id: Some(res),
        })
        .await;

    assert_eq!(task.name, "full task");
    assert_eq!(task.description.as_deref(), Some("a description"));
    assert_eq!(task.priority, TaskPriority::High);
    assert_eq!(task.risk_level, RiskLevel::Medium);
    assert_eq!(task.source, TaskSource::Agent);
    assert_eq!(task.parent_task_id, Some(parent));
    assert_eq!(task.connection_id, Some(conn));
    assert_eq!(task.resource_id, Some(res));
}

// ---------------------------------------------------------------------------
// 3. Create tasks with every TaskSource variant
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_create_task_source_user() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            source: TaskSource::User,
            ..minimal_request("src-user")
        })
        .await;
    assert_eq!(task.source, TaskSource::User);
}

#[tokio::test]
async fn test_create_task_source_agent() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            source: TaskSource::Agent,
            ..minimal_request("src-agent")
        })
        .await;
    assert_eq!(task.source, TaskSource::Agent);
}

#[tokio::test]
async fn test_create_task_source_system() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            source: TaskSource::System,
            ..minimal_request("src-system")
        })
        .await;
    assert_eq!(task.source, TaskSource::System);
}

// ---------------------------------------------------------------------------
// 4. Create tasks with every TaskPriority variant
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_create_task_priority_low() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            priority: Some(TaskPriority::Low),
            ..minimal_request("prio-low")
        })
        .await;
    assert_eq!(task.priority, TaskPriority::Low);
}

#[tokio::test]
async fn test_create_task_priority_normal() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            priority: Some(TaskPriority::Normal),
            ..minimal_request("prio-normal")
        })
        .await;
    assert_eq!(task.priority, TaskPriority::Normal);
}

#[tokio::test]
async fn test_create_task_priority_high() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            priority: Some(TaskPriority::High),
            ..minimal_request("prio-high")
        })
        .await;
    assert_eq!(task.priority, TaskPriority::High);
}

#[tokio::test]
async fn test_create_task_priority_critical() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            priority: Some(TaskPriority::Critical),
            ..minimal_request("prio-critical")
        })
        .await;
    assert_eq!(task.priority, TaskPriority::Critical);
}

// ---------------------------------------------------------------------------
// 5. Create tasks with every RiskLevel variant
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_create_task_risk_none() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            risk_level: Some(RiskLevel::None),
            ..minimal_request("risk-none")
        })
        .await;
    assert_eq!(task.risk_level, RiskLevel::None);
}

#[tokio::test]
async fn test_create_task_risk_low() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            risk_level: Some(RiskLevel::Low),
            ..minimal_request("risk-low")
        })
        .await;
    assert_eq!(task.risk_level, RiskLevel::Low);
}

#[tokio::test]
async fn test_create_task_risk_medium() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            risk_level: Some(RiskLevel::Medium),
            ..minimal_request("risk-medium")
        })
        .await;
    assert_eq!(task.risk_level, RiskLevel::Medium);
}

#[tokio::test]
async fn test_create_task_risk_high() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            risk_level: Some(RiskLevel::High),
            ..minimal_request("risk-high")
        })
        .await;
    assert_eq!(task.risk_level, RiskLevel::High);
}

#[tokio::test]
async fn test_create_task_risk_critical() {
    let engine = TaskEngine::new();
    let task = engine
        .create_task(CreateTaskRequest {
            risk_level: Some(RiskLevel::Critical),
            ..minimal_request("risk-critical")
        })
        .await;
    assert_eq!(task.risk_level, RiskLevel::Critical);
}

// ---------------------------------------------------------------------------
// 6. Get existing task
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_get_existing_task() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("find-me")).await;

    let found = engine.get_task(task.id).await;
    assert!(found.is_some());
    let found = found.unwrap();
    assert_eq!(found.id, task.id);
    assert_eq!(found.name, "find-me");
}

// ---------------------------------------------------------------------------
// 7. Get non-existing task returns None
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_get_nonexistent_task() {
    let engine = TaskEngine::new();
    assert!(engine.get_task(new_id()).await.is_none());
}

// ---------------------------------------------------------------------------
// 8. List tasks sorted by creation time (newest first)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_list_tasks_sorted_newest_first() {
    let engine = TaskEngine::new();

    let t1 = engine.create_task(minimal_request("first")).await;
    // Small delay to guarantee ordering
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let t2 = engine.create_task(minimal_request("second")).await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let t3 = engine.create_task(minimal_request("third")).await;

    let list = engine.list_tasks().await;
    assert_eq!(list.len(), 3);
    assert_eq!(list[0].id, t3.id);
    assert_eq!(list[1].id, t2.id);
    assert_eq!(list[2].id, t1.id);
}

// ---------------------------------------------------------------------------
// 9. List empty returns empty vec
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_list_tasks_empty() {
    let engine = TaskEngine::new();
    let list = engine.list_tasks().await;
    assert!(list.is_empty());
}

// ---------------------------------------------------------------------------
// 10. Status transition: Queued → Running (sets started_at)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_status_queued_to_running_sets_started_at() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("run-me")).await;
    assert!(task.started_at.is_none());

    let updated = engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();
    assert_eq!(updated.status, TaskStatus::Running);
    assert!(updated.started_at.is_some());
}

// ---------------------------------------------------------------------------
// 11. Status transition: Running → Success (sets completed_at)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_status_running_to_success_sets_completed_at() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("succeed")).await;
    engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();

    let updated = engine
        .update_status(task.id, TaskStatus::Success)
        .await
        .unwrap();
    assert_eq!(updated.status, TaskStatus::Success);
    assert!(updated.completed_at.is_some());
}

// ---------------------------------------------------------------------------
// 12. Status transition: Running → Failed (sets completed_at)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_status_running_to_failed_sets_completed_at() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("fail")).await;
    engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();

    let updated = engine
        .update_status(task.id, TaskStatus::Failed)
        .await
        .unwrap();
    assert_eq!(updated.status, TaskStatus::Failed);
    assert!(updated.completed_at.is_some());
}

// ---------------------------------------------------------------------------
// 13. Status transition: Queued → Cancelled (sets completed_at)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_status_queued_to_cancelled_sets_completed_at() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("cancel-early")).await;

    let updated = engine
        .update_status(task.id, TaskStatus::Cancelled)
        .await
        .unwrap();
    assert_eq!(updated.status, TaskStatus::Cancelled);
    assert!(updated.completed_at.is_some());
}

// ---------------------------------------------------------------------------
// 14. Status transition: to PartialSuccess (sets completed_at)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_status_to_partial_success_sets_completed_at() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("partial")).await;
    engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();

    let updated = engine
        .update_status(task.id, TaskStatus::PartialSuccess)
        .await
        .unwrap();
    assert_eq!(updated.status, TaskStatus::PartialSuccess);
    assert!(updated.completed_at.is_some());
}

// ---------------------------------------------------------------------------
// 15. Update status of non-existing task returns None
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_update_status_nonexistent() {
    let engine = TaskEngine::new();
    let result = engine
        .update_status(new_id(), TaskStatus::Running)
        .await;
    assert!(result.is_none());
}

// ---------------------------------------------------------------------------
// 16. Update progress to 0.0, 0.5, 1.0
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_update_progress_zero() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("prog-0")).await;

    let updated = engine.update_progress(task.id, 0.0).await.unwrap();
    assert_eq!(updated.progress, Some(0.0));
}

#[tokio::test]
async fn test_update_progress_half() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("prog-50")).await;

    let updated = engine.update_progress(task.id, 0.5).await.unwrap();
    assert_eq!(updated.progress, Some(0.5));
}

#[tokio::test]
async fn test_update_progress_full() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("prog-100")).await;

    let updated = engine.update_progress(task.id, 1.0).await.unwrap();
    assert_eq!(updated.progress, Some(1.0));
}

// ---------------------------------------------------------------------------
// 17. Update progress of non-existing task returns None
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_update_progress_nonexistent() {
    let engine = TaskEngine::new();
    assert!(engine.update_progress(new_id(), 0.5).await.is_none());
}

// ---------------------------------------------------------------------------
// 18. Cancel task (shorthand)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_cancel_task_shorthand() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("cancel-me")).await;

    let cancelled = engine.cancel_task(task.id).await.unwrap();
    assert_eq!(cancelled.status, TaskStatus::Cancelled);
    assert!(cancelled.completed_at.is_some());
}

// ---------------------------------------------------------------------------
// 19. Cancel non-existing returns None
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_cancel_nonexistent() {
    let engine = TaskEngine::new();
    assert!(engine.cancel_task(new_id()).await.is_none());
}

// ---------------------------------------------------------------------------
// 20. Event subscription receives create events
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_event_on_create() {
    let engine = TaskEngine::new();
    let mut rx = engine.subscribe();

    let task = engine.create_task(minimal_request("evt-create")).await;

    let evt = rx.recv().await.unwrap();
    assert_eq!(evt.task_id, task.id);
    assert_eq!(evt.status, TaskStatus::Queued);
}

// ---------------------------------------------------------------------------
// 21. Event subscription receives status update events
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_event_on_status_update() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("evt-status")).await;

    let mut rx = engine.subscribe();
    engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();

    let evt = rx.recv().await.unwrap();
    assert_eq!(evt.task_id, task.id);
    assert_eq!(evt.status, TaskStatus::Running);
}

// ---------------------------------------------------------------------------
// 22. Event subscription receives progress update events
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_event_on_progress_update() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("evt-progress")).await;

    let mut rx = engine.subscribe();
    engine.update_progress(task.id, 0.75).await.unwrap();

    let evt = rx.recv().await.unwrap();
    assert_eq!(evt.task_id, task.id);
    assert_eq!(evt.progress, Some(0.75));
}

// ---------------------------------------------------------------------------
// 23. Multiple subscribers receive same events
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_multiple_subscribers() {
    let engine = TaskEngine::new();
    let mut rx1 = engine.subscribe();
    let mut rx2 = engine.subscribe();

    let task = engine.create_task(minimal_request("multi-sub")).await;

    let e1 = rx1.recv().await.unwrap();
    let e2 = rx2.recv().await.unwrap();
    assert_eq!(e1.task_id, task.id);
    assert_eq!(e2.task_id, task.id);
}

// ---------------------------------------------------------------------------
// 24. Events contain correct task_id
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_event_correct_task_id() {
    let engine = TaskEngine::new();
    let mut rx = engine.subscribe();

    let t1 = engine.create_task(minimal_request("id-check-1")).await;
    let t2 = engine.create_task(minimal_request("id-check-2")).await;

    let e1 = rx.recv().await.unwrap();
    let e2 = rx.recv().await.unwrap();
    assert_eq!(e1.task_id, t1.id);
    assert_eq!(e2.task_id, t2.id);
}

// ---------------------------------------------------------------------------
// 25. Event contains message on creation
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_event_message_on_create() {
    let engine = TaskEngine::new();
    let mut rx = engine.subscribe();

    engine.create_task(minimal_request("msg-task")).await;

    let evt = rx.recv().await.unwrap();
    assert!(evt.message.is_some());
    let msg = evt.message.unwrap();
    assert!(msg.contains("msg-task"), "message should contain task name");
}

// ---------------------------------------------------------------------------
// 26. Default trait works
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_default_trait() {
    let engine = TaskEngine::default();
    let task = engine.create_task(minimal_request("default-engine")).await;
    assert_eq!(task.status, TaskStatus::Queued);
}

// ---------------------------------------------------------------------------
// 27. Concurrent task creation (10+ tasks simultaneously)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_concurrent_creation() {
    let engine = std::sync::Arc::new(TaskEngine::new());
    let mut handles = Vec::new();

    for i in 0..15 {
        let eng = engine.clone();
        handles.push(tokio::spawn(async move {
            eng.create_task(minimal_request(&format!("concurrent-{i}")))
                .await
        }));
    }

    let mut ids = std::collections::HashSet::new();
    for h in handles {
        let task = h.await.unwrap();
        ids.insert(task.id);
    }

    assert_eq!(ids.len(), 15);
    assert_eq!(engine.list_tasks().await.len(), 15);
}

// ---------------------------------------------------------------------------
// 28. Concurrent status updates
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_concurrent_status_updates() {
    let engine = std::sync::Arc::new(TaskEngine::new());
    let mut task_ids = Vec::new();

    for i in 0..10 {
        let t = engine
            .create_task(minimal_request(&format!("conc-status-{i}")))
            .await;
        task_ids.push(t.id);
    }

    let mut handles = Vec::new();
    for id in &task_ids {
        let eng = engine.clone();
        let id = *id;
        handles.push(tokio::spawn(async move {
            eng.update_status(id, TaskStatus::Running).await
        }));
    }

    for h in handles {
        let result = h.await.unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().status, TaskStatus::Running);
    }
}

// ---------------------------------------------------------------------------
// 29. Create task with parent_task_id
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_create_with_parent_task_id() {
    let engine = TaskEngine::new();
    let parent = engine.create_task(minimal_request("parent")).await;

    let child = engine
        .create_task(CreateTaskRequest {
            parent_task_id: Some(parent.id),
            ..minimal_request("child")
        })
        .await;

    assert_eq!(child.parent_task_id, Some(parent.id));
}

// ---------------------------------------------------------------------------
// 30. Create task with connection_id and resource_id
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_create_with_connection_and_resource_id() {
    let engine = TaskEngine::new();
    let conn = new_id();
    let res = new_id();

    let task = engine
        .create_task(CreateTaskRequest {
            connection_id: Some(conn),
            resource_id: Some(res),
            ..minimal_request("conn-res")
        })
        .await;

    assert_eq!(task.connection_id, Some(conn));
    assert_eq!(task.resource_id, Some(res));
}

// ---------------------------------------------------------------------------
// 31. Large batch: create 100 tasks, verify all in list
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_large_batch_100_tasks() {
    let engine = TaskEngine::new();

    for i in 0..100 {
        engine
            .create_task(minimal_request(&format!("batch-{i}")))
            .await;
    }

    let list = engine.list_tasks().await;
    assert_eq!(list.len(), 100);
}

// ---------------------------------------------------------------------------
// 32. Status transition doesn't change started_at if already set
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_started_at_not_overwritten() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("keep-start")).await;

    let running = engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();
    let original_started = running.started_at.unwrap();

    // Small delay then transition through WaitingConfirmation back to Running
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    engine
        .update_status(task.id, TaskStatus::WaitingConfirmation)
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    let running_again = engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();

    assert_eq!(running_again.started_at.unwrap(), original_started);
}

// ---------------------------------------------------------------------------
// 33. Progress update preserves status
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_progress_preserves_status() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("preserve-status")).await;
    engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();

    let updated = engine.update_progress(task.id, 0.3).await.unwrap();
    assert_eq!(updated.status, TaskStatus::Running);
}

// ---------------------------------------------------------------------------
// 34. Multiple progress updates track latest
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_multiple_progress_updates() {
    let engine = TaskEngine::new();
    let task = engine.create_task(minimal_request("multi-progress")).await;

    engine.update_progress(task.id, 0.1).await.unwrap();
    engine.update_progress(task.id, 0.4).await.unwrap();
    engine.update_progress(task.id, 0.9).await.unwrap();

    let current = engine.get_task(task.id).await.unwrap();
    assert_eq!(current.progress, Some(0.9));
}

// ---------------------------------------------------------------------------
// 35. Full lifecycle: create → running → progress updates → success
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_full_lifecycle() {
    let engine = TaskEngine::new();
    let mut rx = engine.subscribe();

    // Create
    let task = engine.create_task(minimal_request("lifecycle")).await;
    assert_eq!(task.status, TaskStatus::Queued);
    assert!(task.started_at.is_none());
    assert!(task.completed_at.is_none());

    let create_evt = rx.recv().await.unwrap();
    assert_eq!(create_evt.status, TaskStatus::Queued);

    // Running
    let running = engine
        .update_status(task.id, TaskStatus::Running)
        .await
        .unwrap();
    assert_eq!(running.status, TaskStatus::Running);
    assert!(running.started_at.is_some());
    assert!(running.completed_at.is_none());

    let running_evt = rx.recv().await.unwrap();
    assert_eq!(running_evt.status, TaskStatus::Running);

    // Progress 25%
    let p25 = engine.update_progress(task.id, 0.25).await.unwrap();
    assert_eq!(p25.progress, Some(0.25));
    assert_eq!(p25.status, TaskStatus::Running);

    let p25_evt = rx.recv().await.unwrap();
    assert_eq!(p25_evt.progress, Some(0.25));

    // Progress 75%
    let p75 = engine.update_progress(task.id, 0.75).await.unwrap();
    assert_eq!(p75.progress, Some(0.75));

    let p75_evt = rx.recv().await.unwrap();
    assert_eq!(p75_evt.progress, Some(0.75));

    // Success
    let done = engine
        .update_status(task.id, TaskStatus::Success)
        .await
        .unwrap();
    assert_eq!(done.status, TaskStatus::Success);
    assert!(done.completed_at.is_some());
    assert!(done.started_at.is_some());
    assert_eq!(done.progress, Some(0.75)); // progress preserved

    let done_evt = rx.recv().await.unwrap();
    assert_eq!(done_evt.status, TaskStatus::Success);
}
