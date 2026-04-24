//! Comprehensive tests for `ventoos-redis`.
//!
//! Covers RESP parser (RESP2 + RESP3), `RespValue` accessor methods,
//! command builder, `RedisManager` CRUD, and type (de)serialization.

use std::io::Cursor;

use serde_json::json;
use tokio::io::BufReader;
use ventoos_redis::resp::{RespValue, build_command, parse_resp};
use ventoos_redis::*;

// ── Helpers ─────────────────────────────────────────────────

/// Shorthand: parse raw RESP bytes into `RespValue`.
async fn parse(input: &[u8]) -> Result<RespValue, String> {
    let cursor = Cursor::new(input.to_vec());
    let mut reader = BufReader::new(cursor);
    parse_resp(&mut reader).await
}

// ═══════════════════════════════════════════════════════════
//  RESP PARSER – RESP2 types
// ═══════════════════════════════════════════════════════════

#[tokio::test]
async fn resp_parse_simple_string_ok() {
    let val = parse(b"+OK\r\n").await.unwrap();
    assert_eq!(val, RespValue::SimpleString("OK".into()));
}

#[tokio::test]
async fn resp_parse_error_string() {
    let val = parse(b"-ERR unknown command\r\n").await.unwrap();
    assert_eq!(val, RespValue::Error("ERR unknown command".into()));
}

#[tokio::test]
async fn resp_parse_integer_positive() {
    let val = parse(b":42\r\n").await.unwrap();
    assert_eq!(val, RespValue::Integer(42));
}

#[tokio::test]
async fn resp_parse_integer_negative() {
    let val = parse(b":-1\r\n").await.unwrap();
    assert_eq!(val, RespValue::Integer(-1));
}

#[tokio::test]
async fn resp_parse_integer_zero() {
    let val = parse(b":0\r\n").await.unwrap();
    assert_eq!(val, RespValue::Integer(0));
}

#[tokio::test]
async fn resp_parse_bulk_string() {
    let val = parse(b"$5\r\nhello\r\n").await.unwrap();
    assert_eq!(val, RespValue::BulkString(Some(b"hello".to_vec())));
}

#[tokio::test]
async fn resp_parse_null_bulk_string() {
    let val = parse(b"$-1\r\n").await.unwrap();
    assert_eq!(val, RespValue::BulkString(None));
}

#[tokio::test]
async fn resp_parse_empty_bulk_string() {
    let val = parse(b"$0\r\n\r\n").await.unwrap();
    assert_eq!(val, RespValue::BulkString(Some(vec![])));
}

#[tokio::test]
async fn resp_parse_bulk_string_with_binary_data() {
    // Binary payload that includes \r\n in the middle.
    let raw: &[u8] = b"$6\r\nab\r\ncd\r\n";
    let val = parse(raw).await.unwrap();
    assert_eq!(val, RespValue::BulkString(Some(b"ab\r\ncd".to_vec())));
}

#[tokio::test]
async fn resp_parse_array_of_integers() {
    let val = parse(b"*3\r\n:1\r\n:2\r\n:3\r\n").await.unwrap();
    assert_eq!(
        val,
        RespValue::Array(Some(vec![
            RespValue::Integer(1),
            RespValue::Integer(2),
            RespValue::Integer(3),
        ]))
    );
}

#[tokio::test]
async fn resp_parse_null_array() {
    let val = parse(b"*-1\r\n").await.unwrap();
    assert_eq!(val, RespValue::Array(None));
}

#[tokio::test]
async fn resp_parse_empty_array() {
    let val = parse(b"*0\r\n").await.unwrap();
    assert_eq!(val, RespValue::Array(Some(vec![])));
}

#[tokio::test]
async fn resp_parse_nested_array() {
    // *2\r\n *2\r\n :1\r\n :2\r\n *1\r\n +hi\r\n
    let input = b"*2\r\n*2\r\n:1\r\n:2\r\n*1\r\n+hi\r\n";
    let val = parse(input).await.unwrap();
    assert_eq!(
        val,
        RespValue::Array(Some(vec![
            RespValue::Array(Some(vec![RespValue::Integer(1), RespValue::Integer(2),])),
            RespValue::Array(Some(vec![RespValue::SimpleString("hi".into())])),
        ]))
    );
}

// ═══════════════════════════════════════════════════════════
//  RESP PARSER – RESP3 types
// ═══════════════════════════════════════════════════════════

#[tokio::test]
async fn resp3_parse_null() {
    let val = parse(b"_\r\n").await.unwrap();
    assert_eq!(val, RespValue::Null);
}

#[tokio::test]
async fn resp3_parse_boolean_true() {
    let val = parse(b"#t\r\n").await.unwrap();
    assert_eq!(val, RespValue::Boolean(true));
}

