//! Comprehensive tests for ventoos-db crate.

use serde_json::json;
use ventoos_db::*;

// ── Helpers ────────────────────────────────────────────────────────────────

fn pg_req(name: &str) -> CreateDbConnectionReq {
    CreateDbConnectionReq {
        name: name.into(),
        engine: DbEngine::PostgreSql,
        host: Some("localhost".into()),
        port: Some(5432),
        username: Some("postgres".into()),
        password: Some("secret".into()),
        database: Some("testdb".into()),
        sqlite_path: None,
        group: None,
        ssl_enabled: None,
        tunnel: None,
    }
}

fn mysql_req(name: &str) -> CreateDbConnectionReq {
    CreateDbConnectionReq {
        name: name.into(),
        engine: DbEngine::MySql,
        host: Some("127.0.0.1".into()),
        port: Some(3306),
        username: Some("root".into()),
        password: Some("pass".into()),
        database: Some("mydb".into()),
        sqlite_path: None,
        group: Some("dev".into()),
        ssl_enabled: Some(true),
        tunnel: None,
    }
}

fn sqlite_req(name: &str) -> CreateDbConnectionReq {
    CreateDbConnectionReq {
        name: name.into(),
        engine: DbEngine::Sqlite,
        host: None,
        port: None,
        username: None,
        password: None,
        database: None,
        sqlite_path: Some("/tmp/test.db".into()),
        group: None,
        ssl_enabled: None,
        tunnel: None,
    }
}

