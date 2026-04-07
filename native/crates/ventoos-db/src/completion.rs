//! Schema completion data for SQL editor auto-complete.
//!
//! Returns the full schema tree (schemas → tables → columns with types)
//! and supports per-connection caching with manual refresh.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use serde_json::Value;
use tokio::sync::RwLock;

use crate::types::{CompletionColumn, CompletionSchema, CompletionTable, CompletionTree};

/// Per-connection schema cache.
pub struct SchemaCache {
    pub tree: CompletionTree,
    pub last_refresh: Instant,
}

/// Schema cache store keyed by connection ID.
pub struct CompletionCache {
    cache: Arc<RwLock<HashMap<String, SchemaCache>>>,
}

impl CompletionCache {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get cached completion tree if available.
    pub async fn get(&self, conn_id: &str) -> Option<CompletionTree> {
        let cache = self.cache.read().await;
        cache.get(conn_id).map(|c| c.tree.clone())
    }

    /// Store completion tree in cache.
    pub async fn set(&self, conn_id: &str, tree: CompletionTree) {
        let mut cache = self.cache.write().await;
        cache.insert(
            conn_id.to_string(),
            SchemaCache {
                tree,
                last_refresh: Instant::now(),
            },
        );
    }

    /// Invalidate cache for a connection.
    pub async fn invalidate(&self, conn_id: &str) {
        let mut cache = self.cache.write().await;
        cache.remove(conn_id);
    }
}

impl Default for CompletionCache {
    fn default() -> Self {
        Self::new()
    }
}

// ── Query helpers for building completion tree from different engines ──────

/// Build completion tree for `PostgreSQL`.
#[allow(clippy::implicit_hasher)]
pub fn build_pg_tree(schema_rows: &[HashMap<String, Value>]) -> CompletionTree {
    let mut schemas: HashMap<String, Vec<CompletionTable>> = HashMap::new();

    for row in schema_rows {
        let schema_name = row
            .get("table_schema")
            .and_then(Value::as_str)
            .unwrap_or("public")
            .to_string();
        let table_name = row
            .get("table_name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let column_name = row
            .get("column_name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let data_type = row
            .get("data_type")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        let schema_entry = schemas.entry(schema_name).or_default();

        // Find or create table
        let table = schema_entry.iter_mut().find(|t| t.name == table_name);
        if let Some(table) = table {
            table.columns.push(CompletionColumn {
                name: column_name,
                data_type,
            });
        } else {
            schema_entry.push(CompletionTable {
                name: table_name,
                columns: vec![CompletionColumn {
                    name: column_name,
                    data_type,
                }],
            });
        }
    }

    CompletionTree {
        schemas: schemas
            .into_iter()
            .map(|(name, tables)| CompletionSchema { name, tables })
            .collect(),
    }
}

/// Build completion tree for `MySQL`.
#[allow(clippy::implicit_hasher)]
pub fn build_mysql_tree(schema_rows: &[HashMap<String, Value>]) -> CompletionTree {
    // Same structure as PostgreSQL — the query returns the same columns.
    build_pg_tree(schema_rows)
}

/// Build completion tree for `SQLite`.
pub fn build_sqlite_tree(
    tables_with_columns: &[(String, Vec<(String, String)>)],
) -> CompletionTree {
    let tables: Vec<CompletionTable> = tables_with_columns
        .iter()
        .map(|(table_name, cols)| CompletionTable {
            name: table_name.clone(),
            columns: cols
                .iter()
                .map(|(name, dt)| CompletionColumn {
                    name: name.clone(),
                    data_type: dt.clone(),
                })
                .collect(),
        })
        .collect();

    CompletionTree {
        schemas: vec![CompletionSchema {
            name: "main".into(),
            tables,
        }],
    }
}

/// `PostgreSQL` query to fetch all columns in user schemas.
pub const PG_COMPLETION_QUERY: &str = "
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY table_schema, table_name, ordinal_position
";

/// `MySQL` query to fetch all columns in user schemas.
pub const MYSQL_COMPLETION_QUERY: &str = "
SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,
       COLUMN_NAME AS column_name, DATA_TYPE AS data_type
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
";
