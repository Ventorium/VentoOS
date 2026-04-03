use chrono::Utc;
use serde_json::json;
use ventoos_core::auth::*;
use ventoos_core::connection::*;
use ventoos_core::error::*;
use ventoos_core::notification::*;
use ventoos_core::process::*;
use ventoos_core::resource::*;
use ventoos_core::session::*;
use ventoos_core::ssh::*;
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

// ─── Connection types ───────────────────────────────────────────────

#[test]
fn connection_type_all_variants_roundtrip() {
    let variants = [
        ConnectionType::Kubernetes,
        ConnectionType::Teleport,
        ConnectionType::PostgreSql,
        ConnectionType::MySql,
        ConnectionType::Sqlite,
        ConnectionType::Redis,
        ConnectionType::Ssh,
        ConnectionType::Sftp,
        ConnectionType::Ftp,
        ConnectionType::Smb,
        ConnectionType::S3,
    ];
    for variant in &variants {
        let json = serde_json::to_string(variant).unwrap();
        let de: ConnectionType = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, variant);
    }
}

#[test]
fn connection_type_snake_case_serialization() {
    assert_eq!(
        serde_json::to_string(&ConnectionType::PostgreSql).unwrap(),
        "\"postgre_sql\""
    );
    assert_eq!(
        serde_json::to_string(&ConnectionType::MySql).unwrap(),
        "\"my_sql\""
    );
    assert_eq!(
        serde_json::to_string(&ConnectionType::S3).unwrap(),
        "\"s3\""
    );
    assert_eq!(
        serde_json::to_string(&ConnectionType::Kubernetes).unwrap(),
        "\"kubernetes\""
    );
}

#[test]
fn connection_status_all_variants_roundtrip() {
    let variants = [
        ConnectionStatus::Draft,
        ConnectionStatus::Testing,
        ConnectionStatus::Available,
        ConnectionStatus::Expired,
        ConnectionStatus::Reconnecting,
        ConnectionStatus::AuthFailed,
        ConnectionStatus::NetworkError,
        ConnectionStatus::PermissionDenied,
        ConnectionStatus::ResourceNotFound,
    ];
    for variant in &variants {
        let json = serde_json::to_string(variant).unwrap();
        let de: ConnectionStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, variant);
    }
}

#[test]
fn connection_full_roundtrip_postgresql() {
    let now = Utc::now();
    let conn = Connection {
        id: new_id(),
        name: "prod-pg-primary".to_string(),
        connection_type: ConnectionType::PostgreSql,
        group: Some("production".to_string()),
        tags: vec!["database".to_string(), "critical".to_string()],
        favorite: true,
        host: Some("pg-primary.internal.example.com".to_string()),
        port: Some(5432),
        username: Some("app_user".to_string()),
        credential_id: Some(new_id()),
        database: Some("ventoos_production".to_string()),
        tunnel: TunnelType::None,
        status: ConnectionStatus::Available,
        is_temporary: false,
        source_resource_id: None,
        extra: json!({"ssl_mode": "require", "pool_size": 10}),
        created_at: now,
        updated_at: now,
        last_used_at: Some(now),
    };
    let json = serde_json::to_string(&conn).unwrap();
    let de: Connection = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "prod-pg-primary");
    assert_eq!(de.connection_type, ConnectionType::PostgreSql);
    assert_eq!(de.port, Some(5432));
    assert!(de.favorite);
    assert_eq!(de.tags.len(), 2);
}

#[test]
fn connection_with_ssh_tunnel() {
    let tunnel = TunnelType::Ssh(SshTunnelConfig {
        host: "bastion.example.com".to_string(),
        port: 22,
        username: "jump_user".to_string(),
        credential_id: Some(new_id()),
    });
    let json = serde_json::to_string(&tunnel).unwrap();
    let de: TunnelType = serde_json::from_str(&json).unwrap();
    if let TunnelType::Ssh(cfg) = de {
        assert_eq!(cfg.host, "bastion.example.com");
        assert_eq!(cfg.port, 22);
        assert_eq!(cfg.username, "jump_user");
        assert!(cfg.credential_id.is_some());
    } else {
        panic!("expected TunnelType::Ssh");
    }
}