#[tokio::test]
async fn resp3_parse_boolean_false() {
    let val = parse(b"#f\r\n").await.unwrap();
    assert_eq!(val, RespValue::Boolean(false));
}

#[tokio::test]
async fn resp3_parse_double() {
    let val = parse(b",3.5\r\n").await.unwrap();
    assert_eq!(val, RespValue::Double(3.5));
}

#[tokio::test]
async fn resp3_parse_infinity() {
    let val = parse(b",inf\r\n").await.unwrap();
    assert_eq!(val, RespValue::Double(f64::INFINITY));
}

#[tokio::test]
async fn resp3_parse_negative_infinity() {
    let val = parse(b",-inf\r\n").await.unwrap();
    assert_eq!(val, RespValue::Double(f64::NEG_INFINITY));
}

#[tokio::test]
async fn resp3_parse_big_number() {
    let val = parse(b"(3492890328409238509324850943850943825024385\r\n")
        .await
        .unwrap();
    assert_eq!(
        val,
        RespValue::BigNumber("3492890328409238509324850943850943825024385".into())
    );
}

#[tokio::test]
async fn resp3_parse_map() {
    let input = b"%2\r\n+key1\r\n:1\r\n+key2\r\n:2\r\n";
    let val = parse(input).await.unwrap();
    assert_eq!(
        val,
        RespValue::Map(vec![
            (
                RespValue::SimpleString("key1".into()),
                RespValue::Integer(1)
            ),
            (
                RespValue::SimpleString("key2".into()),
                RespValue::Integer(2)
            ),
        ])
    );
}

#[tokio::test]
async fn resp3_parse_set() {
    let input = b"~3\r\n+a\r\n+b\r\n+c\r\n";
    let val = parse(input).await.unwrap();
    assert_eq!(
        val,
        RespValue::Set(vec![
            RespValue::SimpleString("a".into()),
            RespValue::SimpleString("b".into()),
            RespValue::SimpleString("c".into()),
        ])
    );
}

#[tokio::test]
async fn resp3_parse_push() {
    let input = b">2\r\n+message\r\n+payload\r\n";
    let val = parse(input).await.unwrap();
    assert_eq!(
        val,
        RespValue::Push(vec![
            RespValue::SimpleString("message".into()),
            RespValue::SimpleString("payload".into()),
        ])
    );
}

// ── Parser error edge cases ─────────────────────────────────

#[tokio::test]
async fn resp_parse_connection_closed() {
    // Empty input → connection closed.
    let err = parse(b"").await.unwrap_err();
    assert!(
        err.contains("closed") || err.contains("Closed"),
        "got: {err}"
    );
}

#[tokio::test]
async fn resp_parse_empty_line_error() {
    // Just CRLF → empty RESP line.
    let err = parse(b"\r\n").await.unwrap_err();
    assert!(err.contains("Empty"), "got: {err}");
}

// ═══════════════════════════════════════════════════════════
//  RESP VALUE ACCESSOR METHODS
// ═══════════════════════════════════════════════════════════

#[test]
fn resp_value_as_str_simple_string() {
    let v = RespValue::SimpleString("hello".into());
    assert_eq!(v.as_str(), Some("hello"));
}

#[test]
fn resp_value_as_str_bulk_string() {
    let v = RespValue::BulkString(Some(b"world".to_vec()));
    assert_eq!(v.as_str(), Some("world"));
}

#[test]
fn resp_value_as_str_non_string_returns_none() {
    assert!(RespValue::Integer(42).as_str().is_none());
    assert!(RespValue::Boolean(true).as_str().is_none());
    assert!(RespValue::Double(1.5).as_str().is_none());
}

#[test]
fn resp_value_as_i64_integer() {
    assert_eq!(RespValue::Integer(99).as_i64(), Some(99));
}

#[test]
fn resp_value_as_i64_numeric_bulk_string() {
    let v = RespValue::BulkString(Some(b"123".to_vec()));
    assert_eq!(v.as_i64(), Some(123));
}

#[test]
fn resp_value_as_i64_non_numeric_returns_none() {
    let v = RespValue::BulkString(Some(b"abc".to_vec()));
    assert_eq!(v.as_i64(), None);
    assert_eq!(RespValue::Boolean(true).as_i64(), None);
}

#[test]
fn resp_value_is_null_variants() {
    assert!(RespValue::Null.is_null());
    assert!(RespValue::BulkString(None).is_null());
    assert!(RespValue::Array(None).is_null());
    // Non-null should return false:
    assert!(!RespValue::Integer(0).is_null());
    assert!(!RespValue::SimpleString(String::new()).is_null());
}

#[test]
fn resp_value_is_error() {
    assert!(RespValue::Error("ERR fail".into()).is_error());
    assert!(!RespValue::SimpleString("OK".into()).is_error());
    assert!(!RespValue::Integer(0).is_error());
}

