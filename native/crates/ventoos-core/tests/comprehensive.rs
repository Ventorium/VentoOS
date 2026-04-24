use chrono::Utc;
use serde_json::json;
use ventoos_core::auth::*;
use ventoos_core::error::*;
use ventoos_core::notification::*;
use ventoos_core::process::*;
use ventoos_core::resource::*;
use ventoos_core::session::*;
use ventoos_core::task::*;
use ventoos_core::types::*;
use ventoos_core::window::*;
use ventoos_core::ws::*;

// ─── Auth ───────────────────────────────────────────────────────────

#[test]
fn auth_login_request_roundtrip() {
    let req = LoginRequest {
        password: "P@ssw0rd!#$%".to_string(),
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: LoginRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.password, "P@ssw0rd!#$%");
}

#[test]
fn auth_login_response_roundtrip() {
    let resp = LoginResponse {
        token: "eyJhbGciOiJIUzI1NiJ9.test.signature".to_string(),
    };
    let json = serde_json::to_string(&resp).unwrap();
    let de: LoginResponse = serde_json::from_str(&json).unwrap();
    assert_eq!(de.token, resp.token);
}

#[test]
fn auth_change_password_request_roundtrip() {
    let req = ChangePasswordRequest {
        current_password: "old-secret".to_string(),
        new_password: "new-$ecret-2024!".to_string(),
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: ChangePasswordRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.current_password, "old-secret");
    assert_eq!(de.new_password, "new-$ecret-2024!");
}

#[test]
fn auth_status_roundtrip() {
    for (init, locked) in [(true, false), (false, true), (true, true), (false, false)] {
        let status = AuthStatus {
            initialized: init,
            locked,
        };
        let json = serde_json::to_string(&status).unwrap();
        let de: AuthStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(de.initialized, init);
        assert_eq!(de.locked, locked);
    }
}

