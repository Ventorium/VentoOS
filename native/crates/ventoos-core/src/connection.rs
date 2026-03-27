use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::types::Id;

/// Connection type enumeration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionType {
    Kubernetes,
    Teleport,
    PostgreSql,
    MySql,
    Sqlite,
    Redis,
    Ssh,
    Sftp,
    Ftp,
    Smb,
    S3,
}

/// Connection status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Draft,
    Testing,
    Available,
    Expired,
    Reconnecting,
    AuthFailed,
    NetworkError,
    PermissionDenied,
    ResourceNotFound,
}

/// Tunnel type for connections.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TunnelType {
    None,
    Ssh(SshTunnelConfig),
    Http(HttpTunnelConfig),
}

/// SSH tunnel configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshTunnelConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    /// Credential reference ID, never store plaintext passwords.
    pub credential_id: Option<Id>,
}

/// HTTP tunnel configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpTunnelConfig {
    pub proxy_url: String,
    pub credential_id: Option<Id>,
}

/// A connection definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: Id,
    pub name: String,
    pub connection_type: ConnectionType,
    pub group: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub credential_id: Option<Id>,
    pub database: Option<String>,
    pub tunnel: TunnelType,
    pub status: ConnectionStatus,
    pub is_temporary: bool,
    pub source_resource_id: Option<Id>,
    pub extra: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

/// Request to create a new connection.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateConnectionRequest {
    pub name: String,
    pub connection_type: ConnectionType,
    pub group: Option<String>,
    pub tags: Option<Vec<String>>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub credential_id: Option<Id>,
    pub database: Option<String>,
    pub tunnel: Option<TunnelType>,
    pub extra: Option<serde_json::Value>,
}

/// Request to update an existing connection.
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateConnectionRequest {
    pub name: Option<String>,
    pub group: Option<String>,
    pub tags: Option<Vec<String>>,
    pub favorite: Option<bool>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub credential_id: Option<Id>,
    pub database: Option<String>,
    pub tunnel: Option<TunnelType>,
    pub extra: Option<serde_json::Value>,
}

/// Connection test result.
#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_serialization() {
        let conn = Connection {
            id: crate::types::new_id(),
            name: "test-pg".to_string(),
            connection_type: ConnectionType::PostgreSql,
            group: Some("production".to_string()),
            tags: vec!["db".to_string()],
            favorite: false,
            host: Some("localhost".to_string()),
            port: Some(5432),
            username: Some("postgres".to_string()),
            credential_id: None,
            database: Some("mydb".to_string()),
            tunnel: TunnelType::None,
            status: ConnectionStatus::Draft,
            is_temporary: false,
            source_resource_id: None,
            extra: serde_json::Value::Null,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_used_at: None,
        };

        let json = serde_json::to_string(&conn).unwrap();
        let deserialized: Connection = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test-pg");
        assert_eq!(deserialized.connection_type, ConnectionType::PostgreSql);
    }
}