#[test]
fn resp_value_is_ok() {
    assert!(RespValue::SimpleString("OK".into()).is_ok());
    assert!(!RespValue::SimpleString("PONG".into()).is_ok());
    assert!(!RespValue::Error("OK".into()).is_ok());
}

#[test]
fn resp_value_error_message() {
    let v = RespValue::Error("WRONGTYPE operation".into());
    assert_eq!(v.error_message(), Some("WRONGTYPE operation"));
    assert_eq!(RespValue::Integer(0).error_message(), None);
}

#[test]
fn resp_value_into_array_for_array() {
    let v = RespValue::Array(Some(vec![RespValue::Integer(1)]));
    let arr = v.into_array().unwrap();
    assert_eq!(arr.len(), 1);
}

#[test]
fn resp_value_into_array_for_set() {
    let v = RespValue::Set(vec![RespValue::SimpleString("x".into())]);
    let arr = v.into_array().unwrap();
    assert_eq!(arr.len(), 1);
}

#[test]
fn resp_value_into_array_for_push() {
    let v = RespValue::Push(vec![
        RespValue::SimpleString("a".into()),
        RespValue::SimpleString("b".into()),
    ]);
    let arr = v.into_array().unwrap();
    assert_eq!(arr.len(), 2);
}

#[test]
fn resp_value_into_array_for_non_array_returns_none() {
    assert!(RespValue::Integer(1).into_array().is_none());
    assert!(RespValue::Array(None).into_array().is_none());
}

// ── to_string_lossy ─────────────────────────────────────────

#[test]
fn to_string_lossy_simple_string() {
    assert_eq!(
        RespValue::SimpleString("hello".into()).to_string_lossy(),
        "hello"
    );
}

#[test]
fn to_string_lossy_error() {
    assert_eq!(
        RespValue::Error("ERR fail".into()).to_string_lossy(),
        "ERR fail"
    );
}

#[test]
fn to_string_lossy_integer() {
    assert_eq!(RespValue::Integer(-7).to_string_lossy(), "-7");
}

#[test]
fn to_string_lossy_bulk_string() {
    assert_eq!(
        RespValue::BulkString(Some(b"abc".to_vec())).to_string_lossy(),
        "abc"
    );
}

#[test]
fn to_string_lossy_null_variants() {
    assert_eq!(RespValue::Null.to_string_lossy(), "(nil)");
    assert_eq!(RespValue::BulkString(None).to_string_lossy(), "(nil)");
    assert_eq!(RespValue::Array(None).to_string_lossy(), "(nil)");
}

#[test]
fn to_string_lossy_boolean() {
    assert_eq!(RespValue::Boolean(true).to_string_lossy(), "true");
    assert_eq!(RespValue::Boolean(false).to_string_lossy(), "false");
}

#[test]
fn to_string_lossy_double() {
    let s = RespValue::Double(3.5).to_string_lossy();
    assert!(s.starts_with("3.5"), "got: {s}");
}

#[test]
fn to_string_lossy_big_number() {
    assert_eq!(
        RespValue::BigNumber("1234567890".into()).to_string_lossy(),
        "1234567890"
    );
}

#[test]
fn to_string_lossy_verbatim_string() {
    let v = RespValue::VerbatimString {
        encoding: "txt".into(),
        data: "some text".into(),
    };
    assert_eq!(v.to_string_lossy(), "some text");
}

#[test]
fn to_string_lossy_array() {
    let v = RespValue::Array(Some(vec![RespValue::Integer(1), RespValue::Integer(2)]));
    let s = v.to_string_lossy();
    assert!(s.contains('1') && s.contains('2'));
}

#[test]
fn to_string_lossy_map() {
    let v = RespValue::Map(vec![(
        RespValue::SimpleString("k".into()),
        RespValue::Integer(9),
    )]);
    let s = v.to_string_lossy();
    assert!(s.contains('k') && s.contains('9'));
}

// ── to_json ─────────────────────────────────────────────────

#[test]
fn to_json_simple_string() {
    assert_eq!(RespValue::SimpleString("hi".into()).to_json(), json!("hi"));
}

#[test]
fn to_json_error() {
    let j = RespValue::Error("ERR bad".into()).to_json();
    assert_eq!(j, json!({"error": "ERR bad"}));
}

#[test]
fn to_json_integer() {
    assert_eq!(RespValue::Integer(42).to_json(), json!(42));
}

#[test]
fn to_json_bulk_string() {
    assert_eq!(
        RespValue::BulkString(Some(b"data".to_vec())).to_json(),
        json!("data")
    );
}

#[test]
fn to_json_null_variants() {
    assert_eq!(RespValue::Null.to_json(), serde_json::Value::Null);
    assert_eq!(
        RespValue::BulkString(None).to_json(),
        serde_json::Value::Null
    );
    assert_eq!(RespValue::Array(None).to_json(), serde_json::Value::Null);
}

