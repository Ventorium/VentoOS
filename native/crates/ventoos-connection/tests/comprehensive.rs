use serde_json::json;
use ventoos_connection::ConnectionManager;
use ventoos_core::connection::*;
use ventoos_core::types::*;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn minimal_request(name: &str, ct: ConnectionType) -> CreateConnectionRequest {
    CreateConnectionRequest {
        name: name.to_string(),
        connection_type: ct,
        group: None,
        tags: None,
        host: None,
        port: None,
        username: None,
        credential_id: None,
        database: None,
        tunnel: None,
        extra: None,
    }
}

fn full_request(name: &str, ct: ConnectionType) -> CreateConnectionRequest {
    CreateConnectionRequest {
        name: name.to_string(),
        connection_type: ct,
        group: Some("production".to_string()),
        tags: Some(vec!["critical".to_string(), "monitored".to_string()]),
        host: Some("db.example.com".to_string()),
        port: Some(5432),
        username: Some("admin".to_string()),
        credential_id: Some(new_id()),
        database: Some("app_db".to_string()),
        tunnel: Some(TunnelType::Ssh(SshTunnelConfig {
            host: "bastion.example.com".to_string(),
            port: 22,
            username: "tunnel_user".to_string(),
            credential_id: Some(new_id()),
        })),
        extra: Some(json!({"ssl": true, "timeout": 30})),
    }
}

fn empty_update() -> UpdateConnectionRequest {
    UpdateConnectionRequest {
        name: None,
        group: None,
        tags: None,
        favorite: None,
        host: None,
        port: None,
        username: None,
        credential_id: None,
        database: None,
        tunnel: None,
        extra: None,
    }
}

// ===========================================================================
// 1. Create connections of ALL types
// ===========================================================================

#[tokio::test]
async fn create_kubernetes_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("k8s", ConnectionType::Kubernetes)).await;
    assert_eq!(conn.connection_type, ConnectionType::Kubernetes);
}

#[tokio::test]
async fn create_teleport_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("teleport", ConnectionType::Teleport)).await;
    assert_eq!(conn.connection_type, ConnectionType::Teleport);
}

#[tokio::test]
async fn create_postgresql_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    assert_eq!(conn.connection_type, ConnectionType::PostgreSql);
}

#[tokio::test]
async fn create_mysql_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("mysql", ConnectionType::MySql)).await;
    assert_eq!(conn.connection_type, ConnectionType::MySql);
}

#[tokio::test]
async fn create_sqlite_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("sqlite", ConnectionType::Sqlite)).await;
    assert_eq!(conn.connection_type, ConnectionType::Sqlite);
}

#[tokio::test]
async fn create_redis_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("redis", ConnectionType::Redis)).await;
    assert_eq!(conn.connection_type, ConnectionType::Redis);
}

#[tokio::test]
async fn create_ssh_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("ssh", ConnectionType::Ssh)).await;
    assert_eq!(conn.connection_type, ConnectionType::Ssh);
}

#[tokio::test]
async fn create_sftp_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("sftp", ConnectionType::Sftp)).await;
    assert_eq!(conn.connection_type, ConnectionType::Sftp);
}

#[tokio::test]
async fn create_ftp_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("ftp", ConnectionType::Ftp)).await;
    assert_eq!(conn.connection_type, ConnectionType::Ftp);
}

#[tokio::test]
async fn create_smb_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("smb", ConnectionType::Smb)).await;
    assert_eq!(conn.connection_type, ConnectionType::Smb);
}

#[tokio::test]
async fn create_s3_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("s3", ConnectionType::S3)).await;
    assert_eq!(conn.connection_type, ConnectionType::S3);
}

// ===========================================================================
// 2. Get existing and non-existing connections
// ===========================================================================

#[tokio::test]
async fn get_existing_connection() {
    let mgr = ConnectionManager::new();
    let created = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let fetched = mgr.get(created.id).await;
    assert!(fetched.is_some());
    let fetched = fetched.unwrap();
    assert_eq!(fetched.id, created.id);
    assert_eq!(fetched.name, "pg");
}

#[tokio::test]
async fn get_non_existing_connection_returns_none() {
    let mgr = ConnectionManager::new();
    assert!(mgr.get(new_id()).await.is_none());
}

// ===========================================================================
// 3–4. Update individual fields / update non-existing returns None
// ===========================================================================