#[test]
fn auth_login_request_empty_password() {
    let req = LoginRequest {
        password: String::new(),
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: LoginRequest = serde_json::from_str(&json).unwrap();
    assert!(de.password.is_empty());
}

// ─── Error ──────────────────────────────────────────────────────────

#[test]
fn error_display_all_variants() {
    let cases: Vec<(VentoError, &str, &str)> = vec![
        (
            VentoError::Connection("tcp timeout".into()),
            "Connection error: tcp timeout",
            "CONNECTION_ERROR",
        ),
        (
            VentoError::Auth("invalid token".into()),
            "Authentication error: invalid token",
            "AUTH_ERROR",
        ),
        (
            VentoError::NotFound("connection abc".into()),
            "Not found: connection abc",
            "NOT_FOUND",
        ),
        (
            VentoError::PermissionDenied("admin only".into()),
            "Permission denied: admin only",
            "PERMISSION_DENIED",
        ),
        (
            VentoError::Validation("port out of range".into()),
            "Validation error: port out of range",
            "VALIDATION_ERROR",
        ),
        (
            VentoError::Task("execution failed".into()),
            "Task error: execution failed",
            "TASK_ERROR",
        ),
        (
            VentoError::Internal("unexpected state".into()),
            "Internal error: unexpected state",
            "INTERNAL_ERROR",
        ),
        (
            VentoError::Database("lock contention".into()),
            "Database error: lock contention",
            "DATABASE_ERROR",
        ),
        (
            VentoError::Timeout("30s exceeded".into()),
            "Timeout: 30s exceeded",
            "TIMEOUT",
        ),
    ];
    for (err, expected_display, expected_code) in &cases {
        assert_eq!(err.to_string(), *expected_display);
        let resp = ErrorResponse::from(err);
        assert_eq!(resp.code, *expected_code);
        assert!(resp.message.contains(expected_display));
    }
}

#[test]
fn error_io_conversion() {
    let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
    let vento_err = VentoError::from(io_err);
    assert!(vento_err.to_string().contains("file missing"));
    let resp = ErrorResponse::from(&vento_err);
    assert_eq!(resp.code, "IO_ERROR");
}

#[test]
fn error_serialization_conversion() {
    let bad_json = "{ broken }";
    let serde_err = serde_json::from_str::<serde_json::Value>(bad_json).unwrap_err();
    let vento_err = VentoError::from(serde_err);
    assert!(vento_err.to_string().contains("Serialization error"));
    let resp = ErrorResponse::from(&vento_err);
    assert_eq!(resp.code, "SERIALIZATION_ERROR");
}

#[test]
fn error_response_serialization() {
    let resp = ErrorResponse {
        code: "CUSTOM_ERROR".to_string(),
        message: "something went wrong with special chars: <>&\"".to_string(),
    };
    let json = serde_json::to_string(&resp).unwrap();
    let de: ErrorResponse = serde_json::from_str(&json).unwrap();
    assert_eq!(de.code, "CUSTOM_ERROR");
    assert!(de.message.contains("<>&\""));
}

#[test]
fn vento_result_ok_and_err() {
    let ok: VentoResult<u32> = Ok(42);
    assert!(matches!(ok, Ok(42)));

    let err: VentoResult<u32> = Err(VentoError::Validation("bad input".into()));
    assert!(err.is_err());
}

// ─── Notification ───────────────────────────────────────────────────

#[test]
fn notification_level_all_variants() {
    let variants = [
        NotificationLevel::Info,
        NotificationLevel::Success,
        NotificationLevel::Warning,
        NotificationLevel::Error,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: NotificationLevel = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn notification_source_all_variants() {
    let variants = [
        NotificationSource::System,
        NotificationSource::Connection,
        NotificationSource::Task,
        NotificationSource::Agent,
        NotificationSource::App,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: NotificationSource = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn notification_full_roundtrip() {
    let n = Notification {
        id: new_id(),
        title: "Deployment 完成".to_string(),
        message: "K8s deployment \"api-server\" 已成功更新至 v2.3.1".to_string(),
        level: NotificationLevel::Success,
        source: NotificationSource::Task,
        read: false,
        action_url: Some("/tasks/deploy-123".to_string()),
        task_id: Some(new_id()),
        created_at: Utc::now(),
    };
    let json = serde_json::to_string(&n).unwrap();
    let de: Notification = serde_json::from_str(&json).unwrap();
    assert_eq!(de.title, "Deployment 完成");
    assert!(de.message.contains("v2.3.1"));
    assert_eq!(de.level, NotificationLevel::Success);
    assert!(!de.read);
    assert!(de.action_url.is_some());
}

// ─── Process ────────────────────────────────────────────────────────

#[test]
fn process_status_all_variants() {
    let variants = [
        ProcessStatus::Running,
        ProcessStatus::Suspended,
        ProcessStatus::Terminated,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: ProcessStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn vprocess_roundtrip() {
    let proc = VProcess {
        pid: u32::MAX,
        app_id: "database".to_string(),
        window_id: "win-abc-123".to_string(),
        status: ProcessStatus::Running,
        created_at: Utc::now(),
        context: json!({"connection_id": "some-uuid", "schema": "public"}),
    };
    let json = serde_json::to_string(&proc).unwrap();
    let de: VProcess = serde_json::from_str(&json).unwrap();
    assert_eq!(de.pid, u32::MAX);
    assert_eq!(de.app_id, "database");
    assert_eq!(de.context["schema"], "public");
}

#[test]
fn vprocess_default_context() {
    // context has #[serde(default)] so missing field should deserialize as Null
    let json = r#"{"pid":1,"app_id":"explorer","window_id":"w1","status":"running","created_at":"2025-01-01T00:00:00Z"}"#;
    let de: VProcess = serde_json::from_str(json).unwrap();
    assert_eq!(de.pid, 1);
    assert!(de.context.is_null());
}

// ─── Resource ───────────────────────────────────────────────────────

#[test]
fn resource_type_all_variants() {
    let variants = [
        ResourceType::KubernetesCluster,
        ResourceType::KubernetesNamespace,
        ResourceType::KubernetesPod,
        ResourceType::KubernetesService,
        ResourceType::KubernetesDeployment,
        ResourceType::KubernetesNode,
        ResourceType::DatabaseInstance,
        ResourceType::DatabaseSchema,
        ResourceType::DatabaseTable,
        ResourceType::RedisInstance,
        ResourceType::RedisKey,
        ResourceType::File,
        ResourceType::Directory,
        ResourceType::MountPoint,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: ResourceType = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn resource_full_roundtrip() {
    let parent_id = new_id();
    let r = Resource {
        id: new_id(),
        name: "api-deployment".to_string(),
        resource_type: ResourceType::KubernetesDeployment,
        connection_id: Some(new_id()),
        parent_id: Some(parent_id),
        metadata: json!({"replicas": 3, "image": "api-server:v2.3.1", "namespace": "production"}),
    };
    let json = serde_json::to_string(&r).unwrap();
    let de: Resource = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "api-deployment");
    assert_eq!(de.resource_type, ResourceType::KubernetesDeployment);
    assert_eq!(de.parent_id.unwrap(), parent_id);
    assert_eq!(de.metadata["replicas"], 3);
}

// ─── Session ────────────────────────────────────────────────────────

#[test]
fn session_status_all_variants() {
    let variants = [
        SessionStatus::Active,
        SessionStatus::Expired,
        SessionStatus::Refreshing,
        SessionStatus::Closed,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: SessionStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn session_full_roundtrip() {
    let session = Session {
        id: new_id(),
        connection_id: new_id(),
        status: SessionStatus::Refreshing,
        expires_at: Some(Utc::now()),
        created_at: Utc::now(),
        metadata: json!({"refresh_count": 3, "last_action": "query"}),
    };
    let json = serde_json::to_string(&session).unwrap();
    let de: Session = serde_json::from_str(&json).unwrap();
    assert_eq!(de.status, SessionStatus::Refreshing);
    assert_eq!(de.metadata["refresh_count"], 3);
}

// ─── Task ───────────────────────────────────────────────────────────

#[test]
fn task_status_all_variants_roundtrip() {
    let variants = [
        (TaskStatus::Queued, "\"queued\""),
        (TaskStatus::Running, "\"running\""),
        (TaskStatus::WaitingConfirmation, "\"waiting_confirmation\""),
        (TaskStatus::Success, "\"success\""),
        (TaskStatus::Failed, "\"failed\""),
        (TaskStatus::Cancelled, "\"cancelled\""),
        (TaskStatus::PartialSuccess, "\"partial_success\""),
    ];
    for (variant, expected_json) in &variants {
        let json = serde_json::to_string(variant).unwrap();
        assert_eq!(&json, expected_json);
        let de: TaskStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, variant);
    }
}

#[test]
fn task_priority_all_variants() {
    let variants = [
        TaskPriority::Low,
        TaskPriority::Normal,
        TaskPriority::High,
        TaskPriority::Critical,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: TaskPriority = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn risk_level_all_variants() {
    let variants = [
        RiskLevel::None,
        RiskLevel::Low,
        RiskLevel::Medium,
        RiskLevel::High,
        RiskLevel::Critical,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: RiskLevel = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn task_source_all_variants() {
    let variants = [TaskSource::User, TaskSource::Agent, TaskSource::System];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: TaskSource = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn task_full_roundtrip() {
    let now = Utc::now();
    let task = Task {
        id: new_id(),
        name: "Rolling update: api-server → v2.4.0".to_string(),
        description: Some("Zero-downtime rolling update for api-server deployment".to_string()),
        status: TaskStatus::Running,
        priority: TaskPriority::High,
        risk_level: RiskLevel::High,
        source: TaskSource::User,
        progress: Some(0.65),
        parent_task_id: None,
        connection_id: Some(new_id()),
        resource_id: Some(new_id()),
        result: None,
        error: None,
        created_at: now,
        updated_at: now,
        started_at: Some(now),
        completed_at: None,
    };
    let json = serde_json::to_string(&task).unwrap();
    let de: Task = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "Rolling update: api-server → v2.4.0");
    assert_eq!(de.status, TaskStatus::Running);
    assert_eq!(de.priority, TaskPriority::High);
    assert_eq!(de.risk_level, RiskLevel::High);
    assert_eq!(de.progress, Some(0.65));
}

#[test]
fn task_with_result_and_error() {
    let now = Utc::now();
    let task = Task {
        id: new_id(),
        name: "Backup database".to_string(),
        description: None,
        status: TaskStatus::Failed,
        priority: TaskPriority::Normal,
        risk_level: RiskLevel::Low,
        source: TaskSource::System,
        progress: Some(0.3),
        parent_task_id: None,
        connection_id: None,
        resource_id: None,
        result: Some(json!({"bytes_written": 1_048_576})),
        error: Some("Disk full: /var/backups has 0 bytes remaining".to_string()),
        created_at: now,
        updated_at: now,
        started_at: Some(now),
        completed_at: Some(now),
    };
    let json = serde_json::to_string(&task).unwrap();
    let de: Task = serde_json::from_str(&json).unwrap();
    assert_eq!(de.status, TaskStatus::Failed);
    assert!(de.error.unwrap().contains("Disk full"));
    assert_eq!(de.result.unwrap()["bytes_written"], 1_048_576);
}

#[test]
fn create_task_request_minimal() {
    let req = CreateTaskRequest {
        name: "Scan pods".to_string(),
        description: None,
        priority: None,
        risk_level: None,
        source: TaskSource::Agent,
        parent_task_id: None,
        connection_id: None,
        resource_id: None,
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: CreateTaskRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "Scan pods");
    assert_eq!(de.source, TaskSource::Agent);
    assert!(de.priority.is_none());
}

// ─── Types ──────────────────────────────────────────────────────────

#[test]
fn id_generation_uniqueness() {
    let ids: Vec<Id> = (0..100).map(|_| new_id()).collect();
    let unique: std::collections::HashSet<_> = ids.iter().collect();
    assert_eq!(unique.len(), 100);
}

#[test]
fn api_response_ok_with_complex_type() {
    let task = Task {
        id: new_id(),
        name: "complex-response-test".to_string(),
        description: None,
        status: TaskStatus::Success,
        priority: TaskPriority::Low,
        risk_level: RiskLevel::None,
        source: TaskSource::System,
        progress: Some(1.0),
        parent_task_id: None,
        connection_id: None,
        resource_id: None,
        result: Some(json!({"rows_affected": 42})),
        error: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        started_at: None,
        completed_at: None,
    };
    let resp = ApiResponse::ok(task);
    let json = serde_json::to_string(&resp).unwrap();
    let de: ApiResponse<Task> = serde_json::from_str(&json).unwrap();
    assert!(de.success);
    let data = de.data.unwrap();
    assert_eq!(data.name, "complex-response-test");
    assert_eq!(data.status, TaskStatus::Success);
}

#[test]
fn api_response_err_omits_data() {
    let resp = ApiResponse::<String>::err("database connection timeout after 30s");
    let json = serde_json::to_string(&resp).unwrap();
    // data field should be omitted due to skip_serializing_if
    assert!(!json.contains("\"data\""));
    assert!(json.contains("database connection timeout"));
}

#[test]
fn api_response_ok_omits_error() {
    let resp = ApiResponse::ok(vec![1u32, 2, 3]);
    let json = serde_json::to_string(&resp).unwrap();
    assert!(!json.contains("\"error\""));
}

#[test]
fn pagination_default_values() {
    let p = Pagination::default();
    assert_eq!(p.page, 1);
    assert_eq!(p.page_size, 50);
}

#[test]
fn pagination_custom_values() {
    let p = Pagination {
        page: 5,
        page_size: 100,
    };
    let json = serde_json::to_string(&p).unwrap();
    let de: Pagination = serde_json::from_str(&json).unwrap();
    assert_eq!(de.page, 5);
    assert_eq!(de.page_size, 100);
}

#[test]
fn paginated_response_with_tasks() {
    let now = Utc::now();
    let items: Vec<Task> = (0..3)
        .map(|i| Task {
            id: new_id(),
            name: format!("task-{i}"),
            description: None,
            status: if i == 0 {
                TaskStatus::Success
            } else {
                TaskStatus::Running
            },
            priority: TaskPriority::Normal,
            risk_level: RiskLevel::None,
            source: TaskSource::User,
            progress: Some(0.5),
            parent_task_id: None,
            connection_id: None,
            resource_id: None,
            result: None,
            error: None,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
        })
        .collect();

    let resp = PaginatedResponse {
        items,
        total: 25,
        page: 1,
        page_size: 3,
    };
    let json = serde_json::to_string(&resp).unwrap();
    let de: PaginatedResponse<Task> = serde_json::from_str(&json).unwrap();
    assert_eq!(de.items.len(), 3);
    assert_eq!(de.total, 25);
    assert_eq!(de.page, 1);
    assert_eq!(de.page_size, 3);
    assert_eq!(de.items[0].name, "task-0");
    assert_eq!(de.items[2].name, "task-2");
}

#[test]
fn paginated_response_empty() {
    let resp = PaginatedResponse::<String> {
        items: vec![],
        total: 0,
        page: 1,
        page_size: 50,
    };
    let json = serde_json::to_string(&resp).unwrap();
    let de: PaginatedResponse<String> = serde_json::from_str(&json).unwrap();
    assert!(de.items.is_empty());
    assert_eq!(de.total, 0);
}

// ─── Window ─────────────────────────────────────────────────────────

#[test]
fn window_status_all_variants() {
    let variants = [
        WindowStatus::Created,
        WindowStatus::Opening,
        WindowStatus::Active,
        WindowStatus::Blurred,
        WindowStatus::Minimized,
        WindowStatus::Restored,
        WindowStatus::Closing,
        WindowStatus::Closed,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: WindowStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn window_state_full_roundtrip() {
    let state = WindowState {
        id: new_id().to_string(),
        app_id: "database".to_string(),
        title: "Database — prod-pg / public".to_string(),
        x: 150.5,
        y: 75.25,
        width: 1400.0,
        height: 900.0,
        z_index: u32::MAX,
        status: WindowStatus::Active,
        is_maximized: true,
        tab_states: Some(json!([
            {"tab_id": "query-1", "sql": "SELECT * FROM users LIMIT 10"},
            {"tab_id": "schema", "selected_table": "orders"}
        ])),
        app_state: Some(json!({"connection_id": "abc-123", "active_tab": "query-1"})),
    };
    let json = serde_json::to_string(&state).unwrap();
    let de: WindowState = serde_json::from_str(&json).unwrap();
    assert_eq!(de.app_id, "database");
    assert_eq!(de.title, "Database — prod-pg / public");
    assert!((de.x - 150.5).abs() < f64::EPSILON);
    assert_eq!(de.z_index, u32::MAX);
    assert!(de.is_maximized);
    assert!(de.tab_states.is_some());
}

// ─── WebSocket ──────────────────────────────────────────────────────

#[test]
fn ws_client_ping_deserialize() {
    let msg: ClientMessage = serde_json::from_str(r#"{"type":"Ping"}"#).unwrap();
    assert!(matches!(msg, ClientMessage::Ping));
}

#[test]
fn ws_client_subscribe_deserialize() {
    let msg: ClientMessage =
        serde_json::from_str(r#"{"type":"Subscribe","data":{"channel":"task_events"}}"#).unwrap();
    if let ClientMessage::Subscribe { channel } = msg {
        assert_eq!(channel, "task_events");
    } else {
        panic!("expected Subscribe");
    }
}

#[test]
fn ws_client_unsubscribe_deserialize() {
    let msg: ClientMessage =
        serde_json::from_str(r#"{"type":"Unsubscribe","data":{"channel":"redis:conn-1:pubsub"}}"#)
            .unwrap();
    if let ClientMessage::Unsubscribe { channel } = msg {
        assert_eq!(channel, "redis:conn-1:pubsub");
    } else {
        panic!("expected Unsubscribe");
    }
}

#[test]
fn ws_client_app_message_deserialize() {
    let json_str = r#"{"type":"AppMessage","data":{"app_id":"kubernetes","payload":{"action":"watch_pods","namespace":"kube-system"}}}"#;
    let msg: ClientMessage = serde_json::from_str(json_str).unwrap();
    if let ClientMessage::AppMessage { app_id, payload } = msg {
        assert_eq!(app_id, "kubernetes");
        assert_eq!(payload["action"], "watch_pods");
        assert_eq!(payload["namespace"], "kube-system");
    } else {
        panic!("expected AppMessage");
    }
}

#[test]
fn ws_server_pong_serialize() {
    let msg = ServerMessage::Pong;
    let json = msg.to_json();
    assert!(json.contains("\"type\":\"Pong\""));
}

#[test]
fn ws_server_task_update_serialize() {
    let msg = ServerMessage::TaskUpdate {
        task_id: "task-deploy-001".to_string(),
        status: "running".to_string(),
        progress: Some(0.75),
        message: Some("Updating replicas 3/4".to_string()),
    };
    let json = msg.to_json();
    assert!(json.contains("\"type\":\"TaskUpdate\""));
    assert!(json.contains("task-deploy-001"));
    assert!(json.contains("0.75"));
    // verify it round-trips as Value
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["data"]["task_id"], "task-deploy-001");
}

#[test]
fn ws_server_notification_serialize() {
    let msg = ServerMessage::Notification {
        id: "notif-42".to_string(),
        level: "warning".to_string(),
        title: "High CPU usage".to_string(),
        message: "Pod api-server-7b8d in namespace production is using 95% CPU".to_string(),
    };
    let json = msg.to_json();
    assert!(json.contains("\"type\":\"Notification\""));
    assert!(json.contains("High CPU usage"));
    assert!(json.contains("95% CPU"));
}

#[test]
fn ws_server_connection_status_serialize() {
    let msg = ServerMessage::ConnectionStatus {
        connection_id: "conn-pg-primary".to_string(),
        status: "reconnecting".to_string(),
    };
    let json = msg.to_json();
    assert!(json.contains("\"type\":\"ConnectionStatus\""));
    assert!(json.contains("conn-pg-primary"));
    assert!(json.contains("reconnecting"));
}

#[test]
fn ws_server_app_message_serialize() {
    let msg = ServerMessage::AppMessage {
        app_id: "redis".to_string(),
        payload: json!({"event": "key_expired", "key": "cache:session:abc"}),
    };
    let json = msg.to_json();
    assert!(json.contains("\"type\":\"AppMessage\""));
    assert!(json.contains("redis"));
    assert!(json.contains("key_expired"));
}

// ─── Edge cases ─────────────────────────────────────────────────────

#[test]
fn edge_case_special_characters_in_task_names() {
    let task = CreateTaskRequest {
        name: "prod/pg (主数据库) — André's server <&>".to_string(),
        description: Some("emoji-🚀 back\\slash".to_string()),
        priority: Some(TaskPriority::High),
        risk_level: Some(RiskLevel::Critical),
        source: TaskSource::User,
        parent_task_id: None,
        connection_id: None,
        resource_id: None,
    };
    let json = serde_json::to_string(&task).unwrap();
    let de: CreateTaskRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "prod/pg (主数据库) — André's server <&>");
}

#[test]
fn edge_case_task_with_zero_progress() {
    let now = Utc::now();
    let task = Task {
        id: new_id(),
        name: "zero-progress".to_string(),
        description: None,
        status: TaskStatus::Queued,
        priority: TaskPriority::Low,
        risk_level: RiskLevel::None,
        source: TaskSource::System,
        progress: Some(0.0),
        parent_task_id: None,
        connection_id: None,
        resource_id: None,
        result: None,
        error: None,
        created_at: now,
        updated_at: now,
        started_at: None,
        completed_at: None,
    };
    let json = serde_json::to_string(&task).unwrap();
    let de: Task = serde_json::from_str(&json).unwrap();
    assert_eq!(de.progress, Some(0.0));
}

#[test]
fn edge_case_window_at_origin() {
    let state = WindowState {
        id: new_id().to_string(),
        app_id: "explorer".to_string(),
        title: String::new(),
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
        z_index: 0,
        status: WindowStatus::Created,
        is_maximized: false,
        tab_states: None,
        app_state: None,
    };
    let json = serde_json::to_string(&state).unwrap();
    let de: WindowState = serde_json::from_str(&json).unwrap();
    assert!(de.x.abs() < f64::EPSILON);
    assert!(de.width.abs() < f64::EPSILON);
    assert_eq!(de.z_index, 0);
}

// ─── Cross-module integration ───────────────────────────────────────

#[test]
fn api_response_with_paginated_tasks() {
    let now = Utc::now();
    let tasks: Vec<Task> = (0..2)
        .map(|i| Task {
            id: new_id(),
            name: format!("task-{i}"),
            description: None,
            status: if i == 0 {
                TaskStatus::Success
            } else {
                TaskStatus::Failed
            },
            priority: TaskPriority::Normal,
            risk_level: RiskLevel::Low,
            source: TaskSource::User,
            progress: Some(1.0),
            parent_task_id: None,
            connection_id: None,
            resource_id: None,
            result: None,
            error: None,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
        })
        .collect();

    let page = PaginatedResponse {
        items: tasks,
        total: 100,
        page: 3,
        page_size: 2,
    };
    let resp = ApiResponse::ok(page);
    let json = serde_json::to_string(&resp).unwrap();
    let de: ApiResponse<PaginatedResponse<Task>> = serde_json::from_str(&json).unwrap();
    assert!(de.success);
    let data = de.data.unwrap();
    assert_eq!(data.total, 100);
    assert_eq!(data.page, 3);
    assert_eq!(data.items[0].status, TaskStatus::Success);
    assert_eq!(data.items[1].status, TaskStatus::Failed);
}