#[test]
fn to_json_boolean() {
    assert_eq!(RespValue::Boolean(true).to_json(), json!(true));
}

#[test]
fn to_json_double() {
    assert_eq!(RespValue::Double(2.5).to_json(), json!(2.5));
}

#[test]
fn to_json_double_nan_becomes_null() {
    // f64::NAN cannot be represented as JSON Number.
    assert_eq!(
        RespValue::Double(f64::NAN).to_json(),
        serde_json::Value::Null
    );
}

#[test]
fn to_json_big_number() {
    assert_eq!(RespValue::BigNumber("999".into()).to_json(), json!("999"));
}

#[test]
fn to_json_array() {
    let v = RespValue::Array(Some(vec![RespValue::Integer(1), RespValue::Integer(2)]));
    assert_eq!(v.to_json(), json!([1, 2]));
}

#[test]
fn to_json_set() {
    let v = RespValue::Set(vec![
        RespValue::SimpleString("a".into()),
        RespValue::SimpleString("b".into()),
    ]);
    assert_eq!(v.to_json(), json!(["a", "b"]));
}

#[test]
fn to_json_push() {
    let v = RespValue::Push(vec![RespValue::Integer(10)]);
    assert_eq!(v.to_json(), json!([10]));
}

#[test]
fn to_json_map() {
    let v = RespValue::Map(vec![
        (RespValue::SimpleString("x".into()), RespValue::Integer(1)),
        (
            RespValue::SimpleString("y".into()),
            RespValue::Boolean(true),
        ),
    ]);
    assert_eq!(v.to_json(), json!({"x": 1, "y": true}));
}

#[test]
fn to_json_verbatim_string() {
    let v = RespValue::VerbatimString {
        encoding: "txt".into(),
        data: "hello".into(),
    };
    assert_eq!(v.to_json(), json!("hello"));
}

// ═══════════════════════════════════════════════════════════
//  RESP VALUE – as_bytes_ref
// ═══════════════════════════════════════════════════════════

#[test]
fn as_bytes_ref_bulk_string() {
    let v = RespValue::BulkString(Some(b"\x00\x01\x02".to_vec()));
    assert_eq!(v.as_bytes_ref(), Some(&b"\x00\x01\x02"[..]));
}

#[test]
fn as_bytes_ref_non_bulk_returns_none() {
    assert!(
        RespValue::SimpleString("hi".into())
            .as_bytes_ref()
            .is_none()
    );
}

// ═══════════════════════════════════════════════════════════
//  RESP COMMAND BUILDER
// ═══════════════════════════════════════════════════════════

#[test]
fn build_command_ping() {
    let cmd = build_command(&["PING"]);
    assert_eq!(cmd, b"*1\r\n$4\r\nPING\r\n");
}

#[test]
fn build_command_set() {
    let cmd = build_command(&["SET", "key", "value"]);
    assert_eq!(cmd, b"*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n");
}

#[test]
fn build_command_with_spaces_in_value() {
    let cmd = build_command(&["SET", "greeting", "hello world"]);
    assert_eq!(
        cmd,
        b"*3\r\n$3\r\nSET\r\n$8\r\ngreeting\r\n$11\r\nhello world\r\n"
    );
}

#[test]
fn build_command_empty_args() {
    let cmd = build_command(&[]);
    assert_eq!(cmd, b"*0\r\n");
}

// ═══════════════════════════════════════════════════════════
//  REDIS MANAGER
// ═══════════════════════════════════════════════════════════

fn standalone_req(name: &str) -> CreateRedisConnectionReq {
    CreateRedisConnectionReq {
        name: name.into(),
        host: "127.0.0.1".into(),
        port: Some(6379),
        password: None,
        username: None,
        db: Some(0),
        group: None,
        ssl_enabled: None,
        mode: None,
        tls: None,
        sentinel: None,
        cluster: None,
    }
}

#[tokio::test]
async fn manager_create_standalone_connection() {
    let mgr = RedisManager::new();
    let cfg = mgr.create_connection(standalone_req("test-conn")).await;
    assert_eq!(cfg.name, "test-conn");
    assert_eq!(cfg.host, "127.0.0.1");
    assert_eq!(cfg.port, 6379);
    assert_eq!(cfg.db, 0);
    assert!(!cfg.ssl_enabled);
    assert_eq!(cfg.mode, RedisMode::Standalone);
    assert!(!cfg.id.is_empty());
}