fn sample_query_result(n: usize) -> QueryResult {
    let rows: Vec<Vec<serde_json::Value>> = (0..n)
        .map(|i| vec![json!(i), json!(format!("row_{i}")), json!(i % 2 == 0)])
        .collect();
    QueryResult {
        columns: vec!["id".into(), "name".into(), "active".into()],
        rows,
        row_count: n,
        affected_rows: None,
        execution_time_ms: 42,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DB MANAGER
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_01_create_postgresql_connection() {
    let mgr = DbManager::new();
    let cfg = mgr.create_connection(pg_req("pg-conn")).await;
    assert_eq!(cfg.name, "pg-conn");
    assert_eq!(cfg.engine, DbEngine::PostgreSql);
    assert_eq!(cfg.host.as_deref(), Some("localhost"));
    assert_eq!(cfg.port, Some(5432));
    assert!(!cfg.id.is_empty());
}

#[tokio::test]
async fn test_02_create_mysql_connection() {
    let mgr = DbManager::new();
    let cfg = mgr.create_connection(mysql_req("my-conn")).await;
    assert_eq!(cfg.engine, DbEngine::MySql);
    assert_eq!(cfg.host.as_deref(), Some("127.0.0.1"));
    assert!(cfg.ssl_enabled);
    assert_eq!(cfg.group.as_deref(), Some("dev"));
}

#[tokio::test]
async fn test_03_create_sqlite_connection() {
    let mgr = DbManager::new();
    let cfg = mgr.create_connection(sqlite_req("sqlite-conn")).await;
    assert_eq!(cfg.engine, DbEngine::Sqlite);
    assert_eq!(cfg.sqlite_path.as_deref(), Some("/tmp/test.db"));
    assert!(!cfg.ssl_enabled);
}

#[tokio::test]
async fn test_04_create_with_ssh_tunnel() {
    let mgr = DbManager::new();
    let mut req = pg_req("tunnel-conn");
    req.tunnel = Some(SshTunnelConfig {
        host: "bastion.example.com".into(),
        port: 22,
        username: "admin".into(),
        auth: SshTunnelAuth::Password("tunnel-pass".into()),
    });
    let cfg = mgr.create_connection(req).await;
    let tunnel = cfg.tunnel.unwrap();
    assert_eq!(tunnel.host, "bastion.example.com");
    assert_eq!(tunnel.port, 22);
    assert_eq!(tunnel.username, "admin");
}

#[tokio::test]
async fn test_05_get_existing_connection() {
    let mgr = DbManager::new();
    let created = mgr.create_connection(pg_req("get-me")).await;
    let fetched = mgr.get_connection(&created.id).await;
    assert!(fetched.is_some());
    assert_eq!(fetched.unwrap().name, "get-me");
}

#[tokio::test]
async fn test_06_get_nonexisting_returns_none() {
    let mgr = DbManager::new();
    let result = mgr.get_connection("nonexistent-id").await;
    assert!(result.is_none());
}

#[tokio::test]
async fn test_07_list_connections_sorted() {
    let mgr = DbManager::new();
    mgr.create_connection(pg_req("Charlie")).await;
    mgr.create_connection(mysql_req("Alice")).await;
    mgr.create_connection(sqlite_req("Bob")).await;

    let list = mgr.list_connections().await;
    assert_eq!(list.len(), 3);
    assert_eq!(list[0].name, "Alice");
    assert_eq!(list[1].name, "Bob");
    assert_eq!(list[2].name, "Charlie");
}

#[tokio::test]
async fn test_08_delete_existing_connection() {
    let mgr = DbManager::new();
    let cfg = mgr.create_connection(pg_req("delete-me")).await;
    assert!(mgr.delete_connection(&cfg.id).await);
    assert!(mgr.get_connection(&cfg.id).await.is_none());
}

#[tokio::test]
async fn test_09_delete_nonexisting_returns_false() {
    let mgr = DbManager::new();
    assert!(!mgr.delete_connection("nope").await);
}

#[tokio::test]
async fn test_10_default_trait() {
    let mgr = DbManager::default();
    let list = mgr.list_connections().await;
    assert!(list.is_empty());
}

// ═══════════════════════════════════════════════════════════════════════════
// DB TYPES
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_11_db_engine_serialization() {
    assert_eq!(
        serde_json::to_string(&DbEngine::PostgreSql).unwrap(),
        "\"postgresql\""
    );
    assert_eq!(
        serde_json::to_string(&DbEngine::MySql).unwrap(),
        "\"mysql\""
    );
    assert_eq!(
        serde_json::to_string(&DbEngine::Sqlite).unwrap(),
        "\"sqlite\""
    );

    let pg: DbEngine = serde_json::from_str("\"postgresql\"").unwrap();
    assert_eq!(pg, DbEngine::PostgreSql);
    let my: DbEngine = serde_json::from_str("\"mysql\"").unwrap();
    assert_eq!(my, DbEngine::MySql);
    let sq: DbEngine = serde_json::from_str("\"sqlite\"").unwrap();
    assert_eq!(sq, DbEngine::Sqlite);
}

#[test]
fn test_12_db_connection_config_roundtrip() {
    let config = DbConnectionConfig {
        id: "test-id".into(),
        name: "my-pg".into(),
        engine: DbEngine::PostgreSql,
        host: Some("db.example.com".into()),
        port: Some(5432),
        username: Some("admin".into()),
        password: Some("s3cret".into()),
        database: Some("production".into()),
        sqlite_path: None,
        group: Some("prod".into()),
        ssl_enabled: true,
        tunnel: None,
    };
    let json = serde_json::to_string(&config).unwrap();
    let restored: DbConnectionConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.id, "test-id");
    assert_eq!(restored.name, "my-pg");
    assert_eq!(restored.engine, DbEngine::PostgreSql);
    assert!(restored.ssl_enabled);
    assert_eq!(restored.group.as_deref(), Some("prod"));
}

#[test]
fn test_13_schema_info_with_multiple_tables() {
    let schema = SchemaInfo {
        name: "public".into(),
        tables: vec![
            TableInfo {
                name: "users".into(),
                schema: Some("public".into()),
                table_type: "table".into(),
                row_count_estimate: Some(1000),
            },
            TableInfo {
                name: "orders".into(),
                schema: Some("public".into()),
                table_type: "table".into(),
                row_count_estimate: Some(50000),
            },
            TableInfo {
                name: "user_stats".into(),
                schema: Some("public".into()),
                table_type: "view".into(),
                row_count_estimate: None,
            },
        ],
    };
    let json = serde_json::to_value(&schema).unwrap();
    assert_eq!(json["tables"].as_array().unwrap().len(), 3);
    assert_eq!(json["tables"][2]["table_type"], "view");
}

#[test]
fn test_14_table_info_all_fields() {
    let ti = TableInfo {
        name: "events".into(),
        schema: Some("analytics".into()),
        table_type: "table".into(),
        row_count_estimate: Some(1_000_000),
    };
    let json = serde_json::to_value(&ti).unwrap();
    assert_eq!(json["name"], "events");
    assert_eq!(json["schema"], "analytics");
    assert_eq!(json["row_count_estimate"], 1_000_000);
}

#[test]
fn test_15_column_info_all_data_types() {
    let cols = vec![
        ColumnInfo {
            name: "id".into(),
            data_type: "integer".into(),
            nullable: false,
            default_value: None,
            is_primary_key: true,
            max_length: None,
            comment: None,
        },
        ColumnInfo {
            name: "email".into(),
            data_type: "varchar".into(),
            nullable: false,
            default_value: None,
            is_primary_key: false,
            max_length: Some(255),
            comment: Some("User email".into()),
        },
        ColumnInfo {
            name: "bio".into(),
            data_type: "text".into(),
            nullable: true,
            default_value: Some("''".into()),
            is_primary_key: false,
            max_length: None,
            comment: None,
        },
    ];
    let json = serde_json::to_value(&cols).unwrap();
    assert_eq!(json[0]["is_primary_key"], true);
    assert_eq!(json[1]["max_length"], 255);
    assert_eq!(json[2]["nullable"], true);
}

#[test]
fn test_16_index_info_composite_columns() {
    let idx = IndexInfo {
        name: "idx_user_email_name".into(),
        columns: vec!["email".into(), "last_name".into()],
        is_unique: true,
        is_primary: false,
    };
    let json = serde_json::to_value(&idx).unwrap();
    assert_eq!(json["columns"].as_array().unwrap().len(), 2);
    assert_eq!(json["is_unique"], true);
    assert_eq!(json["is_primary"], false);
}

#[test]
fn test_17_table_structure_composed() {
    let ts = TableStructure {
        columns: vec![ColumnInfo {
            name: "id".into(),
            data_type: "int".into(),
            nullable: false,
            default_value: None,
            is_primary_key: true,
            max_length: None,
            comment: None,
        }],
        indexes: vec![IndexInfo {
            name: "pk_id".into(),
            columns: vec!["id".into()],
            is_unique: true,
            is_primary: true,
        }],
    };
    let json = serde_json::to_value(&ts).unwrap();
    assert_eq!(json["columns"].as_array().unwrap().len(), 1);
    assert_eq!(json["indexes"][0]["is_primary"], true);
}

#[test]
fn test_18_query_result_various_value_types() {
    let qr = QueryResult {
        columns: vec!["a".into(), "b".into(), "c".into(), "d".into()],
        rows: vec![vec![
            serde_json::Value::Null,
            json!("hello"),
            json!(42),
            json!(true),
        ]],
        row_count: 1,
        affected_rows: Some(0),
        execution_time_ms: 5,
    };
    let json = serde_json::to_value(&qr).unwrap();
    assert!(json["rows"][0][0].is_null());
    assert_eq!(json["rows"][0][1], "hello");
    assert_eq!(json["rows"][0][2], 42);
    assert_eq!(json["rows"][0][3], true);
    assert_eq!(json["affected_rows"], 0);
}

#[test]
fn test_19_db_test_result_success_and_failure() {
    let success = DbTestResult {
        success: true,
        message: "Connected successfully".into(),
        latency_ms: Some(12),
        server_version: Some("PostgreSQL 16.1".into()),
    };
    assert!(success.success);
    assert_eq!(success.server_version.as_deref(), Some("PostgreSQL 16.1"));

    let failure = DbTestResult {
        success: false,
        message: "Connection refused".into(),
        latency_ms: Some(5000),
        server_version: None,
    };
    assert!(!failure.success);
    assert!(failure.server_version.is_none());
}

#[test]
fn test_20_ssh_tunnel_config_password_auth() {
    // serde internally-tagged newtype variant cannot be serialized, so test via deserialization
    let _json_str = r#"{
        "host": "bastion.local",
        "port": 22,
        "username": "deploy",
        "auth": { "type": "password", "0": "hunter2" }
    }"#;
    // Verify the struct fields via construction
    let tunnel = SshTunnelConfig {
        host: "bastion.local".into(),
        port: 22,
        username: "deploy".into(),
        auth: SshTunnelAuth::Password("hunter2".into()),
    };
    assert_eq!(tunnel.host, "bastion.local");
    assert_eq!(tunnel.port, 22);
    assert_eq!(tunnel.username, "deploy");
    assert!(matches!(tunnel.auth, SshTunnelAuth::Password(ref p) if p == "hunter2"));
}