#[tokio::test]
async fn update_name() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("old", ConnectionType::Redis)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            name: Some("new".to_string()),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.name, "new");
}

#[tokio::test]
async fn update_group() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            group: Some("staging".to_string()),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.group, Some("staging".to_string()));
}

#[tokio::test]
async fn update_tags() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            tags: Some(vec!["a".to_string(), "b".to_string()]),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.tags, vec!["a".to_string(), "b".to_string()]);
}

#[tokio::test]
async fn update_favorite() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    assert!(!conn.favorite);
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            favorite: Some(true),
            ..empty_update()
        })
        .await
        .unwrap();
    assert!(updated.favorite);
}

#[tokio::test]
async fn update_host() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            host: Some("10.0.0.1".to_string()),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.host, Some("10.0.0.1".to_string()));
}

#[tokio::test]
async fn update_port() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            port: Some(3306),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.port, Some(3306));
}

#[tokio::test]
async fn update_username() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            username: Some("root".to_string()),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.username, Some("root".to_string()));
}

#[tokio::test]
async fn update_credential_id() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let cred = new_id();
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            credential_id: Some(cred),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.credential_id, Some(cred));
}

#[tokio::test]
async fn update_database() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            database: Some("analytics".to_string()),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.database, Some("analytics".to_string()));
}

#[tokio::test]
async fn update_tunnel() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            tunnel: Some(TunnelType::Ssh(SshTunnelConfig {
                host: "bastion.local".to_string(),
                port: 2222,
                username: "jump".to_string(),
                credential_id: None,
            })),
            ..empty_update()
        })
        .await
        .unwrap();
    match &updated.tunnel {
        TunnelType::Ssh(cfg) => {
            assert_eq!(cfg.host, "bastion.local");
            assert_eq!(cfg.port, 2222);
        }
        _ => panic!("expected SSH tunnel"),
    }
}

#[tokio::test]
async fn update_extra() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            extra: Some(json!({"pool_size": 10})),
            ..empty_update()
        })
        .await
        .unwrap();
    assert_eq!(updated.extra, json!({"pool_size": 10}));
}

#[tokio::test]
async fn update_non_existing_returns_none() {
    let mgr = ConnectionManager::new();
    let result = mgr.update(new_id(), empty_update()).await;
    assert!(result.is_none());
}

// ===========================================================================
// 5. Delete existing and non-existing connections
// ===========================================================================

#[tokio::test]
async fn delete_existing_connection() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    assert!(mgr.delete(conn.id).await);
    assert!(mgr.get(conn.id).await.is_none());
}

#[tokio::test]
async fn delete_non_existing_returns_false() {
    let mgr = ConnectionManager::new();
    assert!(!mgr.delete(new_id()).await);
}

// ===========================================================================
// 6–7. List sorted by name / list empty
// ===========================================================================

#[tokio::test]
async fn list_returns_sorted_by_name() {
    let mgr = ConnectionManager::new();
    mgr.create(minimal_request("charlie", ConnectionType::Redis)).await;
    mgr.create(minimal_request("alpha", ConnectionType::Ssh)).await;
    mgr.create(minimal_request("bravo", ConnectionType::Ftp)).await;

    let list = mgr.list().await;
    assert_eq!(list.len(), 3);
    assert_eq!(list[0].name, "alpha");
    assert_eq!(list[1].name, "bravo");
    assert_eq!(list[2].name, "charlie");
}

#[tokio::test]
async fn list_empty_returns_empty_vec() {
    let mgr = ConnectionManager::new();
    let list = mgr.list().await;
    assert!(list.is_empty());
}

// ===========================================================================
// 8. Test connection for existing and non-existing
// ===========================================================================

#[tokio::test]
async fn test_connection_existing() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("pg", ConnectionType::PostgreSql)).await;
    let result = mgr.test_connection(conn.id).await;
    assert!(result.is_some());
    let result = result.unwrap();
    assert!(result.success);
    assert!(result.latency_ms.is_some());
}

#[tokio::test]
async fn test_connection_non_existing_returns_none() {
    let mgr = ConnectionManager::new();
    assert!(mgr.test_connection(new_id()).await.is_none());
}

// ===========================================================================
// 9. Concurrent creation
// ===========================================================================