#[tokio::test]
async fn manager_create_sentinel_connection() {
    let mgr = RedisManager::new();
    let req = CreateRedisConnectionReq {
        name: "sentinel-conn".into(),
        host: "sentinel-host".into(),
        port: Some(26379),
        password: None,
        username: None,
        db: None,
        group: Some("prod".into()),
        ssl_enabled: None,
        mode: Some(RedisMode::Sentinel),
        tls: None,
        sentinel: Some(SentinelConfig {
            master_name: "mymaster".into(),
            sentinels: vec![
                SentinelNode {
                    host: "s1".into(),
                    port: 26379,
                },
                SentinelNode {
                    host: "s2".into(),
                    port: 26379,
                },
            ],
            sentinel_password: None,
        }),
        cluster: None,
    };
    let cfg = mgr.create_connection(req).await;
    assert_eq!(cfg.mode, RedisMode::Sentinel);
    assert!(cfg.sentinel.is_some());
    assert_eq!(cfg.sentinel.as_ref().unwrap().master_name, "mymaster");
    assert_eq!(cfg.sentinel.as_ref().unwrap().sentinels.len(), 2);
    assert_eq!(cfg.group, Some("prod".into()));
}

#[tokio::test]
async fn manager_create_cluster_connection() {
    let mgr = RedisManager::new();
    let req = CreateRedisConnectionReq {
        name: "cluster-conn".into(),
        host: "cluster-host".into(),
        port: Some(7000),
        password: None,
        username: None,
        db: None,
        group: None,
        ssl_enabled: Some(false),
        mode: Some(RedisMode::Cluster),
        tls: None,
        sentinel: None,
        cluster: Some(ClusterConfig {
            nodes: vec![
                ClusterNode {
                    host: "n1".into(),
                    port: 7000,
                },
                ClusterNode {
                    host: "n2".into(),
                    port: 7001,
                },
                ClusterNode {
                    host: "n3".into(),
                    port: 7002,
                },
            ],
        }),
    };
    let cfg = mgr.create_connection(req).await;
    assert_eq!(cfg.mode, RedisMode::Cluster);
    assert!(cfg.cluster.is_some());
    assert_eq!(cfg.cluster.as_ref().unwrap().nodes.len(), 3);
}

#[tokio::test]
async fn manager_get_existing_connection() {
    let mgr = RedisManager::new();
    let cfg = mgr.create_connection(standalone_req("find-me")).await;
    let found = mgr.get_connection(&cfg.id).await;
    assert!(found.is_some());
    assert_eq!(found.unwrap().name, "find-me");
}

#[tokio::test]
async fn manager_get_nonexisting_returns_none() {
    let mgr = RedisManager::new();
    assert!(mgr.get_connection("nonexistent-id").await.is_none());
}

#[tokio::test]
async fn manager_list_connections() {
    let mgr = RedisManager::new();
    mgr.create_connection(standalone_req("beta")).await;
    mgr.create_connection(standalone_req("alpha")).await;
    let list = mgr.list_connections().await;
    assert_eq!(list.len(), 2);
    // list_connections sorts by name
    assert_eq!(list[0].name, "alpha");
    assert_eq!(list[1].name, "beta");
}

#[tokio::test]
async fn manager_delete_connection() {
    let mgr = RedisManager::new();
    let cfg = mgr.create_connection(standalone_req("to-delete")).await;
    assert!(mgr.delete_connection(&cfg.id).await);
    assert!(mgr.get_connection(&cfg.id).await.is_none());
}

#[tokio::test]
async fn manager_delete_nonexisting_returns_false() {
    let mgr = RedisManager::new();
    assert!(!mgr.delete_connection("does-not-exist").await);
}

#[tokio::test]
async fn manager_default_trait() {
    let mgr = RedisManager::default();
    assert!(mgr.list_connections().await.is_empty());
}

#[tokio::test]
async fn manager_create_with_tls_config() {
    let mgr = RedisManager::new();
    let req = CreateRedisConnectionReq {
        name: "tls-conn".into(),
        host: "secure.redis.io".into(),
        port: Some(6380),
        password: Some("secret".into()),
        username: Some("admin".into()),
        db: Some(3),
        group: None,
        ssl_enabled: Some(true),
        mode: None,
        tls: Some(RedisTlsConfig {
            enabled: true,
            ca_cert: Some("-----BEGIN CERTIFICATE-----\nMIIB...".into()),
            client_cert: Some("-----BEGIN CERTIFICATE-----\nclient...".into()),
            client_key: Some("-----BEGIN RSA PRIVATE KEY-----\nkey...".into()),
            skip_verify: Some(false),
        }),
        sentinel: None,
        cluster: None,
    };
    let cfg = mgr.create_connection(req).await;
    assert!(cfg.ssl_enabled);
    assert!(cfg.tls.is_some());
    let tls = cfg.tls.unwrap();
    assert!(tls.enabled);
    assert!(tls.ca_cert.is_some());
    assert!(tls.client_cert.is_some());
    assert!(tls.client_key.is_some());
    assert_eq!(tls.skip_verify, Some(false));
    assert_eq!(cfg.password, Some("secret".into()));
    assert_eq!(cfg.username, Some("admin".into()));
    assert_eq!(cfg.db, 3);
}