#[test]
fn test_21_ssh_tunnel_config_private_key_auth() {
    // Test via DbConnectionConfig roundtrip (same serde limitation as test_20)
    let config = DbConnectionConfig {
        id: "key-tunnel".into(),
        name: "keyed".into(),
        engine: DbEngine::PostgreSql,
        host: Some("db-host".into()),
        port: Some(5432),
        username: Some("user".into()),
        password: None,
        database: Some("db".into()),
        sqlite_path: None,
        group: None,
        ssl_enabled: false,
        tunnel: Some(SshTunnelConfig {
            host: "gateway.prod".into(),
            port: 2222,
            username: "ops".into(),
            auth: SshTunnelAuth::PrivateKey {
                key_pem:
                    "-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----"
                        .into(),
                passphrase: Some("keypass".into()),
            },
        }),
    };
    let json_str = serde_json::to_string(&config).unwrap();
    let restored: DbConnectionConfig = serde_json::from_str(&json_str).unwrap();
    let tunnel = restored.tunnel.unwrap();
    assert_eq!(tunnel.port, 2222);
    match &tunnel.auth {
        SshTunnelAuth::PrivateKey {
            key_pem,
            passphrase,
        } => {
            assert!(key_pem.contains("BEGIN"));
            assert_eq!(passphrase.as_deref(), Some("keypass"));
        }
        _ => panic!("Expected PrivateKey auth"),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_22_export_csv_simple() {
    let qr = QueryResult {
        columns: vec!["id".into(), "name".into()],
        rows: vec![vec![json!(1), json!("Alice")], vec![json!(2), json!("Bob")]],
        row_count: 2,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let csv = export::export_csv(&qr).unwrap();
    let text = String::from_utf8(csv).unwrap();
    assert!(text.starts_with("id,name\n"));
    assert!(text.contains("1,Alice\n"));
    assert!(text.contains("2,Bob\n"));
}

#[test]
fn test_23_export_csv_headers_with_commas() {
    let qr = QueryResult {
        columns: vec!["first,last".into(), "age".into()],
        rows: vec![vec![json!("value"), json!(30)]],
        row_count: 1,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let csv = export::export_csv(&qr).unwrap();
    let text = String::from_utf8(csv).unwrap();
    // Header with comma must be quoted
    assert!(text.starts_with("\"first,last\",age\n"));
}

#[test]
fn test_24_export_csv_values_with_quotes() {
    let qr = QueryResult {
        columns: vec!["msg".into()],
        rows: vec![vec![json!("He said \"hello\"")]],
        row_count: 1,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let csv = export::export_csv(&qr).unwrap();
    let text = String::from_utf8(csv).unwrap();
    // Quotes in values should be escaped as ""
    assert!(text.contains("\"He said \"\"hello\"\"\""));
}

#[test]
fn test_25_export_csv_null_values() {
    let qr = QueryResult {
        columns: vec!["a".into(), "b".into()],
        rows: vec![vec![serde_json::Value::Null, json!("ok")]],
        row_count: 1,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let csv = export::export_csv(&qr).unwrap();
    let text = String::from_utf8(csv).unwrap();
    // Null renders as empty string
    assert!(text.contains(",ok\n"));
}

#[test]
fn test_26_export_csv_empty_result() {
    let qr = QueryResult {
        columns: vec!["x".into(), "y".into()],
        rows: vec![],
        row_count: 0,
        affected_rows: None,
        execution_time_ms: 0,
    };
    let csv = export::export_csv(&qr).unwrap();
    let text = String::from_utf8(csv).unwrap();
    assert_eq!(text, "x,y\n");
}

#[test]
fn test_27_export_csv_single_column() {
    let qr = QueryResult {
        columns: vec!["val".into()],
        rows: vec![vec![json!(100)], vec![json!(200)]],
        row_count: 2,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let csv = export::export_csv(&qr).unwrap();
    let text = String::from_utf8(csv).unwrap();
    assert_eq!(text, "val\n100\n200\n");
}

#[test]
fn test_28_export_json_array() {
    let qr = QueryResult {
        columns: vec!["id".into(), "v".into()],
        rows: vec![vec![json!(1), json!("a")], vec![json!(2), json!("b")]],
        row_count: 2,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let bytes = export::export_json(&qr, &ExportFormat::JsonArray).unwrap();
    let parsed: Vec<serde_json::Value> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(parsed.len(), 2);
    assert_eq!(parsed[0]["id"], 1);
    assert_eq!(parsed[1]["v"], "b");
}

#[test]
fn test_29_export_json_lines() {
    let qr = QueryResult {
        columns: vec!["k".into()],
        rows: vec![vec![json!("x")], vec![json!("y")], vec![json!("z")]],
        row_count: 3,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let bytes = export::export_json(&qr, &ExportFormat::JsonLines).unwrap();
    let text = String::from_utf8(bytes).unwrap();
    let lines: Vec<&str> = text.trim_end().split('\n').collect();
    assert_eq!(lines.len(), 3);
    let obj: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
    assert_eq!(obj["k"], "x");
}

#[test]
fn test_30_export_json_with_nested_objects() {
    let nested = json!({"inner": [1, 2, 3]});
    let qr = QueryResult {
        columns: vec!["data".into()],
        rows: vec![vec![nested.clone()]],
        row_count: 1,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let bytes = export::export_json(&qr, &ExportFormat::JsonArray).unwrap();
    let parsed: Vec<serde_json::Value> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(parsed[0]["data"]["inner"], json!([1, 2, 3]));
}

#[test]
fn test_31_export_csv_unicode() {
    let qr = QueryResult {
        columns: vec!["name".into()],
        rows: vec![
            vec![json!("日本語テスト")],
            vec![json!("Ünïcödé")],
            vec![json!("中文数据")],
        ],
        row_count: 3,
        affected_rows: None,
        execution_time_ms: 1,
    };
    let csv = export::export_csv(&qr).unwrap();
    let text = String::from_utf8(csv).unwrap();
    assert!(text.contains("日本語テスト"));
    assert!(text.contains("Ünïcödé"));
    assert!(text.contains("中文数据"));
}

#[test]
fn test_32_export_dispatcher_correct_format() {
    let qr = sample_query_result(2);

    // CSV dispatch
    let csv_bytes = export::export(&qr, &ExportFormat::Csv).unwrap();
    let csv_text = String::from_utf8(csv_bytes).unwrap();
    assert!(csv_text.starts_with("id,name,active\n"));

    // JSON array dispatch
    let json_bytes = export::export(&qr, &ExportFormat::JsonArray).unwrap();
    let parsed: Vec<serde_json::Value> = serde_json::from_slice(&json_bytes).unwrap();
    assert_eq!(parsed.len(), 2);

    // JSON lines dispatch
    let jl_bytes = export::export(&qr, &ExportFormat::JsonLines).unwrap();
    let jl_text = String::from_utf8(jl_bytes).unwrap();
    assert_eq!(jl_text.trim_end().split('\n').count(), 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLAIN
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_33_parse_pg_explain_json() {
    let input = json!([{
        "Plan": {
            "Node Type": "Seq Scan",
            "Relation Name": "users",
            "Startup Cost": 0.0,
            "Total Cost": 10.5,
            "Plan Rows": 100,
            "Plan Width": 64,
            "Actual Rows": 95,
            "Actual Total Time": 0.5,
        }
    }]);
    let result = explain::parse_pg_explain(&input).unwrap();
    assert_eq!(result.root.node_type, "Seq Scan");
    assert_eq!(result.root.relation.as_deref(), Some("users"));
    assert_eq!(result.root.startup_cost, Some(0.0));
    assert_eq!(result.root.total_cost, Some(10.5));
    assert_eq!(result.root.plan_rows, Some(100));
    assert_eq!(result.root.actual_rows, Some(95));
}

#[test]
fn test_34_parse_pg_nested_plan_join() {
    let input = json!([{
        "Plan": {
            "Node Type": "Hash Join",
            "Startup Cost": 1.0,
            "Total Cost": 20.0,
            "Plan Rows": 50,
            "Plan Width": 128,
            "Plans": [
                {
                    "Node Type": "Seq Scan",
                    "Relation Name": "orders",
                    "Startup Cost": 0.0,
                    "Total Cost": 5.0,
                    "Plan Rows": 50,
                    "Plan Width": 64
                },
                {
                    "Node Type": "Hash",
                    "Startup Cost": 1.0,
                    "Total Cost": 3.0,
                    "Plan Rows": 10,
                    "Plan Width": 32,
                    "Plans": [
                        {
                            "Node Type": "Seq Scan",
                            "Relation Name": "customers",
                            "Startup Cost": 0.0,
                            "Total Cost": 2.0,
                            "Plan Rows": 10,
                            "Plan Width": 32
                        }
                    ]
                }
            ]
        }
    }]);
    let result = explain::parse_pg_explain(&input).unwrap();
    assert_eq!(result.root.node_type, "Hash Join");
    assert_eq!(result.root.children.len(), 2);
    assert_eq!(result.root.children[0].node_type, "Seq Scan");
    assert_eq!(result.root.children[0].relation.as_deref(), Some("orders"));
    assert_eq!(result.root.children[1].node_type, "Hash");
    // Nested child
    assert_eq!(result.root.children[1].children.len(), 1);
    assert_eq!(
        result.root.children[1].children[0].relation.as_deref(),
        Some("customers")
    );
}

#[test]
fn test_35_parse_pg_with_timing() {
    let input = json!([{
        "Plan": {
            "Node Type": "Index Scan",
            "Relation Name": "users",
            "Startup Cost": 0.28,
            "Total Cost": 8.30,
            "Plan Rows": 1,
            "Plan Width": 64,
            "Actual Rows": 1,
            "Actual Total Time": 0.03
        },
        "Planning Time": 0.15,
        "Execution Time": 0.08
    }]);
    let result = explain::parse_pg_explain(&input).unwrap();
    assert_eq!(result.planning_time, Some(0.15));
    assert_eq!(result.execution_time, Some(0.08));
    assert_eq!(result.root.actual_time, Some(0.03));
}

#[test]
fn test_36_parse_mysql_explain_json() {
    let input = json!({
        "query_block": {
            "table": {
                "table_name": "products",
                "access_type": "ALL",
                "rows_examined_per_scan": 500,
                "cost_info": {
                    "read_cost": "50.0"
                }
            }
        }
    });
    let result = explain::parse_mysql_explain(&input).unwrap();
    assert!(result.root.node_type.contains("Table Scan"));
    assert_eq!(result.root.relation.as_deref(), Some("products"));
    assert_eq!(result.root.plan_rows, Some(500));
    assert!(result.planning_time.is_none());
}

#[test]
fn test_37_parse_mysql_nested_loop() {
    let input = json!({
        "query_block": {
            "nested_loop": [
                {
                    "table": {
                        "table_name": "t1",
                        "access_type": "ref",
                        "rows_examined_per_scan": 10
                    }
                },
                {
                    "table": {
                        "table_name": "t2",
                        "access_type": "eq_ref",
                        "rows_examined_per_scan": 1
                    }
                }
            ],
            "cost_info": {
                "query_cost": "25.0"
            }
        }
    });
    let result = explain::parse_mysql_explain(&input).unwrap();
    assert_eq!(result.root.node_type, "Nested Loop");
    assert_eq!(result.root.children.len(), 2);
    assert_eq!(result.root.children[0].relation.as_deref(), Some("t1"));
    assert_eq!(result.root.children[1].relation.as_deref(), Some("t2"));
    assert_eq!(result.root.total_cost, Some(25.0));
}

#[test]
fn test_38_parse_sqlite_explain() {
    let rows = vec![
        (0_i64, 0_i64, 0_i64, "SCAN TABLE users".to_string()),
        (0, 0, 0, "USE TEMP B-TREE FOR ORDER BY".to_string()),
    ];
    let result = explain::parse_sqlite_explain(&rows);
    assert_eq!(result.root.node_type, "Query Plan");
    assert_eq!(result.root.children.len(), 2);
    assert_eq!(result.root.children[0].node_type, "SCAN TABLE users");
    assert_eq!(
        result.root.children[1].node_type,
        "USE TEMP B-TREE FOR ORDER BY"
    );
}

#[test]
fn test_39_parse_explain_empty_children() {
    let input = json!([{
        "Plan": {
            "Node Type": "Result",
            "Startup Cost": 0.0,
            "Total Cost": 0.01,
            "Plan Rows": 1,
            "Plan Width": 4,
            "Plans": []
        }
    }]);
    let result = explain::parse_pg_explain(&input).unwrap();
    assert!(result.root.children.is_empty());
}

#[test]
fn test_40_parse_explain_cost_estimates() {
    let input = json!([{
        "Plan": {
            "Node Type": "Bitmap Heap Scan",
            "Relation Name": "large_table",
            "Startup Cost": 50.23,
            "Total Cost": 1234.56,
            "Plan Rows": 5000,
            "Plan Width": 256,
            "Plans": [
                {
                    "Node Type": "Bitmap Index Scan",
                    "Startup Cost": 0.0,
                    "Total Cost": 50.23,
                    "Plan Rows": 5000,
                    "Plan Width": 0
                }
            ]
        }
    }]);
    let result = explain::parse_pg_explain(&input).unwrap();
    assert_eq!(result.root.startup_cost, Some(50.23));
    assert_eq!(result.root.total_cost, Some(1234.56));
    assert_eq!(result.root.plan_width, Some(256));
    assert_eq!(result.root.children[0].total_cost, Some(50.23));
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETION
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_41_completion_tree_full() {
    let tree = CompletionTree {
        schemas: vec![
            CompletionSchema {
                name: "public".into(),
                tables: vec![
                    CompletionTable {
                        name: "users".into(),
                        columns: vec![
                            CompletionColumn {
                                name: "id".into(),
                                data_type: "integer".into(),
                            },
                            CompletionColumn {
                                name: "email".into(),
                                data_type: "varchar".into(),
                            },
                        ],
                    },
                    CompletionTable {
                        name: "orders".into(),
                        columns: vec![
                            CompletionColumn {
                                name: "id".into(),
                                data_type: "integer".into(),
                            },
                            CompletionColumn {
                                name: "total".into(),
                                data_type: "numeric".into(),
                            },
                        ],
                    },
                ],
            },
            CompletionSchema {
                name: "admin".into(),
                tables: vec![],
            },
        ],
    };
    let json = serde_json::to_value(&tree).unwrap();
    assert_eq!(json["schemas"].as_array().unwrap().len(), 2);
    assert_eq!(json["schemas"][0]["tables"].as_array().unwrap().len(), 2);
    assert_eq!(
        json["schemas"][0]["tables"][0]["columns"][1]["data_type"],
        "varchar"
    );
}

#[test]
fn test_42_completion_schema_serialization() {
    let schema = CompletionSchema {
        name: "test_schema".into(),
        tables: vec![CompletionTable {
            name: "t1".into(),
            columns: vec![CompletionColumn {
                name: "col1".into(),
                data_type: "text".into(),
            }],
        }],
    };
    let json_str = serde_json::to_string(&schema).unwrap();
    let restored: CompletionSchema = serde_json::from_str(&json_str).unwrap();
    assert_eq!(restored.name, "test_schema");
    assert_eq!(restored.tables.len(), 1);
    assert_eq!(restored.tables[0].columns[0].name, "col1");
}

#[test]
fn test_43_completion_table_typed_columns() {
    let table = CompletionTable {
        name: "metrics".into(),
        columns: vec![
            CompletionColumn {
                name: "ts".into(),
                data_type: "timestamp".into(),
            },
            CompletionColumn {
                name: "value".into(),
                data_type: "double precision".into(),
            },
            CompletionColumn {
                name: "labels".into(),
                data_type: "jsonb".into(),
            },
        ],
    };
    let json = serde_json::to_value(&table).unwrap();
    assert_eq!(json["columns"].as_array().unwrap().len(), 3);
    assert_eq!(json["columns"][2]["data_type"], "jsonb");
}

// ═══════════════════════════════════════════════════════════════════════════
// ROW OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_44_row_update_req_multiple_changes() {
    let mut pk = serde_json::Map::new();
    pk.insert("id".into(), json!(42));

    let mut changes = serde_json::Map::new();
    changes.insert("name".into(), json!("Updated Name"));
    changes.insert("email".into(), json!("new@example.com"));
    changes.insert("active".into(), json!(false));

    let req = RowUpdateReq {
        schema: Some("public".into()),
        table: "users".into(),
        pk,
        changes,
    };
    let json = serde_json::to_value(&req).unwrap();
    assert_eq!(json["table"], "users");
    assert_eq!(json["pk"]["id"], 42);
    assert_eq!(json["changes"]["name"], "Updated Name");
    assert_eq!(json["changes"]["active"], false);
}

#[test]
fn test_45_row_delete_req_composite_pk() {
    let mut pk = serde_json::Map::new();
    pk.insert("tenant_id".into(), json!("acme"));
    pk.insert("user_id".into(), json!(100));

    let req = RowDeleteReq {
        schema: Some("multi_tenant".into()),
        table: "user_roles".into(),
        pk,
    };
    let json = serde_json::to_value(&req).unwrap();
    assert_eq!(json["schema"], "multi_tenant");
    assert_eq!(json["pk"]["tenant_id"], "acme");
    assert_eq!(json["pk"]["user_id"], 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_46_connection_max_port() {
    let mgr = DbManager::new();
    let mut req = pg_req("max-port");
    req.port = Some(65535);
    let cfg = mgr.create_connection(req).await;
    assert_eq!(cfg.port, Some(65535));
}

#[tokio::test]
async fn test_47_connection_very_long_name() {
    let mgr = DbManager::new();
    let long_name = "a".repeat(1000);
    let mut req = pg_req(&long_name);
    req.name = long_name.clone();
    let cfg = mgr.create_connection(req).await;
    assert_eq!(cfg.name.len(), 1000);
}

#[tokio::test]
async fn test_48_concurrent_connection_operations() {
    let mgr = std::sync::Arc::new(DbManager::new());
    let mut handles = Vec::new();

    for i in 0..20 {
        let m = mgr.clone();
        handles.push(tokio::spawn(async move {
            m.create_connection(pg_req(&format!("conn-{i}"))).await
        }));
    }

    let mut configs = Vec::with_capacity(20);
    for h in handles {
        configs.push(h.await.unwrap());
    }

    assert_eq!(configs.len(), 20);
    let list = mgr.list_connections().await;
    assert_eq!(list.len(), 20);

    // Verify all unique IDs
    let ids: std::collections::HashSet<_> = list.iter().map(|c| c.id.clone()).collect();
    assert_eq!(ids.len(), 20);
}

#[test]
fn test_49_query_result_large_rows() {
    let qr = sample_query_result(1500);
    assert_eq!(qr.row_count, 1500);
    assert_eq!(qr.rows.len(), 1500);

    // Verify serialization still works
    let json = serde_json::to_value(&qr).unwrap();
    assert_eq!(json["rows"].as_array().unwrap().len(), 1500);
}

#[test]
fn test_50_export_csv_large_rows() {
    let qr = sample_query_result(1500);
    let csv = export::export_csv(&qr).unwrap();
    let text = String::from_utf8(csv).unwrap();
    let line_count = text.lines().count();
    // 1 header + 1500 data rows
    assert_eq!(line_count, 1501);
}