#[tokio::test]
async fn concurrent_creation() {
    let mgr = std::sync::Arc::new(ConnectionManager::new());
    let mut handles = Vec::new();
    for i in 0..20 {
        let mgr = mgr.clone();
        handles.push(tokio::spawn(async move {
            mgr.create(minimal_request(&format!("conn-{i}"), ConnectionType::Redis))
                .await
        }));
    }
    for h in handles {
        h.await.unwrap();
    }
    let list = mgr.list().await;
    assert_eq!(list.len(), 20);
}

// ===========================================================================
// 10. Concurrent read/write
// ===========================================================================

#[tokio::test]
async fn concurrent_read_write() {
    let mgr = std::sync::Arc::new(ConnectionManager::new());

    // Seed some data
    for i in 0..5 {
        mgr.create(minimal_request(&format!("seed-{i}"), ConnectionType::Ssh))
            .await;
    }

    let mut handles = Vec::new();
    // Writers
    for i in 0..10 {
        let mgr = mgr.clone();
        handles.push(tokio::spawn(async move {
            mgr.create(minimal_request(&format!("new-{i}"), ConnectionType::Redis))
                .await;
        }));
    }
    // Readers
    for _ in 0..10 {
        let mgr = mgr.clone();
        handles.push(tokio::spawn(async move {
            let _ = mgr.list().await;
        }));
    }
    for h in handles {
        h.await.unwrap();
    }
    let list = mgr.list().await;
    assert_eq!(list.len(), 15);
}

// ===========================================================================
// 11. Create with all optional fields filled
// ===========================================================================

#[tokio::test]
async fn create_with_all_fields() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(full_request("full-pg", ConnectionType::PostgreSql)).await;
    assert_eq!(conn.name, "full-pg");
    assert_eq!(conn.group, Some("production".to_string()));
    assert_eq!(conn.tags, vec!["critical".to_string(), "monitored".to_string()]);
    assert_eq!(conn.host, Some("db.example.com".to_string()));
    assert_eq!(conn.port, Some(5432));
    assert_eq!(conn.username, Some("admin".to_string()));
    assert!(conn.credential_id.is_some());
    assert_eq!(conn.database, Some("app_db".to_string()));
    match &conn.tunnel {
        TunnelType::Ssh(cfg) => assert_eq!(cfg.host, "bastion.example.com"),
        _ => panic!("expected SSH tunnel"),
    }
    assert_eq!(conn.extra, json!({"ssl": true, "timeout": 30}));
}

// ===========================================================================
// 12. Create with minimal fields
// ===========================================================================

#[tokio::test]
async fn create_with_minimal_fields() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("bare", ConnectionType::Sqlite)).await;
    assert_eq!(conn.name, "bare");
    assert_eq!(conn.connection_type, ConnectionType::Sqlite);
    assert_eq!(conn.group, None);
    assert!(conn.tags.is_empty());
    assert!(!conn.favorite);
    assert_eq!(conn.host, None);
    assert_eq!(conn.port, None);
    assert_eq!(conn.username, None);
    assert_eq!(conn.credential_id, None);
    assert_eq!(conn.database, None);
    assert!(matches!(conn.tunnel, TunnelType::None));
    assert_eq!(conn.extra, serde_json::Value::Null);
}

// ===========================================================================
// 13. Update with empty request (no changes)
// ===========================================================================

#[tokio::test]
async fn update_with_empty_request_preserves_all() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(full_request("full", ConnectionType::PostgreSql)).await;
    let updated = mgr.update(conn.id, empty_update()).await.unwrap();
    assert_eq!(updated.name, conn.name);
    assert_eq!(updated.group, conn.group);
    assert_eq!(updated.tags, conn.tags);
    assert_eq!(updated.favorite, conn.favorite);
    assert_eq!(updated.host, conn.host);
    assert_eq!(updated.port, conn.port);
    assert_eq!(updated.username, conn.username);
    assert_eq!(updated.credential_id, conn.credential_id);
    assert_eq!(updated.database, conn.database);
    assert_eq!(updated.extra, conn.extra);
}

// ===========================================================================
// 14. Update preserves fields not in request
// ===========================================================================

