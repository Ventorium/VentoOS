use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use ventoos_core::types::Id;

/// SSH server definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshServer {
    pub id: Id,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    /// Auth method: password or key.
    pub auth_method: SshAuthMethod,
    pub group: Option<String>,
    pub tags: Vec<String>,
    pub status: SshServerStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_connected_at: Option<DateTime<Utc>>,
}

/// SSH authentication method.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum SshAuthMethod {
    Password {
        /// Credential ID referencing securely stored password.
        /// None when creating — the server generates this after storing the credential.
        #[serde(default)]
        credential_id: Option<Id>,
    },
    PrivateKey {
        /// Path to private key file, or credential ID.
        key_path: Option<String>,
        #[serde(default)]
        credential_id: Option<Id>,
        #[serde(default)]
        passphrase_credential_id: Option<Id>,
    },
}

/// SSH server status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SshServerStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/// Request to create an SSH server.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSshServerRequest {
    pub name: String,
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub auth_method: SshAuthMethod,
    pub group: Option<String>,
    pub tags: Option<Vec<String>>,
    /// Raw password (will be stored securely, not kept in plain text).
    pub password: Option<String>,
    /// Raw private key content (will be stored securely).
    pub private_key: Option<String>,
}

/// Request to update an SSH server.
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSshServerRequest {
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub auth_method: Option<SshAuthMethod>,
    pub group: Option<String>,
    pub tags: Option<Vec<String>>,
    pub password: Option<String>,
    pub private_key: Option<String>,
}

/// Port mapping definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortMapping {
    pub id: Id,
    pub name: String,
    pub ssh_server_id: Id,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
    pub status: PortMappingStatus,
    pub created_at: DateTime<Utc>,
}

/// Port mapping status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PortMappingStatus {
    Stopped,
    Starting,
    Active,
    Error,
}

/// Request to create a port mapping.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePortMappingRequest {
    pub name: String,
    pub ssh_server_id: Id,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
}

/// Service exposure definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceExposure {
    pub id: Id,
    pub name: String,
    /// "local" or "ssh" — where the service runs.
    pub source_type: ServiceSourceType,
    /// SSH server ID if source is remote.
    pub ssh_server_id: Option<Id>,
    pub source_host: String,
    pub source_port: u16,
    /// Public port to listen on.
    pub public_port: u16,
    /// Enable basic auth.
    pub basic_auth_enabled: bool,
    pub basic_auth_username: Option<String>,
    /// Credential ID for basic auth password.
    pub basic_auth_credential_id: Option<Id>,
    pub status: ServiceExposureStatus,
    pub created_at: DateTime<Utc>,
}

/// Service source type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceSourceType {
    Local,
    Ssh,
}

/// Service exposure status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceExposureStatus {
    Stopped,
    Starting,
    Active,
    Error,
}

/// Request to create a service exposure.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateServiceExposureRequest {
    pub name: String,
    pub source_type: ServiceSourceType,
    pub ssh_server_id: Option<Id>,
    pub source_host: String,
    pub source_port: u16,
    pub public_port: u16,
    pub basic_auth_enabled: bool,
    pub basic_auth_username: Option<String>,
    pub basic_auth_password: Option<String>,
}

/// `WebShell` session request.
#[derive(Debug, Serialize, Deserialize)]
pub struct WebShellRequest {
    /// "local" for local PTY, or SSH server ID for remote.
    pub target: WebShellTarget,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

/// `WebShell` target.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum WebShellTarget {
    Local,
    Ssh { server_id: Id },
}

#[cfg(test)]
mod tests {
    use super::*;
    use ventoos_core::types::new_id;

    #[test]
    fn test_ssh_server_serialization() {
        let server = SshServer {
            id: new_id(),
            name: "dev-server".to_string(),
            host: "10.0.0.1".to_string(),
            port: 22,
            username: "root".to_string(),
            auth_method: SshAuthMethod::Password {
                credential_id: None,
            },
            group: Some("dev".to_string()),
            tags: vec!["linux".to_string()],
            status: SshServerStatus::Disconnected,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_connected_at: None,
        };

        let json = serde_json::to_string(&server).unwrap();
        let deserialized: SshServer = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "dev-server");
    }

    #[test]
    fn test_port_mapping_serialization() {
        let mapping = PortMapping {
            id: new_id(),
            name: "pg-tunnel".to_string(),
            ssh_server_id: new_id(),
            remote_host: "localhost".to_string(),
            remote_port: 5432,
            local_port: 15432,
            status: PortMappingStatus::Stopped,
            created_at: Utc::now(),
        };

        let json = serde_json::to_string(&mapping).unwrap();
        let deserialized: PortMapping = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "pg-tunnel");
        assert_eq!(deserialized.local_port, 15432);
    }
}