#[tokio::test]
async fn manager_create_uses_defaults_for_optional_fields() {
    let mgr = RedisManager::new();
    let req = CreateRedisConnectionReq {
        name: "min".into(),
        host: "h".into(),
        port: None,
        password: None,
        username: None,
        db: None,
        group: None,
        ssl_enabled: None,
        mode: None,
        tls: None,
        sentinel: None,
        cluster: None,
    };
    let cfg = mgr.create_connection(req).await;
    assert_eq!(cfg.port, 6379); // default
    assert_eq!(cfg.db, 0); // default
    assert!(!cfg.ssl_enabled); // default
    assert_eq!(cfg.mode, RedisMode::Standalone); // default
}

// ═══════════════════════════════════════════════════════════
//  REDIS TYPES – Serialization round-trips
// ═══════════════════════════════════════════════════════════

#[test]
fn redis_mode_serialization_standalone() {
    let json = serde_json::to_string(&RedisMode::Standalone).unwrap();
    assert_eq!(json, "\"standalone\"");
    let mode: RedisMode = serde_json::from_str(&json).unwrap();
    assert_eq!(mode, RedisMode::Standalone);
}

#[test]
fn redis_mode_serialization_sentinel() {
    let json = serde_json::to_string(&RedisMode::Sentinel).unwrap();
    assert_eq!(json, "\"sentinel\"");
    let mode: RedisMode = serde_json::from_str(&json).unwrap();
    assert_eq!(mode, RedisMode::Sentinel);
}

#[test]
fn redis_mode_serialization_cluster() {
    let json = serde_json::to_string(&RedisMode::Cluster).unwrap();
    assert_eq!(json, "\"cluster\"");
    let mode: RedisMode = serde_json::from_str(&json).unwrap();
    assert_eq!(mode, RedisMode::Cluster);
}

#[test]
fn redis_connection_config_roundtrip() {
    let cfg = RedisConnectionConfig {
        id: "id-1".into(),
        name: "myconn".into(),
        host: "redis.local".into(),
        port: 6379,
        password: Some("pass123".into()),
        username: Some("user1".into()),
        db: 5,
        group: Some("staging".into()),
        ssl_enabled: true,
        mode: RedisMode::Standalone,
        tls: Some(RedisTlsConfig {
            enabled: true,
            ca_cert: Some("ca".into()),
            client_cert: None,
            client_key: None,
            skip_verify: Some(true),
        }),
        sentinel: None,
        cluster: None,
    };
    let json = serde_json::to_string(&cfg).unwrap();
    let deserialized: RedisConnectionConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.id, cfg.id);
    assert_eq!(deserialized.name, cfg.name);
    assert_eq!(deserialized.port, cfg.port);
    assert_eq!(deserialized.db, cfg.db);
    assert!(deserialized.ssl_enabled);
    assert!(deserialized.tls.is_some());
}

#[test]
fn redis_key_info_serialization() {
    let ki = RedisKeyInfo {
        key: "users:1".into(),
        key_type: "string".into(),
        ttl: 3600,
        size: Some(128),
    };
    let json = serde_json::to_string(&ki).unwrap();
    let d: RedisKeyInfo = serde_json::from_str(&json).unwrap();
    assert_eq!(d.key, "users:1");
    assert_eq!(d.key_type, "string");
    assert_eq!(d.ttl, 3600);
    assert_eq!(d.size, Some(128));
}

#[test]
fn redis_key_value_with_json_value() {
    let kv = RedisKeyValue {
        key: "config".into(),
        key_type: "hash".into(),
        ttl: -1,
        value: json!({"enabled": true, "count": 42}),
        encoding: Some("ziplist".into()),
    };
    let json = serde_json::to_string(&kv).unwrap();
    let d: RedisKeyValue = serde_json::from_str(&json).unwrap();
    assert_eq!(d.key, "config");
    assert_eq!(d.value["enabled"], true);
    assert_eq!(d.value["count"], 42);
    assert_eq!(d.encoding, Some("ziplist".into()));
}

#[test]
fn redis_test_result_success() {
    let r = RedisTestResult {
        success: true,
        message: "Connected successfully".into(),
        latency_ms: Some(5),
        server_info: Some("Redis 7.2.0".into()),
    };
    let json = serde_json::to_string(&r).unwrap();
    let d: RedisTestResult = serde_json::from_str(&json).unwrap();
    assert!(d.success);
    assert_eq!(d.latency_ms, Some(5));
}

#[test]
fn redis_test_result_failure() {
    let r = RedisTestResult {
        success: false,
        message: "Connection refused".into(),
        latency_ms: None,
        server_info: None,
    };
    let json = serde_json::to_string(&r).unwrap();
    let d: RedisTestResult = serde_json::from_str(&json).unwrap();
    assert!(!d.success);
    assert!(d.latency_ms.is_none());
}