#[tokio::test]
async fn update_preserves_untouched_fields() {
    let mgr = ConnectionManager::new();
    let conn = mgr
        .create(CreateConnectionRequest {
            name: "preserve-test".to_string(),
            connection_type: ConnectionType::MySql,
            group: Some("dev".to_string()),
            tags: Some(vec!["tag1".to_string()]),
            host: Some("myhost".to_string()),
            port: Some(3306),
            username: Some("user1".to_string()),
            credential_id: None,
            database: Some("mydb".to_string()),
            tunnel: None,
            extra: Some(json!({"key": "value"})),
        })
        .await;

    // Update only name
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            name: Some("new-name".to_string()),
            ..empty_update()
        })
        .await
        .unwrap();

    assert_eq!(updated.name, "new-name");
    // Everything else unchanged
    assert_eq!(updated.group, Some("dev".to_string()));
    assert_eq!(updated.tags, vec!["tag1".to_string()]);
    assert_eq!(updated.host, Some("myhost".to_string()));
    assert_eq!(updated.port, Some(3306));
    assert_eq!(updated.username, Some("user1".to_string()));
    assert_eq!(updated.database, Some("mydb".to_string()));
    assert_eq!(updated.extra, json!({"key": "value"}));
}

// ===========================================================================
// 15. Create with tunnel configuration
// ===========================================================================

#[tokio::test]
async fn create_with_ssh_tunnel() {
    let mgr = ConnectionManager::new();
    let cred_id = new_id();
    let conn = mgr
        .create(CreateConnectionRequest {
            name: "tunneled".to_string(),
            connection_type: ConnectionType::PostgreSql,
            group: None,
            tags: None,
            host: Some("10.0.0.5".to_string()),
            port: Some(5432),
            username: None,
            credential_id: None,
            database: None,
            tunnel: Some(TunnelType::Ssh(SshTunnelConfig {
                host: "jump.example.com".to_string(),
                port: 22,
                username: "jump_user".to_string(),
                credential_id: Some(cred_id),
            })),
            extra: None,
        })
        .await;

    match &conn.tunnel {
        TunnelType::Ssh(cfg) => {
            assert_eq!(cfg.host, "jump.example.com");
            assert_eq!(cfg.port, 22);
            assert_eq!(cfg.username, "jump_user");
            assert_eq!(cfg.credential_id, Some(cred_id));
        }
        _ => panic!("expected SSH tunnel"),
    }
}

#[tokio::test]
async fn create_with_http_tunnel() {
    let mgr = ConnectionManager::new();
    let conn = mgr
        .create(CreateConnectionRequest {
            name: "http-tunneled".to_string(),
            connection_type: ConnectionType::MySql,
            group: None,
            tags: None,
            host: None,
            port: None,
            username: None,
            credential_id: None,
            database: None,
            tunnel: Some(TunnelType::Http(HttpTunnelConfig {
                proxy_url: "http://proxy.local:8080".to_string(),
                credential_id: None,
            })),
            extra: None,
        })
        .await;

    match &conn.tunnel {
        TunnelType::Http(cfg) => {
            assert_eq!(cfg.proxy_url, "http://proxy.local:8080");
        }
        _ => panic!("expected HTTP tunnel"),
    }
}

// ===========================================================================
// 16. Create with extra JSON metadata
// ===========================================================================

#[tokio::test]
async fn create_with_complex_extra_json() {
    let mgr = ConnectionManager::new();
    let extra = json!({
        "ssl_mode": "verify-full",
        "ca_cert_path": "/certs/ca.pem",
        "options": {
            "connect_timeout": 10,
            "application_name": "ventoos"
        },
        "labels": ["high-priority", "production"]
    });
    let conn = mgr
        .create(CreateConnectionRequest {
            name: "complex-extra".to_string(),
            connection_type: ConnectionType::PostgreSql,
            group: None,
            tags: None,
            host: None,
            port: None,
            username: None,
            credential_id: None,
            database: None,
            tunnel: None,
            extra: Some(extra.clone()),
        })
        .await;
    assert_eq!(conn.extra, extra);
    assert_eq!(conn.extra["ssl_mode"], "verify-full");
    assert_eq!(conn.extra["options"]["connect_timeout"], 10);
}

// ===========================================================================
// 17. Connection with every ConnectionType variant (covered in create_* above,
//     but also verify names persisted via get)
// ===========================================================================