#[test]
fn connection_with_http_tunnel() {
    let tunnel = TunnelType::Http(HttpTunnelConfig {
        proxy_url: "http://proxy.corp.example.com:8080".to_string(),
        credential_id: None,
    });
    let json = serde_json::to_string(&tunnel).unwrap();
    let de: TunnelType = serde_json::from_str(&json).unwrap();
    if let TunnelType::Http(cfg) = de {
        assert_eq!(cfg.proxy_url, "http://proxy.corp.example.com:8080");
        assert!(cfg.credential_id.is_none());
    } else {
        panic!("expected TunnelType::Http");
    }
}

#[test]
fn connection_kubernetes_type() {
    let now = Utc::now();
    let conn = Connection {
        id: new_id(),
        name: "k8s-staging".to_string(),
        connection_type: ConnectionType::Kubernetes,
        group: Some("infra".to_string()),
        tags: vec!["k8s".to_string()],
        favorite: false,
        host: Some("https://k8s-api.staging.example.com:6443".to_string()),
        port: Some(6443),
        username: None,
        credential_id: Some(new_id()),
        database: None,
        tunnel: TunnelType::None,
        status: ConnectionStatus::Draft,
        is_temporary: false,
        source_resource_id: None,
        extra: json!({"context": "staging-cluster", "namespace": "default"}),
        created_at: now,
        updated_at: now,
        last_used_at: None,
    };
    let json = serde_json::to_string(&conn).unwrap();
    let de: Connection = serde_json::from_str(&json).unwrap();
    assert_eq!(de.connection_type, ConnectionType::Kubernetes);
    assert_eq!(de.status, ConnectionStatus::Draft);
}

#[test]
fn connection_redis_s3_mysql_roundtrip() {
    for (ct, host, port, db) in [
        (
            ConnectionType::Redis,
            "redis-cluster.example.com",
            6379u16,
            None,
        ),
        (
            ConnectionType::S3,
            "s3.amazonaws.com",
            443,
            Some("my-bucket"),
        ),
        (
            ConnectionType::MySql,
            "mysql.internal.example.com",
            3306,
            Some("app_db"),
        ),
    ] {
        let now = Utc::now();
        let conn = Connection {
            id: new_id(),
            name: format!("test-{:?}", ct),
            connection_type: ct.clone(),
            group: None,
            tags: vec![],
            favorite: false,
            host: Some(host.to_string()),
            port: Some(port),
            username: None,
            credential_id: None,
            database: db.map(String::from),
            tunnel: TunnelType::None,
            status: ConnectionStatus::Testing,
            is_temporary: true,
            source_resource_id: None,
            extra: serde_json::Value::Null,
            created_at: now,
            updated_at: now,
            last_used_at: None,
        };
        let json = serde_json::to_string(&conn).unwrap();
        let de: Connection = serde_json::from_str(&json).unwrap();
        assert_eq!(de.connection_type, ct);
        assert_eq!(de.port, Some(port));
    }
}

#[test]
fn create_connection_request_minimal() {
    let req = CreateConnectionRequest {
        name: "temp-sqlite".to_string(),
        connection_type: ConnectionType::Sqlite,
        group: None,
        tags: None,
        host: None,
        port: None,
        username: None,
        credential_id: None,
        database: Some("/var/lib/ventoos/app.db".to_string()),
        tunnel: None,
        extra: None,
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: CreateConnectionRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "temp-sqlite");
    assert_eq!(de.connection_type, ConnectionType::Sqlite);
}

#[test]
fn update_connection_request_partial() {
    let req = UpdateConnectionRequest {
        name: Some("renamed-connection".to_string()),
        group: None,
        tags: Some(vec!["updated".to_string()]),
        favorite: Some(true),
        host: None,
        port: None,
        username: None,
        credential_id: None,
        database: None,
        tunnel: None,
        extra: None,
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: UpdateConnectionRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name.unwrap(), "renamed-connection");
    assert_eq!(de.favorite, Some(true));
}

