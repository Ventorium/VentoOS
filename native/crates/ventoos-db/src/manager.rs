use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use serde_json::Value;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::types::*;

/// Database connection manager.
/// Manages multiple database connections and provides schema browsing + SQL execution.
pub struct DbManager {
    configs: Arc<RwLock<HashMap<String, DbConnectionConfig>>>,
    /// Active connection pools keyed by config id.
    pools: Arc<RwLock<HashMap<String, DbPool>>>,
}

/// Internal pool wrapper — uses rusqlite for SQLite, raw TCP for PG/MySQL.
/// For this implementation we use rusqlite for SQLite and stub PG/MySQL queries
/// via a simple TCP connection approach (production would use sqlx).
enum DbPool {
    Sqlite(Arc<std::sync::Mutex<rusqlite::Connection>>),
    /// For PG/MySQL we store the config and create connections on demand.
    Remote(DbConnectionConfig),
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
            file_path: req.file_path,
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
        self.pools.write().await.remove(id);
        self.configs.write().await.remove(id).is_some()
    }

    pub async fn test_connection(&self, id: &str) -> Option<DbTestResult> {
        let config = self.configs.read().await.get(id)?.clone();
        let start = Instant::now();

        match config.engine {
            DbEngine::Sqlite => {
                let path = config.file_path.as_deref().unwrap_or(":memory:");
                match rusqlite::Connection::open(path) {
                    Ok(conn) => {
                        let version: String = conn
                            .query_row("SELECT sqlite_version()", [], |row| row.get(0))
                            .unwrap_or_default();
                        Some(DbTestResult {
                            success: true,
                            message: "Connected successfully".into(),
                            latency_ms: Some(start.elapsed().as_millis() as u64),
                            server_version: Some(format!("SQLite {version}")),
                        })
                    }
                    Err(e) => Some(DbTestResult {
                        success: false,
                        message: format!("Connection failed: {e}"),
                        latency_ms: Some(start.elapsed().as_millis() as u64),
                        server_version: None,
                    }),
                }
            }
            DbEngine::PostgreSql | DbEngine::MySql => {
                // For PG/MySQL, attempt a TCP connection to verify reachability
                let host = config.host.as_deref().unwrap_or("localhost");
                let port = config.port.unwrap_or(match config.engine {
                    DbEngine::PostgreSql => 5432,
                    DbEngine::MySql => 3306,
                    _ => 0,
                });
                match tokio::net::TcpStream::connect(format!("{host}:{port}")).await {
                    Ok(_) => Some(DbTestResult {
                        success: true,
                        message: format!("TCP connection to {host}:{port} successful"),
                        latency_ms: Some(start.elapsed().as_millis() as u64),
                        server_version: None,
                    }),
                    Err(e) => Some(DbTestResult {
                        success: false,
                        message: format!("Cannot reach {host}:{port}: {e}"),
                        latency_ms: Some(start.elapsed().as_millis() as u64),
                        server_version: None,
                    }),
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
                let path = config.file_path.as_deref().unwrap_or(":memory:");
                let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
                DbPool::Sqlite(Arc::new(std::sync::Mutex::new(conn)))
            }
            DbEngine::PostgreSql | DbEngine::MySql => DbPool::Remote(config),
        };

        self.pools.write().await.insert(id.to_string(), pool);
        info!("Connected to database {id}");
        Ok(())
    }

    pub async fn disconnect(&self, id: &str) {
        self.pools.write().await.remove(id);
    }

    /// List schemas for a connected database.
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
            DbPool::Remote(_config) => {
                // Stub for PG/MySQL — would query information_schema
                Ok(vec![SchemaInfo {
                    name: "public".into(),
                    tables: vec![],
                }])
            }
        }
    }

    /// Get table structure (columns + indexes).
    pub async fn table_structure(
        &self,
        conn_id: &str,
        _schema: Option<&str>,
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
                    .filter_map(|r| r.ok())
                    .map(|(name, unique)| {
                        let cols: Vec<String> = conn
                            .prepare(&format!("PRAGMA index_info('{name}')"))
                            .ok()
                            .map(|mut s| {
                                s.query_map([], |row| row.get::<_, String>(2))
                                    .ok()
                                    .map(|iter| iter.filter_map(|r| r.ok()).collect())
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
            DbPool::Remote(_) => Ok(TableStructure {
                columns: vec![],
                indexes: vec![],
            }),
        }
    }

    /// Get paginated table data.
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

                let sql = format!(
                    "SELECT * FROM \"{table}\"{order} LIMIT {limit} OFFSET {offset}"
                );
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
                                Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                                Ok(rusqlite::types::ValueRef::Integer(n)) => Value::from(n),
                                Ok(rusqlite::types::ValueRef::Real(f)) => {
                                    serde_json::Number::from_f64(f)
                                        .map(Value::Number)
                                        .unwrap_or(Value::Null)
                                }
                                Ok(rusqlite::types::ValueRef::Text(t)) => {
                                    Value::String(String::from_utf8_lossy(t).into_owned())
                                }
                                Ok(rusqlite::types::ValueRef::Blob(b)) => {
                                    Value::String(format!("[BLOB {} bytes]", b.len()))
                                }
                                Err(_) => Value::Null,
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
                    execution_time_ms: start.elapsed().as_millis() as u64,
                })
            }
            DbPool::Remote(_) => Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                row_count: 0,
                affected_rows: None,
                execution_time_ms: start.elapsed().as_millis() as u64,
            }),
        }
    }

    /// Execute arbitrary SQL.
    pub async fn execute_sql(
        &self,
        conn_id: &str,
        sql: &str,
    ) -> Result<QueryResult, String> {
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
                                    Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                                    Ok(rusqlite::types::ValueRef::Integer(n)) => Value::from(n),
                                    Ok(rusqlite::types::ValueRef::Real(f)) => {
                                        serde_json::Number::from_f64(f)
                                            .map(Value::Number)
                                            .unwrap_or(Value::Null)
                                    }
                                    Ok(rusqlite::types::ValueRef::Text(t)) => {
                                        Value::String(String::from_utf8_lossy(t).into_owned())
                                    }
                                    Ok(rusqlite::types::ValueRef::Blob(b)) => {
                                        Value::String(format!("[BLOB {} bytes]", b.len()))
                                    }
                                    Err(_) => Value::Null,
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
                        execution_time_ms: start.elapsed().as_millis() as u64,
                    })
                } else {
                    let affected = conn.execute_batch(trimmed).map(|_| 0u64).map_err(|e| e.to_string())?;
                    Ok(QueryResult {
                        columns: vec![],
                        rows: vec![],
                        row_count: 0,
                        affected_rows: Some(affected),
                        execution_time_ms: start.elapsed().as_millis() as u64,
                    })
                }
            }
            DbPool::Remote(_) => Err("Remote SQL execution not yet implemented".into()),
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
        mgr.execute_sql(&conn.id, "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
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
}