#[tokio::test]
async fn all_connection_types_round_trip() {
    let mgr = ConnectionManager::new();
    let types = vec![
        ("k8s", ConnectionType::Kubernetes),
        ("teleport", ConnectionType::Teleport),
        ("pg", ConnectionType::PostgreSql),
        ("mysql", ConnectionType::MySql),
        ("sqlite", ConnectionType::Sqlite),
        ("redis", ConnectionType::Redis),
        ("ssh", ConnectionType::Ssh),
        ("sftp", ConnectionType::Sftp),
        ("ftp", ConnectionType::Ftp),
        ("smb", ConnectionType::Smb),
        ("s3", ConnectionType::S3),
    ];
    for (name, ct) in &types {
        let created = mgr.create(minimal_request(name, ct.clone())).await;
        let fetched = mgr.get(created.id).await.unwrap();
        assert_eq!(fetched.connection_type, *ct);
        assert_eq!(fetched.name, *name);
    }
    assert_eq!(mgr.list().await.len(), 11);
}

// ===========================================================================
// 18. Verify timestamps: created_at, updated_at set on create
// ===========================================================================

#[tokio::test]
async fn timestamps_set_on_create() {
    let mgr = ConnectionManager::new();
    let before = chrono::Utc::now();
    let conn = mgr.create(minimal_request("ts", ConnectionType::Redis)).await;
    let after = chrono::Utc::now();

    assert!(conn.created_at >= before && conn.created_at <= after);
    assert!(conn.updated_at >= before && conn.updated_at <= after);
    assert_eq!(conn.created_at, conn.updated_at);
    assert!(conn.last_used_at.is_none());
}

// ===========================================================================
// 19. Verify update changes updated_at but not created_at
// ===========================================================================

#[tokio::test]
async fn update_changes_updated_at_not_created_at() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("ts-update", ConnectionType::Redis)).await;
    let original_created = conn.created_at;
    let original_updated = conn.updated_at;

    // Small delay to ensure time difference
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;

    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            name: Some("ts-update-v2".to_string()),
            ..empty_update()
        })
        .await
        .unwrap();

    assert_eq!(updated.created_at, original_created);
    assert!(updated.updated_at > original_updated);
}

// ===========================================================================
// 20. Delete twice returns false on second call
// ===========================================================================

#[tokio::test]
async fn delete_twice_second_returns_false() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("del", ConnectionType::Ssh)).await;
    assert!(mgr.delete(conn.id).await);
    assert!(!mgr.delete(conn.id).await);
}

// ===========================================================================
// 21. Default trait implementation works
// ===========================================================================

#[tokio::test]
async fn default_trait_creates_empty_manager() {
    let mgr = ConnectionManager::default();
    assert!(mgr.list().await.is_empty());
}

// ===========================================================================
// 22. Large batch operations (100+ connections)
// ===========================================================================

#[tokio::test]
async fn large_batch_create_and_list() {
    let mgr = ConnectionManager::new();
    let count = 150;
    for i in 0..count {
        mgr.create(minimal_request(&format!("conn-{i:04}"), ConnectionType::Redis))
            .await;
    }
    let list = mgr.list().await;
    assert_eq!(list.len(), count);
    // Verify sorted
    for i in 1..list.len() {
        assert!(list[i - 1].name <= list[i].name);
    }
}

// ===========================================================================
// Additional edge-case tests
// ===========================================================================

#[tokio::test]
async fn create_returns_draft_status() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("draft", ConnectionType::Ssh)).await;
    assert_eq!(conn.status, ConnectionStatus::Draft);
}

#[tokio::test]
async fn create_sets_is_temporary_false() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("temp", ConnectionType::Ssh)).await;
    assert!(!conn.is_temporary);
}

#[tokio::test]
async fn create_sets_source_resource_id_none() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("src", ConnectionType::Ssh)).await;
    assert!(conn.source_resource_id.is_none());
}

#[tokio::test]
async fn get_after_update_returns_updated_data() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("before", ConnectionType::Redis)).await;
    mgr.update(conn.id, UpdateConnectionRequest {
        name: Some("after".to_string()),
        favorite: Some(true),
        ..empty_update()
    })
    .await;

    let fetched = mgr.get(conn.id).await.unwrap();
    assert_eq!(fetched.name, "after");
    assert!(fetched.favorite);
}

#[tokio::test]
async fn delete_removes_from_list() {
    let mgr = ConnectionManager::new();
    let c1 = mgr.create(minimal_request("a", ConnectionType::Redis)).await;
    mgr.create(minimal_request("b", ConnectionType::Redis)).await;
    assert_eq!(mgr.list().await.len(), 2);

    mgr.delete(c1.id).await;
    let list = mgr.list().await;
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "b");
}

