use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use tokio::sync::RwLock;
use ventoos_core::connection::{
    Connection, ConnectionStatus, ConnectionTestResult, CreateConnectionRequest, TunnelType,
    UpdateConnectionRequest,
};
use ventoos_core::types::{Id, new_id};

/// Connection manager stores and manages connection definitions.
pub struct ConnectionManager {
    connections: Arc<RwLock<HashMap<Id, Connection>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new connection.
    pub async fn create(&self, req: CreateConnectionRequest) -> Connection {
        let now = Utc::now();
        let conn = Connection {
            id: new_id(),
            name: req.name,
            connection_type: req.connection_type,
            group: req.group,
            tags: req.tags.unwrap_or_default(),
            favorite: false,
            host: req.host,
            port: req.port,
            username: req.username,
            credential_id: req.credential_id,
            database: req.database,
            tunnel: req.tunnel.unwrap_or(TunnelType::None),
            status: ConnectionStatus::Draft,
            is_temporary: false,
            source_resource_id: None,
            extra: req.extra.unwrap_or(serde_json::Value::Null),
            created_at: now,
            updated_at: now,
            last_used_at: None,
        };
        let mut connections = self.connections.write().await;
        connections.insert(conn.id, conn.clone());
        conn
    }

    /// Get a connection by ID.
    pub async fn get(&self, id: Id) -> Option<Connection> {
        let connections = self.connections.read().await;
        connections.get(&id).cloned()
    }

    /// List all connections.
    pub async fn list(&self) -> Vec<Connection> {
        let connections = self.connections.read().await;
        let mut list: Vec<Connection> = connections.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    /// Update a connection.
    pub async fn update(&self, id: Id, req: UpdateConnectionRequest) -> Option<Connection> {
        let mut connections = self.connections.write().await;
        if let Some(conn) = connections.get_mut(&id) {
            if let Some(name) = req.name {
                conn.name = name;
            }
            if let Some(group) = req.group {
                conn.group = Some(group);
            }
            if let Some(tags) = req.tags {
                conn.tags = tags;
            }
            if let Some(favorite) = req.favorite {
                conn.favorite = favorite;
            }
            if let Some(host) = req.host {
                conn.host = Some(host);
            }
            if let Some(port) = req.port {
                conn.port = Some(port);
            }
            if let Some(username) = req.username {
                conn.username = Some(username);
            }
            if let Some(credential_id) = req.credential_id {
                conn.credential_id = Some(credential_id);
            }
            if let Some(database) = req.database {
                conn.database = Some(database);
            }
            if let Some(tunnel) = req.tunnel {
                conn.tunnel = tunnel;
            }
            if let Some(extra) = req.extra {
                conn.extra = extra;
            }
            conn.updated_at = Utc::now();
            Some(conn.clone())
        } else {
            None
        }
    }

    /// Delete a connection.
    pub async fn delete(&self, id: Id) -> bool {
        let mut connections = self.connections.write().await;
        connections.remove(&id).is_some()
    }

    /// Test a connection (stub – real implementation per connection type).
    pub async fn test_connection(&self, id: Id) -> Option<ConnectionTestResult> {
        let connections = self.connections.read().await;
        connections.get(&id).map(|_conn| ConnectionTestResult {
            success: true,
            message: "Connection test passed (stub)".to_string(),
            latency_ms: Some(42),
        })
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ventoos_core::connection::ConnectionType;

    #[tokio::test]
    async fn test_create_and_get_connection() {
        let mgr = ConnectionManager::new();
        let conn = mgr
            .create(CreateConnectionRequest {
                name: "test-pg".to_string(),
                connection_type: ConnectionType::PostgreSql,
                group: Some("dev".to_string()),
                tags: None,
                host: Some("localhost".to_string()),
                port: Some(5432),
                username: Some("postgres".to_string()),
                credential_id: None,
                database: Some("testdb".to_string()),
                tunnel: None,
                extra: None,
            })
            .await;

        assert_eq!(conn.name, "test-pg");
        let fetched = mgr.get(conn.id).await;
        assert!(fetched.is_some());
    }

    #[tokio::test]
    async fn test_update_connection() {
        let mgr = ConnectionManager::new();
        let conn = mgr
            .create(CreateConnectionRequest {
                name: "original".to_string(),
                connection_type: ConnectionType::Redis,
                group: None,
                tags: None,
                host: Some("localhost".to_string()),
                port: Some(6379),
                username: None,
                credential_id: None,
                database: None,
                tunnel: None,
                extra: None,
            })
            .await;

        let updated = mgr
            .update(
                conn.id,
                UpdateConnectionRequest {
                    name: Some("renamed".to_string()),
                    group: None,
                    tags: None,
                    favorite: Some(true),
                    host: None,
                    port: None,
                    username: None,
                    credential_id: None,
                    database: None,
                    tunnel: None,
                    extra: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.name, "renamed");
        assert!(updated.favorite);
    }

    #[tokio::test]
    async fn test_delete_connection() {
        let mgr = ConnectionManager::new();
        let conn = mgr
            .create(CreateConnectionRequest {
                name: "to-delete".to_string(),
                connection_type: ConnectionType::Ssh,
                group: None,
                tags: None,
                host: Some("host".to_string()),
                port: Some(22),
                username: None,
                credential_id: None,
                database: None,
                tunnel: None,
                extra: None,
            })
            .await;

        assert!(mgr.delete(conn.id).await);
        assert!(mgr.get(conn.id).await.is_none());
    }

    #[tokio::test]
    async fn test_list_connections() {
        let mgr = ConnectionManager::new();
        mgr.create(CreateConnectionRequest {
            name: "b-conn".to_string(),
            connection_type: ConnectionType::MySql,
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
        mgr.create(CreateConnectionRequest {
            name: "a-conn".to_string(),
            connection_type: ConnectionType::PostgreSql,
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

        let list = mgr.list().await;
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "a-conn");
    }
}