#[test]
fn redis_server_info_serialization() {
    let info = RedisServerInfo {
        version: "7.2.0".into(),
        connected_clients: 15,
        used_memory_human: "2.5M".into(),
        total_keys: 10000,
        uptime_days: 30,
    };
    let json = serde_json::to_string(&info).unwrap();
    let d: RedisServerInfo = serde_json::from_str(&json).unwrap();
    assert_eq!(d.version, "7.2.0");
    assert_eq!(d.connected_clients, 15);
    assert_eq!(d.used_memory_human, "2.5M");
    assert_eq!(d.total_keys, 10000);
}

#[test]
fn pub_sub_message_serialization() {
    let msg = PubSubMessage {
        channel: "events".into(),
        message: "user_joined".into(),
    };
    let json = serde_json::to_string(&msg).unwrap();
    let d: PubSubMessage = serde_json::from_str(&json).unwrap();
    assert_eq!(d.channel, "events");
    assert_eq!(d.message, "user_joined");
}

#[test]
fn sentinel_config_with_multiple_sentinels() {
    let sc = SentinelConfig {
        master_name: "primary".into(),
        sentinels: vec![
            SentinelNode {
                host: "s1.example.com".into(),
                port: 26379,
            },
            SentinelNode {
                host: "s2.example.com".into(),
                port: 26380,
            },
            SentinelNode {
                host: "s3.example.com".into(),
                port: 26381,
            },
        ],
        sentinel_password: Some("sentpw".into()),
    };
    let json = serde_json::to_string(&sc).unwrap();
    let d: SentinelConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(d.master_name, "primary");
    assert_eq!(d.sentinels.len(), 3);
    assert_eq!(d.sentinels[2].port, 26381);
    assert_eq!(d.sentinel_password, Some("sentpw".into()));
}

#[test]
fn cluster_config_with_multiple_nodes() {
    let cc = ClusterConfig {
        nodes: vec![
            ClusterNode {
                host: "c1".into(),
                port: 7000,
            },
            ClusterNode {
                host: "c2".into(),
                port: 7001,
            },
            ClusterNode {
                host: "c3".into(),
                port: 7002,
            },
        ],
    };
    let json = serde_json::to_string(&cc).unwrap();
    let d: ClusterConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(d.nodes.len(), 3);
    assert_eq!(d.nodes[0].host, "c1");
    assert_eq!(d.nodes[1].port, 7001);
}

#[test]
fn redis_tls_config_all_fields() {
    let tls = RedisTlsConfig {
        enabled: true,
        ca_cert: Some("ca-data".into()),
        client_cert: Some("client-cert-data".into()),
        client_key: Some("client-key-data".into()),
        skip_verify: Some(true),
    };
    let json = serde_json::to_string(&tls).unwrap();
    let d: RedisTlsConfig = serde_json::from_str(&json).unwrap();
    assert!(d.enabled);
    assert_eq!(d.ca_cert.unwrap(), "ca-data");
    assert_eq!(d.client_cert.unwrap(), "client-cert-data");
    assert_eq!(d.client_key.unwrap(), "client-key-data");
    assert_eq!(d.skip_verify, Some(true));
}

#[test]
fn redis_tls_config_default() {
    let tls = RedisTlsConfig::default();
    assert!(!tls.enabled);
    assert!(tls.ca_cert.is_none());
    assert!(tls.skip_verify.is_none());
}

#[test]
fn redis_mode_default_is_standalone() {
    assert_eq!(RedisMode::default(), RedisMode::Standalone);
}

// ═══════════════════════════════════════════════════════════
//  Additional RESP parser edge cases
// ═══════════════════════════════════════════════════════════

#[tokio::test]
async fn resp_parse_large_integer() {
    let val = parse(b":9999999999999\r\n").await.unwrap();
    assert_eq!(val, RespValue::Integer(9_999_999_999_999));
}

#[tokio::test]
async fn resp_parse_mixed_type_array() {
    // Array containing string, integer, bulk string, null
    let input = b"*4\r\n+OK\r\n:100\r\n$3\r\nfoo\r\n$-1\r\n";
    let val = parse(input).await.unwrap();
    let arr = val.into_array().unwrap();
    assert_eq!(arr.len(), 4);
    assert_eq!(arr[0], RespValue::SimpleString("OK".into()));
    assert_eq!(arr[1], RespValue::Integer(100));
    assert_eq!(arr[2], RespValue::BulkString(Some(b"foo".to_vec())));
    assert_eq!(arr[3], RespValue::BulkString(None));
}

#[tokio::test]
async fn resp_parse_unknown_type_byte_errors() {
    let err = parse(b"!unknown\r\n").await;
    assert!(err.is_err());
}