#[tokio::test]
async fn update_multiple_fields_at_once() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("multi", ConnectionType::MySql)).await;
    let updated = mgr
        .update(conn.id, UpdateConnectionRequest {
            name: Some("multi-updated".to_string()),
            group: Some("staging".to_string()),
            tags: Some(vec!["t1".to_string()]),
            favorite: Some(true),
            host: Some("new-host".to_string()),
            port: Some(9999),
            username: Some("newuser".to_string()),
            credential_id: None,
            database: Some("newdb".to_string()),
            tunnel: None,
            extra: Some(json!({"changed": true})),
        })
        .await
        .unwrap();

    assert_eq!(updated.name, "multi-updated");
    assert_eq!(updated.group, Some("staging".to_string()));
    assert_eq!(updated.tags, vec!["t1".to_string()]);
    assert!(updated.favorite);
    assert_eq!(updated.host, Some("new-host".to_string()));
    assert_eq!(updated.port, Some(9999));
    assert_eq!(updated.username, Some("newuser".to_string()));
    assert_eq!(updated.database, Some("newdb".to_string()));
    assert_eq!(updated.extra, json!({"changed": true}));
}

#[tokio::test]
async fn each_connection_gets_unique_id() {
    let mgr = ConnectionManager::new();
    let c1 = mgr.create(minimal_request("a", ConnectionType::Redis)).await;
    let c2 = mgr.create(minimal_request("b", ConnectionType::Redis)).await;
    let c3 = mgr.create(minimal_request("c", ConnectionType::Redis)).await;
    assert_ne!(c1.id, c2.id);
    assert_ne!(c2.id, c3.id);
    assert_ne!(c1.id, c3.id);
}

#[tokio::test]
async fn list_after_delete_all() {
    let mgr = ConnectionManager::new();
    let c1 = mgr.create(minimal_request("a", ConnectionType::Redis)).await;
    let c2 = mgr.create(minimal_request("b", ConnectionType::Ssh)).await;
    mgr.delete(c1.id).await;
    mgr.delete(c2.id).await;
    assert!(mgr.list().await.is_empty());
}

#[tokio::test]
async fn concurrent_delete() {
    let mgr = std::sync::Arc::new(ConnectionManager::new());
    let conn = mgr.create(minimal_request("victim", ConnectionType::Redis)).await;
    let id = conn.id;

    let mgr1 = mgr.clone();
    let mgr2 = mgr.clone();
    let (r1, r2) = tokio::join!(
        tokio::spawn(async move { mgr1.delete(id).await }),
        tokio::spawn(async move { mgr2.delete(id).await }),
    );
    // Exactly one should succeed
    let results = vec![r1.unwrap(), r2.unwrap()];
    assert_eq!(results.iter().filter(|r| **r).count(), 1);
    assert_eq!(results.iter().filter(|r| !**r).count(), 1);
}

#[tokio::test]
async fn test_connection_result_contents() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("stub", ConnectionType::S3)).await;
    let result = mgr.test_connection(conn.id).await.unwrap();
    assert!(result.success);
    assert!(!result.message.is_empty());
    assert_eq!(result.latency_ms, Some(42));
}

#[tokio::test]
async fn create_with_none_tunnel_defaults_to_none_variant() {
    let mgr = ConnectionManager::new();
    let conn = mgr
        .create(CreateConnectionRequest {
            name: "no-tunnel".to_string(),
            connection_type: ConnectionType::Redis,
            group: None,
            tags: None,
            host: None,
            port: None,
            username: None,
            credential_id: None,
            database: None,
            tunnel: None,
            extra: None,
        })
        .await;
    assert!(matches!(conn.tunnel, TunnelType::None));
}

#[tokio::test]
async fn create_with_none_tags_defaults_to_empty_vec() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("no-tags", ConnectionType::Ftp)).await;
    assert!(conn.tags.is_empty());
}

#[tokio::test]
async fn create_with_none_extra_defaults_to_null() {
    let mgr = ConnectionManager::new();
    let conn = mgr.create(minimal_request("no-extra", ConnectionType::Smb)).await;
    assert_eq!(conn.extra, serde_json::Value::Null);
}
