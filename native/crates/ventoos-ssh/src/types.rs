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
    pub remark: Option<String>,
    /// Detected OS type (probed after first connection).
    #[serde(default)]
    pub os_type: Option<String>,
    pub status: SshServerStatus,
    /// Connection timeout in milliseconds (default: 10000).
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_ms: u32,
    /// Heartbeat interval in milliseconds (default: 30000, 0 = disabled).
    #[serde(default = "default_heartbeat")]
    pub heartbeat_ms: u32,
    /// Default directory to open on connect.
    pub default_path: Option<String>,
    /// Script to run after connection is established.
    pub init_script: Option<String>,
    /// Jump host (ProxyJump) configuration.
    pub jump_host: Option<JumpHost>,
    /// Proxy configuration.
    pub proxy: Option<ProxyConfig>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_connected_at: Option<DateTime<Utc>>,
}

fn default_connect_timeout() -> u32 {
    10000
}
fn default_heartbeat() -> u32 {
    30000
}

/// Jump host (ProxyJump) configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum JumpHost {
    /// Reference an existing SSH server as jump host.
    Existing { server_id: Id },
    /// Manual jump host configuration.
    Manual {
        host: String,
        port: Option<u16>,
        username: String,
        auth_method: SshAuthMethod,
        #[serde(skip_serializing_if = "Option::is_none")]
        password: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        private_key: Option<String>,
    },
}

/// Proxy configuration for SSH connections.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub enabled: bool,
    /// Proxy address, e.g. "socks5://127.0.0.1:1080" or "http://proxy:8080"
    pub address: String,
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
    /// Use system SSH behavior: try default key files (~/.ssh/id_ed25519, id_rsa, etc.)
    /// and ssh-agent. Used when no explicit key is configured.
    Agent,
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
    pub remark: Option<String>,
    pub connect_timeout_ms: Option<u32>,
    pub heartbeat_ms: Option<u32>,
    pub default_path: Option<String>,
    pub init_script: Option<String>,
    pub jump_host: Option<JumpHost>,
    pub proxy: Option<ProxyConfig>,
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
    pub remark: Option<String>,
    pub connect_timeout_ms: Option<u32>,
    pub heartbeat_ms: Option<u32>,
    pub default_path: Option<String>,
    pub init_script: Option<String>,
    pub jump_host: Option<JumpHost>,
    pub proxy: Option<ProxyConfig>,
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
    /// Automatically start this mapping when the app launches.
    #[serde(default)]
    pub auto_start: bool,
    pub remark: Option<String>,
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
    #[serde(default)]
    pub auto_start: bool,
    pub remark: Option<String>,
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
    /// Public URL returned by the tunnel provider (e.g. Pinggy, Serveo).
    pub public_url: Option<String>,
    /// SSH command used to start the tunnel (e.g. ssh -R 80:localhost:3000 serveo.net).
    pub ssh_command: Option<String>,
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
    /// SSH command to execute for the tunnel.
    pub ssh_command: Option<String>,
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
            remark: None,
            os_type: None,
            status: SshServerStatus::Disconnected,
            connect_timeout_ms: 10000,
            heartbeat_ms: 30000,
            default_path: None,
            init_script: None,
            jump_host: None,
            proxy: None,
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
            auto_start: false,
            remark: None,
            status: PortMappingStatus::Stopped,
            created_at: Utc::now(),
        };

        let json = serde_json::to_string(&mapping).unwrap();
        let deserialized: PortMapping = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "pg-tunnel");
        assert_eq!(deserialized.local_port, 15432);
    }
}