#[test]
fn connection_test_result_success_and_failure() {
    let success = ConnectionTestResult {
        success: true,
        message: "Connected to pg-primary.internal.example.com:5432".to_string(),
        latency_ms: Some(12),
    };
    let json = serde_json::to_string(&success).unwrap();
    let de: ConnectionTestResult = serde_json::from_str(&json).unwrap();
    assert!(de.success);
    assert_eq!(de.latency_ms, Some(12));

    let failure = ConnectionTestResult {
        success: false,
        message: "Connection refused: host unreachable".to_string(),
        latency_ms: None,
    };
    let json = serde_json::to_string(&failure).unwrap();
    let de: ConnectionTestResult = serde_json::from_str(&json).unwrap();
    assert!(!de.success);
    assert!(de.latency_ms.is_none());
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
    assert_eq!(ok.unwrap(), 42);

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

// ─── SSH ────────────────────────────────────────────────────────────

#[test]
fn ssh_auth_method_password() {
    let method = SshAuthMethod::Password {
        credential_id: Some(new_id()),
    };
    let json = serde_json::to_string(&method).unwrap();
    assert!(json.contains("\"type\":\"password\""));
    let de: SshAuthMethod = serde_json::from_str(&json).unwrap();
    if let SshAuthMethod::Password { credential_id } = de {
        assert!(credential_id.is_some());
    } else {
        panic!("expected Password variant");
    }
}

#[test]
fn ssh_auth_method_private_key() {
    let method = SshAuthMethod::PrivateKey {
        key_path: Some("/home/deploy/.ssh/id_ed25519".to_string()),
        credential_id: Some(new_id()),
        passphrase_credential_id: Some(new_id()),
    };
    let json = serde_json::to_string(&method).unwrap();
    assert!(json.contains("\"type\":\"private_key\""));
    let de: SshAuthMethod = serde_json::from_str(&json).unwrap();
    if let SshAuthMethod::PrivateKey {
        key_path,
        credential_id,
        passphrase_credential_id,
    } = de
    {
        assert_eq!(key_path.unwrap(), "/home/deploy/.ssh/id_ed25519");
        assert!(credential_id.is_some());
        assert!(passphrase_credential_id.is_some());
    } else {
        panic!("expected PrivateKey variant");
    }
}

#[test]
fn ssh_server_status_all_variants() {
    let variants = [
        SshServerStatus::Disconnected,
        SshServerStatus::Connecting,
        SshServerStatus::Connected,
        SshServerStatus::Error,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: SshServerStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn ssh_server_full_roundtrip() {
    let server = SshServer {
        id: new_id(),
        name: "production-bastion".to_string(),
        host: "bastion.prod.example.com".to_string(),
        port: 22,
        username: "deploy".to_string(),
        auth_method: SshAuthMethod::PrivateKey {
            key_path: Some("/opt/keys/deploy_key".to_string()),
            credential_id: None,
            passphrase_credential_id: None,
        },
        group: Some("production".to_string()),
        tags: vec!["bastion".to_string(), "jump-host".to_string()],
        status: SshServerStatus::Connected,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        last_connected_at: Some(Utc::now()),
    };
    let json = serde_json::to_string(&server).unwrap();
    let de: SshServer = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "production-bastion");
    assert_eq!(de.host, "bastion.prod.example.com");
    assert_eq!(de.port, 22);
    assert_eq!(de.status, SshServerStatus::Connected);
    assert_eq!(de.tags.len(), 2);
}

#[test]
fn port_mapping_roundtrip() {
    let pm = PortMapping {
        id: new_id(),
        name: "pg-tunnel".to_string(),
        ssh_server_id: new_id(),
        remote_host: "10.0.1.50".to_string(),
        remote_port: 5432,
        local_port: 15432,
        status: PortMappingStatus::Active,
        created_at: Utc::now(),
    };
    let json = serde_json::to_string(&pm).unwrap();
    let de: PortMapping = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "pg-tunnel");
    assert_eq!(de.remote_port, 5432);
    assert_eq!(de.local_port, 15432);
    assert_eq!(de.status, PortMappingStatus::Active);
}

#[test]
fn port_mapping_status_all_variants() {
    let variants = [
        PortMappingStatus::Stopped,
        PortMappingStatus::Starting,
        PortMappingStatus::Active,
        PortMappingStatus::Error,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: PortMappingStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn service_exposure_roundtrip() {
    let se = ServiceExposure {
        id: new_id(),
        name: "grafana-public".to_string(),
        source_type: ServiceSourceType::Ssh,
        ssh_server_id: Some(new_id()),
        source_host: "127.0.0.1".to_string(),
        source_port: 3000,
        public_port: 9090,
        basic_auth_enabled: true,
        basic_auth_username: Some("viewer".to_string()),
        basic_auth_credential_id: Some(new_id()),
        status: ServiceExposureStatus::Active,
        created_at: Utc::now(),
    };
    let json = serde_json::to_string(&se).unwrap();
    let de: ServiceExposure = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "grafana-public");
    assert_eq!(de.source_type, ServiceSourceType::Ssh);
    assert_eq!(de.source_port, 3000);
    assert_eq!(de.public_port, 9090);
    assert!(de.basic_auth_enabled);
}

#[test]
fn service_source_type_all_variants() {
    let variants = [ServiceSourceType::Local, ServiceSourceType::Ssh];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: ServiceSourceType = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn service_exposure_status_all_variants() {
    let variants = [
        ServiceExposureStatus::Stopped,
        ServiceExposureStatus::Starting,
        ServiceExposureStatus::Active,
        ServiceExposureStatus::Error,
    ];
    for v in &variants {
        let json = serde_json::to_string(v).unwrap();
        let de: ServiceExposureStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(&de, v);
    }
}

#[test]
fn webshell_target_local() {
    let target = WebShellTarget::Local;
    let json = serde_json::to_string(&target).unwrap();
    assert!(json.contains("\"type\":\"local\""));
    let de: WebShellTarget = serde_json::from_str(&json).unwrap();
    assert!(matches!(de, WebShellTarget::Local));
}

#[test]
fn webshell_target_ssh() {
    let server_id = new_id();
    let target = WebShellTarget::Ssh { server_id };
    let json = serde_json::to_string(&target).unwrap();
    assert!(json.contains("\"type\":\"ssh\""));
    let de: WebShellTarget = serde_json::from_str(&json).unwrap();
    if let WebShellTarget::Ssh {
        server_id: de_id, ..
    } = de
    {
        assert_eq!(de_id, server_id);
    } else {
        panic!("expected Ssh variant");
    }
}

#[test]
fn webshell_request_roundtrip() {
    let req = WebShellRequest {
        target: WebShellTarget::Local,
        cols: Some(120),
        rows: Some(40),
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: WebShellRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.cols, Some(120));
    assert_eq!(de.rows, Some(40));
}

// ─── Task ───────────────────────────────────────────────────────────

#[test]
fn task_status_all_variants_roundtrip() {
    let variants = [
        (TaskStatus::Queued, "\"queued\""),
        (TaskStatus::Running, "\"running\""),
        (
            TaskStatus::WaitingConfirmation,
            "\"waiting_confirmation\"",
        ),
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
        result: Some(json!({"bytes_written": 1048576})),
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
    assert_eq!(de.result.unwrap()["bytes_written"], 1048576);
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
fn paginated_response_with_connections() {
    let now = Utc::now();
    let items: Vec<Connection> = (0..3)
        .map(|i| Connection {
            id: new_id(),
            name: format!("conn-{}", i),
            connection_type: ConnectionType::Redis,
            group: None,
            tags: vec![],
            favorite: false,
            host: Some(format!("redis-{}.example.com", i)),
            port: Some(6379),
            username: None,
            credential_id: None,
            database: None,
            tunnel: TunnelType::None,
            status: ConnectionStatus::Available,
            is_temporary: false,
            source_resource_id: None,
            extra: serde_json::Value::Null,
            created_at: now,
            updated_at: now,
            last_used_at: None,
        })
        .collect();

    let resp = PaginatedResponse {
        items,
        total: 25,
        page: 1,
        page_size: 3,
    };
    let json = serde_json::to_string(&resp).unwrap();
    let de: PaginatedResponse<Connection> = serde_json::from_str(&json).unwrap();
    assert_eq!(de.items.len(), 3);
    assert_eq!(de.total, 25);
    assert_eq!(de.page, 1);
    assert_eq!(de.page_size, 3);
    assert_eq!(de.items[0].name, "conn-0");
    assert_eq!(de.items[2].name, "conn-2");
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
        id: new_id(),
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
    assert_eq!(de.x, 150.5);
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
fn edge_case_special_characters_in_names() {
    let conn = CreateConnectionRequest {
        name: "prod/pg (主数据库) — André's server <&>".to_string(),
        connection_type: ConnectionType::PostgreSql,
        group: Some("生产环境/数据库".to_string()),
        tags: Some(vec![
            "中文标签".to_string(),
            "emoji-🚀".to_string(),
            "back\\slash".to_string(),
        ]),
        host: Some("db.例え.jp".to_string()),
        port: Some(5432),
        username: Some("user@domain".to_string()),
        credential_id: None,
        database: Some("db-with-dashes_and_underscores".to_string()),
        tunnel: None,
        extra: Some(json!({"note": "contains \"quotes\" and\nnewlines"})),
    };
    let json = serde_json::to_string(&conn).unwrap();
    let de: CreateConnectionRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "prod/pg (主数据库) — André's server <&>");
    assert_eq!(de.tags.unwrap()[1], "emoji-🚀");
}

#[test]
fn edge_case_max_u16_port() {
    let req = CreateConnectionRequest {
        name: "max-port".to_string(),
        connection_type: ConnectionType::Redis,
        group: None,
        tags: None,
        host: Some("localhost".to_string()),
        port: Some(u16::MAX),
        username: None,
        credential_id: None,
        database: None,
        tunnel: None,
        extra: None,
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: CreateConnectionRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.port, Some(u16::MAX));
}

#[test]
fn edge_case_empty_tags_and_strings() {
    let now = Utc::now();
    let conn = Connection {
        id: new_id(),
        name: String::new(),
        connection_type: ConnectionType::Ftp,
        group: Some(String::new()),
        tags: vec![],
        favorite: false,
        host: Some(String::new()),
        port: Some(0),
        username: Some(String::new()),
        credential_id: None,
        database: None,
        tunnel: TunnelType::None,
        status: ConnectionStatus::Draft,
        is_temporary: false,
        source_resource_id: None,
        extra: serde_json::Value::Null,
        created_at: now,
        updated_at: now,
        last_used_at: None,
    };
    let json = serde_json::to_string(&conn).unwrap();
    let de: Connection = serde_json::from_str(&json).unwrap();
    assert!(de.name.is_empty());
    assert_eq!(de.port, Some(0));
    assert!(de.tags.is_empty());
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
        id: new_id(),
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
    assert_eq!(de.x, 0.0);
    assert_eq!(de.width, 0.0);
    assert_eq!(de.z_index, 0);
}

// ─── Cross-module integration ───────────────────────────────────────

#[test]
fn api_response_with_paginated_tasks() {
    let now = Utc::now();
    let tasks: Vec<Task> = (0..2)
        .map(|i| Task {
            id: new_id(),
            name: format!("task-{}", i),
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

#[test]
fn create_ssh_server_request_roundtrip() {
    let req = CreateSshServerRequest {
        name: "staging-web-01".to_string(),
        host: "10.20.30.40".to_string(),
        port: Some(2222),
        username: "admin".to_string(),
        auth_method: SshAuthMethod::Password {
            credential_id: None,
        },
        group: Some("staging".to_string()),
        tags: Some(vec!["web".to_string(), "nginx".to_string()]),
        password: Some("temp-password-for-creation".to_string()),
        private_key: None,
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: CreateSshServerRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "staging-web-01");
    assert_eq!(de.port, Some(2222));
}

#[test]
fn update_ssh_server_request_partial() {
    let req = UpdateSshServerRequest {
        name: None,
        host: Some("new-host.example.com".to_string()),
        port: Some(22),
        username: None,
        auth_method: None,
        group: None,
        tags: None,
        password: None,
        private_key: None,
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: UpdateSshServerRequest = serde_json::from_str(&json).unwrap();
    assert!(de.name.is_none());
    assert_eq!(de.host.unwrap(), "new-host.example.com");
}

#[test]
fn create_service_exposure_request_roundtrip() {
    let req = CreateServiceExposureRequest {
        name: "dev-api-expose".to_string(),
        source_type: ServiceSourceType::Local,
        ssh_server_id: None,
        source_host: "127.0.0.1".to_string(),
        source_port: 8080,
        public_port: 18080,
        basic_auth_enabled: false,
        basic_auth_username: None,
        basic_auth_password: None,
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: CreateServiceExposureRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "dev-api-expose");
    assert_eq!(de.source_type, ServiceSourceType::Local);
    assert!(!de.basic_auth_enabled);
}

#[test]
fn create_port_mapping_request_roundtrip() {
    let req = CreatePortMappingRequest {
        name: "mysql-tunnel-staging".to_string(),
        ssh_server_id: new_id(),
        remote_host: "mysql.staging.internal".to_string(),
        remote_port: 3306,
        local_port: 13306,
    };
    let json = serde_json::to_string(&req).unwrap();
    let de: CreatePortMappingRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(de.name, "mysql-tunnel-staging");
    assert_eq!(de.remote_port, 3306);
    assert_eq!(de.local_port, 13306);
}
