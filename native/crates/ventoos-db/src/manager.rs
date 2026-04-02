use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use mysql_async::prelude::*;
use serde_json::Value;
use tokio::sync::RwLock;
use tracing::{error, info};

use crate::types::{
    ColumnInfo, CreateDbConnectionReq, DbConnectionConfig, DbEngine, DbTestResult, IndexInfo,
    QueryResult, SchemaInfo, TableDataReq, TableInfo, TableStructure,
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/// Quote a `PostgreSQL` identifier (double-quote, escape internal double quotes).
fn pg_quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Quote a `MySQL` identifier (backtick, escape internal backticks).
fn mysql_quote_ident(name: &str) -> String {
    format!("`{}`", name.replace('`', "``"))
}

/// Convert an extended-protocol row value at index `i` to JSON based on column type.
fn pg_row_value(row: &tokio_postgres::Row, i: usize, ty: &tokio_postgres::types::Type) -> Value {
    use tokio_postgres::types::Type;
    match *ty {
        Type::BOOL => row
            .try_get::<_, Option<bool>>(i)
            .ok()
            .flatten()
            .map_or(Value::Null, Value::Bool),
        Type::INT2 => row
            .try_get::<_, Option<i16>>(i)
            .ok()
            .flatten()
            .map_or(Value::Null, |v| Value::from(i64::from(v))),
        Type::INT4 | Type::OID => row
            .try_get::<_, Option<i32>>(i)
            .ok()
            .flatten()
            .map_or(Value::Null, |v| Value::from(i64::from(v))),
        Type::INT8 => row
            .try_get::<_, Option<i64>>(i)
            .ok()
            .flatten()
            .map_or(Value::Null, Value::from),
        Type::FLOAT4 => row
            .try_get::<_, Option<f32>>(i)
            .ok()
            .flatten()
            .and_then(|v| serde_json::Number::from_f64(f64::from(v)))
            .map_or(Value::Null, Value::Number),
        Type::FLOAT8 => row
            .try_get::<_, Option<f64>>(i)
            .ok()
            .flatten()
            .and_then(serde_json::Number::from_f64)
            .map_or(Value::Null, Value::Number),
        Type::TEXT | Type::VARCHAR | Type::CHAR | Type::BPCHAR | Type::NAME => row
            .try_get::<_, Option<String>>(i)
            .ok()
            .flatten()
            .map_or(Value::Null, Value::String),
        Type::JSON | Type::JSONB => row
            .try_get::<_, Option<serde_json::Value>>(i)
            .ok()
            .flatten()
            .unwrap_or(Value::Null),
        Type::UUID => row
            .try_get::<_, Option<uuid::Uuid>>(i)
            .ok()
            .flatten()
            .map_or(Value::Null, |u| Value::String(u.to_string())),
        Type::BYTEA => row
            .try_get::<_, Option<Vec<u8>>>(i)
            .ok()
            .flatten()
            .map_or(Value::Null, |b| {
                Value::String(format!("[BLOB {} bytes]", b.len()))
            }),
        _ => {
            // Fallback: try as String (works for text-like types)
            row.try_get::<_, Option<String>>(i)
                .ok()
                .flatten()
                .map_or(Value::Null, Value::String)
        }
    }
}

/// Convert a `mysql_async::Value` to `serde_json::Value`.
#[allow(clippy::many_single_char_names)]
fn mysql_value_to_json(val: mysql_async::Value) -> Value {
    match val {
        mysql_async::Value::NULL => Value::Null,
        mysql_async::Value::Int(n) => Value::from(n),
        mysql_async::Value::UInt(n) => Value::from(n),
        mysql_async::Value::Float(f) => {
            serde_json::Number::from_f64(f64::from(f)).map_or(Value::Null, Value::Number)
        }
        mysql_async::Value::Double(d) => {
            serde_json::Number::from_f64(d).map_or(Value::Null, Value::Number)
        }
        mysql_async::Value::Bytes(b) => Value::String(String::from_utf8_lossy(&b).into_owned()),
        mysql_async::Value::Date(y, m, d, h, min, s, us) => {
            if h == 0 && min == 0 && s == 0 && us == 0 {
                Value::String(format!("{y:04}-{m:02}-{d:02}"))
            } else if us == 0 {
                Value::String(format!("{y:04}-{m:02}-{d:02} {h:02}:{min:02}:{s:02}"))
            } else {
                Value::String(format!(
                    "{y:04}-{m:02}-{d:02} {h:02}:{min:02}:{s:02}.{us:06}"
                ))
            }
        }
        mysql_async::Value::Time(neg, days, h, min, s, us) => {
            let sign = if neg { "-" } else { "" };
            let total_hours = u32::from(h) + days * 24;
            if us == 0 {
                Value::String(format!("{sign}{total_hours}:{min:02}:{s:02}"))
            } else {
                Value::String(format!("{sign}{total_hours}:{min:02}:{s:02}.{us:06}"))
            }
        }
    }
}

/// Normalise `information_schema` `table_type` values.
fn normalise_table_type(raw: &str) -> String {
    match raw {
        "BASE TABLE" => "table".to_string(),
        "VIEW" | "SYSTEM VIEW" => "view".to_string(),
        other => other.to_lowercase(),
    }
}

/// Build `tokio_postgres::Config` from a [`DbConnectionConfig`].
fn build_pg_config(config: &DbConnectionConfig) -> tokio_postgres::Config {
    let mut pg = tokio_postgres::Config::new();
    pg.host(config.host.as_deref().unwrap_or("localhost"));
    pg.port(config.port.unwrap_or(5432));
    pg.user(config.username.as_deref().unwrap_or("postgres"));
    if let Some(ref pw) = config.password {
        pg.password(pw);
    }
    pg.dbname(config.database.as_deref().unwrap_or("postgres"));
    pg
}

/// Build `mysql_async::Opts` from a [`DbConnectionConfig`].
fn build_mysql_opts(config: &DbConnectionConfig) -> mysql_async::Opts {
    let host = config.host.as_deref().unwrap_or("localhost");
    let port = config.port.unwrap_or(3306);
    let user = config.username.as_deref().unwrap_or("root");
    let password = config.password.as_deref().unwrap_or("");
    let database = config.database.as_deref().unwrap_or("");

    let builder = mysql_async::OptsBuilder::default()
        .ip_or_hostname(host)
        .tcp_port(port)
        .user(Some(user))
        .pass(Some(password));
    let builder = if database.is_empty() {
        builder
    } else {
        builder.db_name(Some(database))
    };

    mysql_async::Opts::from(builder)
}

// ---------------------------------------------------------------------------
// Pool enum
// ---------------------------------------------------------------------------

/// Internal pool wrapper.
enum DbPool {
    Sqlite(Arc<std::sync::Mutex<rusqlite::Connection>>),
    Postgres {
        client: tokio_postgres::Client,
        driver: tokio::task::JoinHandle<()>,
    },
    Mysql(Arc<tokio::sync::Mutex<mysql_async::Conn>>),
}

// ---------------------------------------------------------------------------
// DbManager
// ---------------------------------------------------------------------------

/// Database connection manager.
/// Manages multiple database connections and provides schema browsing + SQL execution.
pub struct DbManager {
    configs: Arc<RwLock<HashMap<String, DbConnectionConfig>>>,
    /// Active connection pools keyed by config id.
    pools: Arc<RwLock<HashMap<String, DbPool>>>,
}

impl DbManager {
    pub fn new() -> Self {
        Self {
            configs: Arc::new(RwLock::new(HashMap::new())),
            pools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_connection(&self, req: CreateDbConnectionReq) -> DbConnectionConfig {
        let id = uuid::Uuid::new_v4().to_string();
        let config = DbConnectionConfig {
            id: id.clone(),
            name: req.name,
            engine: req.engine,
            host: req.host,
            port: req.port,
            username: req.username,
            password: req.password,
            database: req.database,
            sqlite_path: req.sqlite_path,
            group: req.group,
            ssl_enabled: req.ssl_enabled.unwrap_or(false),
        };
        self.configs.write().await.insert(id, config.clone());
        config
    }

    pub async fn list_connections(&self) -> Vec<DbConnectionConfig> {
        let configs = self.configs.read().await;
        let mut list: Vec<_> = configs.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn get_connection(&self, id: &str) -> Option<DbConnectionConfig> {
        self.configs.read().await.get(id).cloned()
    }

    pub async fn delete_connection(&self, id: &str) -> bool {
        self.disconnect(id).await;
        self.configs.write().await.remove(id).is_some()
    }

    pub async fn test_connection(&self, id: &str) -> Option<DbTestResult> {
        let config = self.configs.read().await.get(id)?.clone();
        Some(Self::test_config(&config).await)
    }

    /// Test a connection inline from a create request (without saving).
    pub async fn test_connection_inline(&self, req: &CreateDbConnectionReq) -> DbTestResult {
        let config = DbConnectionConfig {
            id: String::new(),
            name: req.name.clone(),
            engine: req.engine.clone(),
            host: req.host.clone(),
            port: req.port,
            username: req.username.clone(),
            password: req.password.clone(),
            database: req.database.clone(),
            sqlite_path: req.sqlite_path.clone(),
            group: req.group.clone(),
            ssl_enabled: req.ssl_enabled.unwrap_or(false),
        };
        Self::test_config(&config).await
    }

    #[allow(clippy::too_many_lines)]
    async fn test_config(config: &DbConnectionConfig) -> DbTestResult {
        let start = Instant::now();
        let latency = |s: &Instant| u64::try_from(s.elapsed().as_millis()).unwrap_or(u64::MAX);

        match config.engine {
            DbEngine::Sqlite => {
                let path = config.sqlite_path.as_deref().unwrap_or(":memory:");
                match rusqlite::Connection::open(path) {
                    Ok(conn) => {
                        let version: String = conn
                            .query_row("SELECT sqlite_version()", [], |row| row.get(0))
                            .unwrap_or_default();
                        DbTestResult {
                            success: true,
                            message: "Connected successfully".into(),
                            latency_ms: Some(latency(&start)),
                            server_version: Some(format!("SQLite {version}")),
                        }
                    }
                    Err(e) => DbTestResult {
                        success: false,
                        message: format!("Connection failed: {e}"),
                        latency_ms: Some(latency(&start)),
                        server_version: None,
                    },
                }
            }
            DbEngine::PostgreSql => {
                let pg = build_pg_config(config);
                match pg.connect(tokio_postgres::NoTls).await {
                    Ok((client, connection)) => {
                        let driver = tokio::spawn(async move {
                            if let Err(e) = connection.await {
                                error!("PG test-connection driver error: {e}");
                            }
                        });
                        let result = match client.query_one("SELECT version()", &[]).await {
                            Ok(row) => {
                                let version: String = row.get(0);
                                DbTestResult {
                                    success: true,
                                    message: "Connected successfully".into(),
                                    latency_ms: Some(latency(&start)),
                                    server_version: Some(version),
                                }
                            }
                            Err(e) => DbTestResult {
                                success: false,
                                message: format!("Query failed: {e}"),
                                latency_ms: Some(latency(&start)),
                                server_version: None,
                            },
                        };
                        driver.abort();
                        result
                    }
                    Err(e) => DbTestResult {
                        success: false,
                        message: format!("Connection failed: {e}"),
                        latency_ms: Some(latency(&start)),
                        server_version: None,
                    },
                }
            }
            DbEngine::MySql => {
                let opts = build_mysql_opts(config);
                match mysql_async::Conn::new(opts).await {
                    Ok(mut conn) => {
                        let result = match conn.query_first::<String, _>("SELECT VERSION()").await {
                            Ok(Some(version)) => DbTestResult {
                                success: true,
                                message: "Connected successfully".into(),
                                latency_ms: Some(latency(&start)),
                                server_version: Some(version),
                            },
                            Ok(None) => DbTestResult {
                                success: true,
                                message: "Connected (no version info)".into(),
                                latency_ms: Some(latency(&start)),
                                server_version: None,
                            },
                            Err(e) => DbTestResult {
                                success: false,
                                message: format!("Query failed: {e}"),
                                latency_ms: Some(latency(&start)),
                                server_version: None,
                            },
                        };
                        let _ = conn.disconnect().await;
                        result
                    }
                    Err(e) => DbTestResult {
                        success: false,
                        message: format!("Connection failed: {e}"),
                        latency_ms: Some(latency(&start)),
                        server_version: None,
                    },
                }
            }
        }
    }

    /// Connect to a database (creates a pool entry).
    pub async fn connect(&self, id: &str) -> Result<(), String> {
        let config = self
            .configs
            .read()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| "Connection not found".to_string())?;

        let pool = match config.engine {
            DbEngine::Sqlite => {
                let path = config.sqlite_path.as_deref().unwrap_or(":memory:");
                let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
                DbPool::Sqlite(Arc::new(std::sync::Mutex::new(conn)))
            }
            DbEngine::PostgreSql => {
                let pg = build_pg_config(&config);
                let (client, connection) = pg
                    .connect(tokio_postgres::NoTls)
                    .await
                    .map_err(|e| e.to_string())?;
                let driver = tokio::spawn(async move {
                    if let Err(e) = connection.await {
                        error!("PostgreSQL connection driver error: {e}");
                    }
                });
                DbPool::Postgres { client, driver }
            }
            DbEngine::MySql => {
                let opts = build_mysql_opts(&config);
                let conn = mysql_async::Conn::new(opts)
                    .await
                    .map_err(|e| e.to_string())?;
                DbPool::Mysql(Arc::new(tokio::sync::Mutex::new(conn)))
            }
        };

        self.pools.write().await.insert(id.to_string(), pool);
        info!("Connected to database {id}");
        Ok(())
    }

    pub async fn disconnect(&self, id: &str) {
        if let Some(pool) = self.pools.write().await.remove(id) {
            match pool {
                DbPool::Postgres { driver, .. } => {
                    driver.abort();
                }
                DbPool::Mysql(conn) => {
                    if let Ok(mutex) = Arc::try_unwrap(conn) {
                        let conn = mutex.into_inner();
                        let _ = conn.disconnect().await;
                    }
                }
                DbPool::Sqlite(_) => {}
            }
        }
    }

    /// List schemas for a connected database.
    #[allow(clippy::too_many_lines)]
    pub async fn list_schemas(&self, id: &str) -> Result<Vec<SchemaInfo>, String> {
        let pools = self.pools.read().await;
        let pool = pools.get(id).ok_or("Not connected")?;

        match pool {
            DbPool::Sqlite(conn) => {
                let conn = conn.lock().unwrap();
                let mut stmt = conn
                    .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
                    .map_err(|e| e.to_string())?;
                let tables: Vec<TableInfo> = stmt
                    .query_map([], |row| {
                        let name: String = row.get(0)?;
                        let ttype: String = row.get(1)?;
                        Ok(TableInfo {
                            name,
                            schema: None,
                            table_type: ttype,
                            row_count_estimate: None,
                        })
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                Ok(vec![SchemaInfo {
                    name: "main".into(),
                    tables,
                }])
            }
            DbPool::Postgres { client, .. } => {
                // Get all user schemas
                let schema_rows = client
                    .query(
                        "SELECT schema_name FROM information_schema.schemata \
                         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
                         ORDER BY schema_name",
                        &[],
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                let mut schema_map: HashMap<String, Vec<TableInfo>> = HashMap::new();
                for row in &schema_rows {
                    let name: String = row.get(0);
                    schema_map.entry(name).or_default();
                }

                // Get all tables in user schemas
                let table_rows = client
                    .query(
                        "SELECT table_schema, table_name, table_type \
                         FROM information_schema.tables \
                         WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
                         ORDER BY table_schema, table_name",
                        &[],
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                for row in &table_rows {
                    let schema: String = row.get(0);
                    let table_name: String = row.get(1);
                    let table_type: String = row.get(2);
                    schema_map
                        .entry(schema.clone())
                        .or_default()
                        .push(TableInfo {
                            name: table_name,
                            schema: Some(schema),
                            table_type: normalise_table_type(&table_type),
                            row_count_estimate: None,
                        });
                }

                let mut result: Vec<SchemaInfo> = schema_map
                    .into_iter()
                    .map(|(name, tables)| SchemaInfo { name, tables })
                    .collect();
                result.sort_by(|a, b| a.name.cmp(&b.name));
                Ok(result)
            }
            DbPool::Mysql(conn) => {
                let mut conn = conn.lock().await;

                // Get all user databases
                let schema_rows: Vec<(String,)> = conn
                    .query(
                        "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA \
                         WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys') \
                         ORDER BY SCHEMA_NAME",
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                let mut schema_map: HashMap<String, Vec<TableInfo>> = HashMap::new();
                for (name,) in &schema_rows {
                    schema_map.entry(name.clone()).or_default();
                }

                // Get all tables
                let table_rows: Vec<(String, String, String)> = conn
                    .query(
                        "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE \
                         FROM INFORMATION_SCHEMA.TABLES \
                         WHERE TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys') \
                         ORDER BY TABLE_SCHEMA, TABLE_NAME",
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                for (schema, table_name, table_type) in &table_rows {
                    schema_map
                        .entry(schema.clone())
                        .or_default()
                        .push(TableInfo {
                            name: table_name.clone(),
                            schema: Some(schema.clone()),
                            table_type: normalise_table_type(table_type),
                            row_count_estimate: None,
                        });
                }

                let mut result: Vec<SchemaInfo> = schema_map
                    .into_iter()
                    .map(|(name, tables)| SchemaInfo { name, tables })
                    .collect();
                result.sort_by(|a, b| a.name.cmp(&b.name));
                Ok(result)
            }
        }
    }

    /// Get table structure (columns + indexes).
    #[allow(clippy::too_many_lines, clippy::type_complexity)]
    pub async fn table_structure(
        &self,
        conn_id: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableStructure, String> {
        let pools = self.pools.read().await;
        let pool = pools.get(conn_id).ok_or("Not connected")?;

        match pool {
            DbPool::Sqlite(conn) => {
                let conn = conn.lock().unwrap();
                let mut stmt = conn
                    .prepare(&format!("PRAGMA table_info('{table}')"))
                    .map_err(|e| e.to_string())?;
                let columns: Vec<ColumnInfo> = stmt
                    .query_map([], |row| {
                        let name: String = row.get(1)?;
                        let data_type: String = row.get(2)?;
                        let notnull: bool = row.get(3)?;
                        let default_value: Option<String> = row.get(4)?;
                        let pk: bool = row.get::<_, i32>(5)? > 0;
                        Ok(ColumnInfo {
                            name,
                            data_type,
                            nullable: !notnull,
                            default_value,
                            is_primary_key: pk,
                            max_length: None,
                            comment: None,
                        })
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                let mut idx_stmt = conn
                    .prepare(&format!("PRAGMA index_list('{table}')"))
                    .map_err(|e| e.to_string())?;
                let indexes: Vec<IndexInfo> = idx_stmt
                    .query_map([], |row| {
                        let name: String = row.get(1)?;
                        let unique: bool = row.get(2)?;
                        Ok((name, unique))
                    })
                    .map_err(|e| e.to_string())?
                    .filter_map(Result::ok)
                    .map(|(name, unique)| {
                        let cols: Vec<String> = conn
                            .prepare(&format!("PRAGMA index_info('{name}')"))
                            .ok()
                            .map(|mut s| {
                                s.query_map([], |row| row.get::<_, String>(2))
                                    .ok()
                                    .map(|iter| iter.filter_map(Result::ok).collect())
                                    .unwrap_or_default()
                            })
                            .unwrap_or_default();
                        IndexInfo {
                            is_primary: name.contains("autoindex"),
                            name,
                            columns: cols,
                            is_unique: unique,
                        }
                    })
                    .collect();

                Ok(TableStructure { columns, indexes })
            }
            DbPool::Postgres { client, .. } => {
                let schema_name = schema.unwrap_or("public");

                // Columns
                let col_rows = client
                    .query(
                        "SELECT column_name, data_type, is_nullable, column_default, \
                                character_maximum_length \
                         FROM information_schema.columns \
                         WHERE table_schema = $1 AND table_name = $2 \
                         ORDER BY ordinal_position",
                        &[&schema_name, &table],
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                // Primary key columns
                let pk_rows = client
                    .query(
                        "SELECT kcu.column_name \
                         FROM information_schema.table_constraints tc \
                         JOIN information_schema.key_column_usage kcu \
                           ON tc.constraint_name = kcu.constraint_name \
                          AND tc.table_schema = kcu.table_schema \
                         WHERE tc.constraint_type = 'PRIMARY KEY' \
                           AND tc.table_schema = $1 AND tc.table_name = $2",
                        &[&schema_name, &table],
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                let pk_cols: Vec<String> = pk_rows.iter().map(|r| r.get(0)).collect();

                let columns: Vec<ColumnInfo> = col_rows
                    .iter()
                    .map(|row| {
                        let name: String = row.get(0);
                        let data_type: String = row.get(1);
                        let nullable_str: String = row.get(2);
                        let default_value: Option<String> = row.get(3);
                        let max_length: Option<i32> = row.get(4);
                        ColumnInfo {
                            is_primary_key: pk_cols.contains(&name),
                            name,
                            data_type,
                            nullable: nullable_str == "YES",
                            default_value,
                            max_length: max_length.map(i64::from),
                            comment: None,
                        }
                    })
                    .collect();

                // Indexes
                let idx_rows = client
                    .query(
                        "SELECT i.relname, ix.indisunique, ix.indisprimary, \
                                array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) \
                         FROM pg_index ix \
                         JOIN pg_class t ON t.oid = ix.indrelid \
                         JOIN pg_class i ON i.oid = ix.indexrelid \
                         JOIN pg_namespace n ON n.oid = t.relnamespace \
                         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) \
                         WHERE n.nspname = $1 AND t.relname = $2 \
                         GROUP BY i.relname, ix.indisunique, ix.indisprimary",
                        &[&schema_name, &table],
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                let indexes: Vec<IndexInfo> = idx_rows
                    .iter()
                    .map(|row| {
                        let name: String = row.get(0);
                        let is_unique: bool = row.get(1);
                        let is_primary: bool = row.get(2);
                        let cols: Vec<String> =
                            row.try_get::<_, Vec<String>>(3).unwrap_or_default();
                        IndexInfo {
                            name,
                            columns: cols,
                            is_unique,
                            is_primary,
                        }
                    })
                    .collect();

                Ok(TableStructure { columns, indexes })
            }
            DbPool::Mysql(conn) => {
                let mut conn = conn.lock().await;

                // Resolve schema — fall back to connected database
                let schema_name = if let Some(s) = schema {
                    s.to_string()
                } else {
                    let configs = self.configs.read().await;
                    configs
                        .get(conn_id)
                        .and_then(|c| c.database.clone())
                        .unwrap_or_default()
                };

                // Columns
                let col_rows: Vec<(String, String, String, Option<String>, Option<i64>)> = conn
                    .exec(
                        "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, \
                                CHARACTER_MAXIMUM_LENGTH \
                         FROM INFORMATION_SCHEMA.COLUMNS \
                         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
                         ORDER BY ORDINAL_POSITION",
                        (&schema_name, table),
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                // Primary key columns
                let pk_rows: Vec<(String,)> = conn
                    .exec(
                        "SELECT COLUMN_NAME \
                         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE \
                         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'",
                        (&schema_name, table),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                let pk_cols: Vec<String> = pk_rows.into_iter().map(|(c,)| c).collect();

                let columns: Vec<ColumnInfo> = col_rows
                    .into_iter()
                    .map(
                        |(name, data_type, nullable_str, default_value, max_length)| ColumnInfo {
                            is_primary_key: pk_cols.contains(&name),
                            name,
                            data_type,
                            nullable: nullable_str == "YES",
                            default_value,
                            max_length,
                            comment: None,
                        },
                    )
                    .collect();

                // Indexes
                let idx_rows: Vec<(String, String, i64)> = conn
                    .exec(
                        "SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE \
                         FROM INFORMATION_SCHEMA.STATISTICS \
                         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
                         ORDER BY INDEX_NAME, SEQ_IN_INDEX",
                        (&schema_name, table),
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                let mut idx_map: HashMap<String, (Vec<String>, bool, bool)> = HashMap::new();
                for (idx_name, col_name, non_unique) in idx_rows {
                    let is_primary = idx_name == "PRIMARY";
                    let entry = idx_map
                        .entry(idx_name)
                        .or_insert_with(|| (Vec::new(), non_unique == 0, is_primary));
                    entry.0.push(col_name);
                }

                let indexes: Vec<IndexInfo> = idx_map
                    .into_iter()
                    .map(|(name, (columns, is_unique, is_primary))| IndexInfo {
                        name,
                        columns,
                        is_unique,
                        is_primary,
                    })
                    .collect();

                Ok(TableStructure { columns, indexes })
            }
        }
    }

    /// Get paginated table data.
    #[allow(clippy::too_many_lines)]
    pub async fn table_data(
        &self,
        conn_id: &str,
        req: &TableDataReq,
    ) -> Result<QueryResult, String> {
        let pools = self.pools.read().await;
        let pool = pools.get(conn_id).ok_or("Not connected")?;
        let start = Instant::now();

        match pool {
            DbPool::Sqlite(conn) => {
                let conn = conn.lock().unwrap();
                let table = &req.table;
                let offset = (req.page.saturating_sub(1)) * req.page_size;
                let limit = req.page_size.min(1000);
                let order = req
                    .order_by
                    .as_deref()
                    .map(|col| {
                        let dir = req.order_dir.as_deref().unwrap_or("ASC");
                        format!(" ORDER BY \"{col}\" {dir}")
                    })
                    .unwrap_or_default();

                let sql = format!("SELECT * FROM \"{table}\"{order} LIMIT {limit} OFFSET {offset}");
                let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
                let col_count = stmt.column_count();
                let columns: Vec<String> = (0..col_count)
                    .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
                    .collect();

                let rows: Vec<Vec<Value>> = stmt
                    .query_map([], |row| {
                        let mut vals = Vec::with_capacity(col_count);
                        for i in 0..col_count {
                            let val: Value = match row.get_ref(i) {
                                Ok(rusqlite::types::ValueRef::Integer(n)) => Value::from(n),
                                Ok(rusqlite::types::ValueRef::Real(f)) => {
                                    serde_json::Number::from_f64(f)
                                        .map_or(Value::Null, Value::Number)
                                }
                                Ok(rusqlite::types::ValueRef::Text(t)) => {
                                    Value::String(String::from_utf8_lossy(t).into_owned())
                                }
                                Ok(rusqlite::types::ValueRef::Blob(b)) => {
                                    Value::String(format!("[BLOB {} bytes]", b.len()))
                                }
                                Ok(rusqlite::types::ValueRef::Null) | Err(_) => Value::Null,
                            };
                            vals.push(val);
                        }
                        Ok(vals)
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                let row_count = rows.len();
                Ok(QueryResult {
                    columns,
                    rows,
                    row_count,
                    affected_rows: None,
                    execution_time_ms: u64::try_from(start.elapsed().as_millis())
                        .unwrap_or(u64::MAX),
                })
            }
            DbPool::Postgres { client, .. } => {
                let schema = req.schema.as_deref().unwrap_or("public");
                let limit = req.page_size.min(1000);
                let offset = req.page.saturating_sub(1) * req.page_size;

                let order_clause = req
                    .order_by
                    .as_ref()
                    .map(|col| {
                        let dir = match req.order_dir.as_deref() {
                            Some(d) if d.eq_ignore_ascii_case("DESC") => "DESC",
                            _ => "ASC",
                        };
                        format!(" ORDER BY {} {dir}", pg_quote_ident(col))
                    })
                    .unwrap_or_default();

                let sql = format!(
                    "SELECT * FROM {}.{}{order_clause} LIMIT {limit} OFFSET {offset}",
                    pg_quote_ident(schema),
                    pg_quote_ident(&req.table),
                );

                // Use prepare + query for proper type conversion and column info
                let stmt = client.prepare(&sql).await.map_err(|e| e.to_string())?;
                let columns: Vec<String> = stmt
                    .columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect();
                let col_types: Vec<tokio_postgres::types::Type> =
                    stmt.columns().iter().map(|c| c.type_().clone()).collect();
                let pg_rows = client.query(&stmt, &[]).await.map_err(|e| e.to_string())?;
                let rows: Vec<Vec<Value>> = pg_rows
                    .iter()
                    .map(|row| {
                        col_types
                            .iter()
                            .enumerate()
                            .map(|(i, ty)| pg_row_value(row, i, ty))
                            .collect()
                    })
                    .collect();

                let row_count = rows.len();
                Ok(QueryResult {
                    columns,
                    rows,
                    row_count,
                    affected_rows: None,
                    execution_time_ms: u64::try_from(start.elapsed().as_millis())
                        .unwrap_or(u64::MAX),
                })
            }
            DbPool::Mysql(conn) => {
                let mut conn = conn.lock().await;

                let schema = req.schema.as_deref().unwrap_or("");
                let limit = req.page_size.min(1000);
                let offset = req.page.saturating_sub(1) * req.page_size;

                let order_clause = req
                    .order_by
                    .as_ref()
                    .map(|col| {
                        let dir = match req.order_dir.as_deref() {
                            Some(d) if d.eq_ignore_ascii_case("DESC") => "DESC",
                            _ => "ASC",
                        };
                        format!(" ORDER BY {} {dir}", mysql_quote_ident(col))
                    })
                    .unwrap_or_default();

                let table_ref = if schema.is_empty() {
                    mysql_quote_ident(&req.table)
                } else {
                    format!(
                        "{}.{}",
                        mysql_quote_ident(schema),
                        mysql_quote_ident(&req.table)
                    )
                };
                let sql = format!(
                    "SELECT * FROM {table_ref}{order_clause} LIMIT {limit} OFFSET {offset}"
                );

                let mut result = conn.query_iter(&sql).await.map_err(|e| e.to_string())?;
                let columns: Vec<String> = result
                    .columns_ref()
                    .iter()
                    .map(|c| c.name_str().to_string())
                    .collect();
                let mysql_rows: Vec<mysql_async::Row> =
                    result.collect().await.map_err(|e| e.to_string())?;

                let rows: Vec<Vec<Value>> = mysql_rows
                    .into_iter()
                    .map(|row| row.unwrap().into_iter().map(mysql_value_to_json).collect())
                    .collect();

                let row_count = rows.len();
                Ok(QueryResult {
                    columns,
                    rows,
                    row_count,
                    affected_rows: None,
                    execution_time_ms: u64::try_from(start.elapsed().as_millis())
                        .unwrap_or(u64::MAX),
                })
            }
        }
    }

    /// Execute arbitrary SQL.
    #[allow(clippy::too_many_lines)]
    pub async fn execute_sql(&self, conn_id: &str, sql: &str) -> Result<QueryResult, String> {
        let pools = self.pools.read().await;
        let pool = pools.get(conn_id).ok_or("Not connected")?;
        let start = Instant::now();

        match pool {
            DbPool::Sqlite(conn) => {
                let conn = conn.lock().unwrap();
                let trimmed = sql.trim();

                // Detect if it's a SELECT query
                if trimmed.to_uppercase().starts_with("SELECT")
                    || trimmed.to_uppercase().starts_with("PRAGMA")
                    || trimmed.to_uppercase().starts_with("EXPLAIN")
                {
                    let mut stmt = conn.prepare(trimmed).map_err(|e| e.to_string())?;
                    let col_count = stmt.column_count();
                    let columns: Vec<String> = (0..col_count)
                        .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
                        .collect();

                    let rows: Vec<Vec<Value>> = stmt
                        .query_map([], |row| {
                            let mut vals = Vec::with_capacity(col_count);
                            for i in 0..col_count {
                                let val: Value = match row.get_ref(i) {
                                    Ok(rusqlite::types::ValueRef::Integer(n)) => Value::from(n),
                                    Ok(rusqlite::types::ValueRef::Real(f)) => {
                                        serde_json::Number::from_f64(f)
                                            .map_or(Value::Null, Value::Number)
                                    }
                                    Ok(rusqlite::types::ValueRef::Text(t)) => {
                                        Value::String(String::from_utf8_lossy(t).into_owned())
                                    }
                                    Ok(rusqlite::types::ValueRef::Blob(b)) => {
                                        Value::String(format!("[BLOB {} bytes]", b.len()))
                                    }
                                    Ok(rusqlite::types::ValueRef::Null) | Err(_) => Value::Null,
                                };
                                vals.push(val);
                            }
                            Ok(vals)
                        })
                        .map_err(|e| e.to_string())?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|e| e.to_string())?;

                    let row_count = rows.len();
                    Ok(QueryResult {
                        columns,
                        rows,
                        row_count,
                        affected_rows: None,
                        execution_time_ms: u64::try_from(start.elapsed().as_millis())
                            .unwrap_or(u64::MAX),
                    })
                } else {
                    let affected = conn
                        .execute_batch(trimmed)
                        .map(|()| 0u64)
                        .map_err(|e| e.to_string())?;
                    Ok(QueryResult {
                        columns: vec![],
                        rows: vec![],
                        row_count: 0,
                        affected_rows: Some(affected),
                        execution_time_ms: u64::try_from(start.elapsed().as_millis())
                            .unwrap_or(u64::MAX),
                    })
                }
            }
            DbPool::Postgres { client, .. } => {
                let trimmed = sql.trim();
                let upper = trimmed.to_uppercase();

                if upper.starts_with("SELECT")
                    || upper.starts_with("WITH")
                    || upper.starts_with("EXPLAIN")
                    || upper.starts_with("SHOW")
                {
                    // SELECT-like: use prepare + query for column info and type conversion
                    let stmt = client.prepare(trimmed).await.map_err(|e| e.to_string())?;
                    let columns: Vec<String> = stmt
                        .columns()
                        .iter()
                        .map(|c| c.name().to_string())
                        .collect();
                    let col_types: Vec<tokio_postgres::types::Type> =
                        stmt.columns().iter().map(|c| c.type_().clone()).collect();
                    let pg_rows = client.query(&stmt, &[]).await.map_err(|e| e.to_string())?;
                    let rows: Vec<Vec<Value>> = pg_rows
                        .iter()
                        .map(|row| {
                            col_types
                                .iter()
                                .enumerate()
                                .map(|(i, ty)| pg_row_value(row, i, ty))
                                .collect()
                        })
                        .collect();

                    let row_count = rows.len();
                    Ok(QueryResult {
                        columns,
                        rows,
                        row_count,
                        affected_rows: None,
                        execution_time_ms: u64::try_from(start.elapsed().as_millis())
                            .unwrap_or(u64::MAX),
                    })
                } else {
                    // Non-SELECT: use simple_query for DML/DDL
                    let messages = client
                        .simple_query(trimmed)
                        .await
                        .map_err(|e| e.to_string())?;

                    let mut affected_total = 0u64;
                    for msg in &messages {
                        if let tokio_postgres::SimpleQueryMessage::CommandComplete(n) = msg {
                            affected_total += n;
                        }
                    }

                    Ok(QueryResult {
                        columns: vec![],
                        rows: vec![],
                        row_count: 0,
                        affected_rows: Some(affected_total),
                        execution_time_ms: u64::try_from(start.elapsed().as_millis())
                            .unwrap_or(u64::MAX),
                    })
                }
            }
            DbPool::Mysql(conn) => {
                let mut conn = conn.lock().await;
                let trimmed = sql.trim();
                let upper = trimmed.to_uppercase();

                if upper.starts_with("SELECT")
                    || upper.starts_with("SHOW")
                    || upper.starts_with("DESCRIBE")
                    || upper.starts_with("EXPLAIN")
                {
                    let mut result = conn.query_iter(trimmed).await.map_err(|e| e.to_string())?;
                    let columns: Vec<String> = result
                        .columns_ref()
                        .iter()
                        .map(|c| c.name_str().to_string())
                        .collect();
                    let mysql_rows: Vec<mysql_async::Row> =
                        result.collect().await.map_err(|e| e.to_string())?;

                    let rows: Vec<Vec<Value>> = mysql_rows
                        .into_iter()
                        .map(|row| row.unwrap().into_iter().map(mysql_value_to_json).collect())
                        .collect();

                    let row_count = rows.len();
                    Ok(QueryResult {
                        columns,
                        rows,
                        row_count,
                        affected_rows: None,
                        execution_time_ms: u64::try_from(start.elapsed().as_millis())
                            .unwrap_or(u64::MAX),
                    })
                } else {
                    conn.query_drop(trimmed).await.map_err(|e| e.to_string())?;
                    let affected = conn.affected_rows();
                    Ok(QueryResult {
                        columns: vec![],
                        rows: vec![],
                        row_count: 0,
                        affected_rows: Some(affected),
                        execution_time_ms: u64::try_from(start.elapsed().as_millis())
                            .unwrap_or(u64::MAX),
                    })
                }
            }
        }
    }
}

impl Default for DbManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_list() {
        let mgr = DbManager::new();
        let conn = mgr
            .create_connection(CreateDbConnectionReq {
                name: "test-sqlite".into(),
                engine: DbEngine::Sqlite,
                host: None,
                port: None,
                username: None,
                password: None,
                database: None,
                file_path: Some(":memory:".into()),
                group: None,
                ssl_enabled: None,
            })
            .await;
        assert_eq!(conn.name, "test-sqlite");
        let list = mgr.list_connections().await;
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_sqlite_connect_and_query() {
        let mgr = DbManager::new();
        let conn = mgr
            .create_connection(CreateDbConnectionReq {
                name: "mem".into(),
                engine: DbEngine::Sqlite,
                host: None,
                port: None,
                username: None,
                password: None,
                database: None,
                file_path: Some(":memory:".into()),
                group: None,
                ssl_enabled: None,
            })
            .await;

        mgr.connect(&conn.id).await.unwrap();

        // Create a test table
        mgr.execute_sql(
            &conn.id,
            "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)",
        )
        .await
        .unwrap();
        mgr.execute_sql(&conn.id, "INSERT INTO test VALUES (1, 'hello')")
            .await
            .unwrap();

        // List schemas
        let schemas = mgr.list_schemas(&conn.id).await.unwrap();
        assert!(!schemas.is_empty());
        assert!(schemas[0].tables.iter().any(|t| t.name == "test"));

        // Table structure
        let structure = mgr.table_structure(&conn.id, None, "test").await.unwrap();
        assert_eq!(structure.columns.len(), 2);
        assert_eq!(structure.columns[0].name, "id");

        // Table data
        let data = mgr
            .table_data(
                &conn.id,
                &TableDataReq {
                    schema: None,
                    table: "test".into(),
                    page: 1,
                    page_size: 100,
                    order_by: None,
                    order_dir: None,
                    filter: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(data.row_count, 1);

        // SQL execution
        let result = mgr
            .execute_sql(&conn.id, "SELECT * FROM test WHERE id = 1")
            .await
            .unwrap();
        assert_eq!(result.row_count, 1);
    }

    #[tokio::test]
    async fn test_delete_connection() {
        let mgr = DbManager::new();
        let conn = mgr
            .create_connection(CreateDbConnectionReq {
                name: "temp".into(),
                engine: DbEngine::Sqlite,
                host: None,
                port: None,
                username: None,
                password: None,
                database: None,
                file_path: None,
                group: None,
                ssl_enabled: None,
            })
            .await;
        assert!(mgr.delete_connection(&conn.id).await);
        assert!(mgr.get_connection(&conn.id).await.is_none());
    }

    // -- Helper function tests --

    #[test]
    fn test_pg_quote_ident() {
        assert_eq!(pg_quote_ident("users"), "\"users\"");
        assert_eq!(pg_quote_ident("my\"table"), "\"my\"\"table\"");
        assert_eq!(pg_quote_ident("public"), "\"public\"");
    }

    #[test]
    fn test_mysql_quote_ident() {
        assert_eq!(mysql_quote_ident("users"), "`users`");
        assert_eq!(mysql_quote_ident("my`table"), "`my``table`");
    }

    #[test]
    fn test_normalise_table_type() {
        assert_eq!(normalise_table_type("BASE TABLE"), "table");
        assert_eq!(normalise_table_type("VIEW"), "view");
        assert_eq!(normalise_table_type("SYSTEM VIEW"), "view");
        assert_eq!(normalise_table_type("OTHER"), "other");
    }

    #[test]
    fn test_mysql_value_to_json_variants() {
        assert_eq!(mysql_value_to_json(mysql_async::Value::NULL), Value::Null);
        assert_eq!(
            mysql_value_to_json(mysql_async::Value::Int(42)),
            Value::from(42i64)
        );
        assert_eq!(
            mysql_value_to_json(mysql_async::Value::UInt(99)),
            Value::from(99u64)
        );
        assert_eq!(
            mysql_value_to_json(mysql_async::Value::Bytes(b"hello".to_vec())),
            Value::String("hello".into())
        );
        assert_eq!(
            mysql_value_to_json(mysql_async::Value::Date(2024, 1, 15, 0, 0, 0, 0)),
            Value::String("2024-01-15".into())
        );
        assert_eq!(
            mysql_value_to_json(mysql_async::Value::Date(2024, 1, 15, 10, 30, 45, 0)),
            Value::String("2024-01-15 10:30:45".into())
        );
        assert_eq!(
            mysql_value_to_json(mysql_async::Value::Time(false, 0, 1, 30, 0, 0)),
            Value::String("1:30:00".into())
        );
    }

    #[test]
    fn test_build_pg_config() {
        let config = DbConnectionConfig {
            id: "test".into(),
            name: "test".into(),
            engine: DbEngine::PostgreSql,
            host: Some("myhost".into()),
            port: Some(5433),
            username: Some("myuser".into()),
            password: Some("mypass".into()),
            database: Some("mydb".into()),
            file_path: None,
            group: None,
            ssl_enabled: false,
        };
        let pg = build_pg_config(&config);
        // Config doesn't expose getters easily, just ensure it builds without panic
        let _ = format!("{pg:?}");
    }

    #[test]
    fn test_build_mysql_opts() {
        let config = DbConnectionConfig {
            id: "test".into(),
            name: "test".into(),
            engine: DbEngine::MySql,
            host: Some("myhost".into()),
            port: Some(3307),
            username: Some("root".into()),
            password: Some("secret".into()),
            database: Some("testdb".into()),
            file_path: None,
            group: None,
            ssl_enabled: false,
        };
        let opts = build_mysql_opts(&config);
        assert_eq!(opts.ip_or_hostname(), "myhost");
        assert_eq!(opts.tcp_port(), 3307);
    }

    #[tokio::test]
    async fn test_pg_connect_fails_gracefully() {
        let mgr = DbManager::new();
        let conn = mgr
            .create_connection(CreateDbConnectionReq {
                name: "pg-fail".into(),
                engine: DbEngine::PostgreSql,
                host: Some("127.0.0.1".into()),
                port: Some(59999),
                username: Some("test".into()),
                password: Some("test".into()),
                database: Some("testdb".into()),
                file_path: None,
                group: None,
                ssl_enabled: None,
            })
            .await;

        let result = mgr.connect(&conn.id).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_mysql_connect_fails_gracefully() {
        let mgr = DbManager::new();
        let conn = mgr
            .create_connection(CreateDbConnectionReq {
                name: "mysql-fail".into(),
                engine: DbEngine::MySql,
                host: Some("127.0.0.1".into()),
                port: Some(59998),
                username: Some("test".into()),
                password: Some("test".into()),
                database: Some("testdb".into()),
                file_path: None,
                group: None,
                ssl_enabled: None,
            })
            .await;

        let result = mgr.connect(&conn.id).await;
        assert!(result.is_err());
    }
}