#[tokio::test]
async fn resp_parse_double_zero() {
    let val = parse(b",0.0\r\n").await.unwrap();
    assert_eq!(val, RespValue::Double(0.0));
}

#[tokio::test]
async fn resp_parse_double_negative() {
    let val = parse(b",-2.5\r\n").await.unwrap();
    if let RespValue::Double(f) = val {
        assert!((f - (-2.5)).abs() < 1e-10);
    } else {
        panic!("expected Double");
    }
}

#[tokio::test]
async fn resp_parse_empty_map() {
    let val = parse(b"%0\r\n").await.unwrap();
    assert_eq!(val, RespValue::Map(vec![]));
}

#[tokio::test]
async fn resp_parse_empty_set() {
    let val = parse(b"~0\r\n").await.unwrap();
    assert_eq!(val, RespValue::Set(vec![]));
}

#[tokio::test]
async fn resp_parse_empty_push() {
    let val = parse(b">0\r\n").await.unwrap();
    assert_eq!(val, RespValue::Push(vec![]));
}

// ═══════════════════════════════════════════════════════════
//  Additional type serialization edge cases
// ═══════════════════════════════════════════════════════════

#[test]
fn create_redis_connection_req_deserialization() {
    let json = json!({
        "name": "test",
        "host": "localhost",
        "port": 6379
    });
    let req: CreateRedisConnectionReq = serde_json::from_value(json).unwrap();
    assert_eq!(req.name, "test");
    assert_eq!(req.host, "localhost");
    assert_eq!(req.port, Some(6379));
    assert!(req.password.is_none());
    assert!(req.mode.is_none());
}

#[test]
fn redis_scan_req_serialization() {
    let sr = RedisScanReq {
        cursor: "0".into(),
        pattern: Some("user:*".into()),
        count: Some(100),
        key_type: Some("string".into()),
    };
    let json = serde_json::to_string(&sr).unwrap();
    let d: RedisScanReq = serde_json::from_str(&json).unwrap();
    assert_eq!(d.cursor, "0");
    assert_eq!(d.pattern, Some("user:*".into()));
    assert_eq!(d.count, Some(100));
}

#[test]
fn redis_scan_result_serialization() {
    let result = RedisScanResult {
        cursor: "42".into(),
        keys: vec![RedisKeyInfo {
            key: "k1".into(),
            key_type: "string".into(),
            ttl: -1,
            size: None,
        }],
        finished: false,
    };
    let json = serde_json::to_string(&result).unwrap();
    let d: RedisScanResult = serde_json::from_str(&json).unwrap();
    assert_eq!(d.cursor, "42");
    assert_eq!(d.keys.len(), 1);
    assert!(!d.finished);
}

#[test]
fn redis_command_result_serialization() {
    let r = RedisCommandResult {
        result: json!("PONG"),
        execution_time_ms: 2,
    };
    let json = serde_json::to_string(&r).unwrap();
    let d: RedisCommandResult = serde_json::from_str(&json).unwrap();
    assert_eq!(d.result, json!("PONG"));
    assert_eq!(d.execution_time_ms, 2);
}

// ═══════════════════════════════════════════════════════════
//  RespValue Clone & PartialEq
// ═══════════════════════════════════════════════════════════

#[test]
fn resp_value_clone_and_eq() {
    let original = RespValue::Array(Some(vec![
        RespValue::SimpleString("a".into()),
        RespValue::Integer(1),
        RespValue::BulkString(Some(b"data".to_vec())),
        RespValue::Null,
    ]));
    let cloned = original.clone();
    assert_eq!(original, cloned);
}

#[test]
fn resp_value_debug_format() {
    let v = RespValue::SimpleString("test".into());
    let debug = format!("{v:?}");
    assert!(debug.contains("SimpleString"));
    assert!(debug.contains("test"));
}

// ═══════════════════════════════════════════════════════════
//  Build command – round trip: build then parse
// ═══════════════════════════════════════════════════════════

#[tokio::test]
async fn build_then_parse_roundtrip() {
    let cmd = build_command(&["GET", "mykey"]);
    let val = parse(&cmd).await.unwrap();
    let arr = val.into_array().unwrap();
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0].as_str(), Some("GET"));
    assert_eq!(arr[1].as_str(), Some("mykey"));
}

#[tokio::test]
async fn build_then_parse_multi_arg_roundtrip() {
    let cmd = build_command(&["MSET", "k1", "v1", "k2", "v2"]);
    let val = parse(&cmd).await.unwrap();
    let arr = val.into_array().unwrap();
    assert_eq!(arr.len(), 5);
    assert_eq!(arr[0].as_str(), Some("MSET"));
    assert_eq!(arr[3].as_str(), Some("k2"));
    assert_eq!(arr[4].as_str(), Some("v2"));
}
