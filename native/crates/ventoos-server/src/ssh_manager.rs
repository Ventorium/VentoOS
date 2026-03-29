use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use tokio::sync::RwLock;
use ventoos_core::ssh::{
    CreatePortMappingRequest, CreateServiceExposureRequest, CreateSshServerRequest,
    PortMapping, PortMappingStatus, ServiceExposure, ServiceExposureStatus, ServiceSourceType,
    SshServer, SshServerStatus, UpdateSshServerRequest,
};
use ventoos_core::types::{new_id, Id};

/// SSH server manager — CRUD + port mapping + service exposure management.
pub struct SshManager {
    servers: Arc<RwLock<HashMap<Id, SshServer>>>,
    port_mappings: Arc<RwLock<HashMap<Id, PortMapping>>>,
    service_exposures: Arc<RwLock<HashMap<Id, ServiceExposure>>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            port_mappings: Arc::new(RwLock::new(HashMap::new())),
            service_exposures: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    // --- SSH Servers ---

    pub async fn create_server(&self, req: CreateSshServerRequest) -> SshServer {
        let now = Utc::now();
        let server = SshServer {
            id: new_id(),
            name: req.name,
            host: req.host,
            port: req.port.unwrap_or(22),
            username: req.username,
            auth_method: req.auth_method,
            group: req.group,
            tags: req.tags.unwrap_or_default(),
            status: SshServerStatus::Disconnected,
            created_at: now,
            updated_at: now,
            last_connected_at: None,
        };
        let mut servers = self.servers.write().await;
        servers.insert(server.id, server.clone());
        server
    }

    pub async fn get_server(&self, id: Id) -> Option<SshServer> {
        let servers = self.servers.read().await;
        servers.get(&id).cloned()
    }

    pub async fn list_servers(&self) -> Vec<SshServer> {
        let servers = self.servers.read().await;
        let mut list: Vec<SshServer> = servers.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn update_server(&self, id: Id, req: UpdateSshServerRequest) -> Option<SshServer> {
        let mut servers = self.servers.write().await;
        if let Some(server) = servers.get_mut(&id) {
            if let Some(name) = req.name {
                server.name = name;
            }
            if let Some(host) = req.host {
                server.host = host;
            }
            if let Some(port) = req.port {
                server.port = port;
            }
            if let Some(username) = req.username {
                server.username = username;
            }
            if let Some(auth_method) = req.auth_method {
                server.auth_method = auth_method;
            }
            if let Some(group) = req.group {
                server.group = Some(group);
            }
            if let Some(tags) = req.tags {
                server.tags = tags;
            }
            server.updated_at = Utc::now();
            Some(server.clone())
        } else {
            None
        }
    }

    pub async fn delete_server(&self, id: Id) -> bool {
        let mut servers = self.servers.write().await;
        servers.remove(&id).is_some()
    }

    pub async fn test_server(&self, id: Id) -> Option<SshServerTestResult> {
        let servers = self.servers.read().await;
        let _server = servers.get(&id)?;
        // TODO: Actual SSH connection test via russh
        Some(SshServerTestResult {
            success: true,
            message: "Connection test passed (stub)".to_string(),
            latency_ms: Some(35),
        })
    }

    // --- Port Mappings ---

    pub async fn create_port_mapping(&self, req: CreatePortMappingRequest) -> PortMapping {
        let mapping = PortMapping {
            id: new_id(),
            name: req.name,
            ssh_server_id: req.ssh_server_id,
            remote_host: req.remote_host,
            remote_port: req.remote_port,
            local_port: req.local_port,
            status: PortMappingStatus::Stopped,
            created_at: Utc::now(),
        };
        let mut mappings = self.port_mappings.write().await;
        mappings.insert(mapping.id, mapping.clone());
        mapping
    }

    pub async fn list_port_mappings(&self) -> Vec<PortMapping> {
        let mappings = self.port_mappings.read().await;
        let mut list: Vec<PortMapping> = mappings.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn get_port_mapping(&self, id: Id) -> Option<PortMapping> {
        let mappings = self.port_mappings.read().await;
        mappings.get(&id).cloned()
    }

    pub async fn delete_port_mapping(&self, id: Id) -> bool {
        let mut mappings = self.port_mappings.write().await;
        mappings.remove(&id).is_some()
    }

    pub async fn start_port_mapping(&self, id: Id) -> Option<PortMapping> {
        let mut mappings = self.port_mappings.write().await;
        if let Some(mapping) = mappings.get_mut(&id) {
            mapping.status = PortMappingStatus::Active;
            // TODO: Actually start SSH tunnel using russh
            Some(mapping.clone())
        } else {
            None
        }
    }

    pub async fn stop_port_mapping(&self, id: Id) -> Option<PortMapping> {
        let mut mappings = self.port_mappings.write().await;
        if let Some(mapping) = mappings.get_mut(&id) {
            mapping.status = PortMappingStatus::Stopped;
            Some(mapping.clone())
        } else {
            None
        }
    }

    // --- Service Exposures ---

    pub async fn create_service_exposure(
        &self,
        req: CreateServiceExposureRequest,
    ) -> ServiceExposure {
        let exposure = ServiceExposure {
            id: new_id(),
            name: req.name,
            source_type: req.source_type,
            ssh_server_id: req.ssh_server_id,
            source_host: req.source_host,
            source_port: req.source_port,
            public_port: req.public_port,
            basic_auth_enabled: req.basic_auth_enabled,
            basic_auth_username: req.basic_auth_username,
            basic_auth_credential_id: None, // TODO: store credential securely
            status: ServiceExposureStatus::Stopped,
            created_at: Utc::now(),
        };
        let mut exposures = self.service_exposures.write().await;
        exposures.insert(exposure.id, exposure.clone());
        exposure
    }

    pub async fn list_service_exposures(&self) -> Vec<ServiceExposure> {
        let exposures = self.service_exposures.read().await;
        let mut list: Vec<ServiceExposure> = exposures.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn get_service_exposure(&self, id: Id) -> Option<ServiceExposure> {
        let exposures = self.service_exposures.read().await;
        exposures.get(&id).cloned()
    }

    pub async fn delete_service_exposure(&self, id: Id) -> bool {
        let mut exposures = self.service_exposures.write().await;
        exposures.remove(&id).is_some()
    }

    pub async fn start_service_exposure(&self, id: Id) -> Option<ServiceExposure> {
        let mut exposures = self.service_exposures.write().await;
        if let Some(exposure) = exposures.get_mut(&id) {
            exposure.status = ServiceExposureStatus::Active;
            // TODO: Actually start reverse proxy
            Some(exposure.clone())
        } else {
            None
        }
    }

    pub async fn stop_service_exposure(&self, id: Id) -> Option<ServiceExposure> {
        let mut exposures = self.service_exposures.write().await;
        if let Some(exposure) = exposures.get_mut(&id) {
            exposure.status = ServiceExposureStatus::Stopped;
            Some(exposure.clone())
        } else {
            None
        }
    }
}

impl Default for SshManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SshServerTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ventoos_core::ssh::SshAuthMethod;

    #[tokio::test]
    async fn test_create_and_list_servers() {
        let mgr = SshManager::new();
        let server = mgr
            .create_server(CreateSshServerRequest {
                name: "dev-server".to_string(),
                host: "10.0.0.1".to_string(),
                port: None,
                username: "root".to_string(),
                auth_method: SshAuthMethod::Agent,
                group: Some("dev".to_string()),
                tags: None,
                password: None,
                private_key: None,
            })
            .await;

        assert_eq!(server.name, "dev-server");
        assert_eq!(server.port, 22);

        let servers = mgr.list_servers().await;
        assert_eq!(servers.len(), 1);
    }

    #[tokio::test]
    async fn test_update_server() {
        let mgr = SshManager::new();
        let server = mgr
            .create_server(CreateSshServerRequest {
                name: "old-name".to_string(),
                host: "10.0.0.1".to_string(),
                port: Some(22),
                username: "root".to_string(),
                auth_method: SshAuthMethod::Agent,
                group: None,
                tags: None,
                password: None,
                private_key: None,
            })
            .await;

        let updated = mgr
            .update_server(
                server.id,
                UpdateSshServerRequest {
                    name: Some("new-name".to_string()),
                    host: None,
                    port: Some(2222),
                    username: None,
                    auth_method: None,
                    group: None,
                    tags: None,
                    password: None,
                    private_key: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.name, "new-name");
        assert_eq!(updated.port, 2222);
    }

    #[tokio::test]
    async fn test_delete_server() {
        let mgr = SshManager::new();
        let server = mgr
            .create_server(CreateSshServerRequest {
                name: "temp".to_string(),
                host: "10.0.0.1".to_string(),
                port: None,
                username: "root".to_string(),
                auth_method: SshAuthMethod::Agent,
                group: None,
                tags: None,
                password: None,
                private_key: None,
            })
            .await;

        assert!(mgr.delete_server(server.id).await);
        assert!(mgr.get_server(server.id).await.is_none());
    }

    #[tokio::test]
    async fn test_port_mapping_lifecycle() {
        let mgr = SshManager::new();
        let server = mgr
            .create_server(CreateSshServerRequest {
                name: "test".to_string(),
                host: "10.0.0.1".to_string(),
                port: None,
                username: "root".to_string(),
                auth_method: SshAuthMethod::Agent,
                group: None,
                tags: None,
                password: None,
                private_key: None,
            })
            .await;

        let mapping = mgr
            .create_port_mapping(CreatePortMappingRequest {
                name: "pg-tunnel".to_string(),
                ssh_server_id: server.id,
                remote_host: "localhost".to_string(),
                remote_port: 5432,
                local_port: 15432,
            })
            .await;

        assert_eq!(mapping.status, PortMappingStatus::Stopped);

        let started = mgr.start_port_mapping(mapping.id).await.unwrap();
        assert_eq!(started.status, PortMappingStatus::Active);

        let stopped = mgr.stop_port_mapping(mapping.id).await.unwrap();
        assert_eq!(stopped.status, PortMappingStatus::Stopped);

        assert!(mgr.delete_port_mapping(mapping.id).await);
    }

    #[tokio::test]
    async fn test_service_exposure_lifecycle() {
        let mgr = SshManager::new();

        let exposure = mgr
            .create_service_exposure(CreateServiceExposureRequest {
                name: "api-expose".to_string(),
                source_type: ServiceSourceType::Local,
                ssh_server_id: None,
                source_host: "localhost".to_string(),
                source_port: 3000,
                public_port: 8888,
                basic_auth_enabled: true,
                basic_auth_username: Some("admin".to_string()),
                basic_auth_password: Some("secret".to_string()),
            })
            .await;

        assert_eq!(exposure.status, ServiceExposureStatus::Stopped);
        assert!(exposure.basic_auth_enabled);

        let started = mgr.start_service_exposure(exposure.id).await.unwrap();
        assert_eq!(started.status, ServiceExposureStatus::Active);

        assert!(mgr.delete_service_exposure(exposure.id).await);
    }
}
