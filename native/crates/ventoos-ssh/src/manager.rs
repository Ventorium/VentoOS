use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use tokio::sync::RwLock;
use ventoos_core::types::{Id, new_id};
use ventoos_persist::Database;
use ventoos_vfs::sftp::{SshAuth, SshConnInfo, SshInfoProvider};

use crate::types::{
    CreatePortMappingRequest, CreateServiceExposureRequest, CreateSshServerRequest, PortMapping,
    PortMappingStatus, ServiceExposure, ServiceExposureStatus, SshAuthMethod, SshServer,
    SshServerStatus, UpdateSshServerRequest,
};

/// Stored credential for an SSH server.
#[derive(Debug, Clone)]
enum StoredCredential {
    Password(String),
    PrivateKey {
        key_pem: String,
        passphrase: Option<String>,
    },
}

/// SSH server manager — CRUD + port mapping + service exposure management.
pub struct SshManager {
    servers: Arc<RwLock<HashMap<Id, SshServer>>>,
    /// Credentials indexed by server ID.
    credentials: Arc<RwLock<HashMap<Id, StoredCredential>>>,
    port_mappings: Arc<RwLock<HashMap<Id, PortMapping>>>,
    service_exposures: Arc<RwLock<HashMap<Id, ServiceExposure>>>,
    /// Active port forward task handles; cancelling aborts the listener.
    port_forward_handles: Arc<RwLock<HashMap<Id, tokio::task::AbortHandle>>>,
    /// Active service exposure process handles.
    exposure_handles: Arc<RwLock<HashMap<Id, tokio::task::AbortHandle>>>,
    /// Optional `SQLite` database for persistence.
    db: Option<Arc<Database>>,
}

/// Database load result: (servers, credentials, `port_mappings`, `service_exposures`).
type DbLoadResult = Result<(Vec<(String, String)>, Vec<(String, String, String)>, Vec<(String, String)>, Vec<(String, String)>), rusqlite::Error>;

impl SshManager {
    /// Create an in-memory manager without persistence (for tests).
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            credentials: Arc::new(RwLock::new(HashMap::new())),
            port_mappings: Arc::new(RwLock::new(HashMap::new())),
            service_exposures: Arc::new(RwLock::new(HashMap::new())),
            port_forward_handles: Arc::new(RwLock::new(HashMap::new())),
            exposure_handles: Arc::new(RwLock::new(HashMap::new())),
            db: None,
        }
    }

    /// Create a manager backed by `SQLite`; loads existing data on construction.
    pub async fn new_with_db(db: Arc<Database>) -> Self {
        let mgr = Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            credentials: Arc::new(RwLock::new(HashMap::new())),
            port_mappings: Arc::new(RwLock::new(HashMap::new())),
            service_exposures: Arc::new(RwLock::new(HashMap::new())),
            port_forward_handles: Arc::new(RwLock::new(HashMap::new())),
            exposure_handles: Arc::new(RwLock::new(HashMap::new())),
            db: Some(Arc::clone(&db)),
        };
        mgr.load_from_db(&db).await;
        mgr
    }

    /// Load all persisted data from the database into memory.
    async fn load_from_db(&self, db: &Arc<Database>) {
        let db = Arc::clone(db);
        let result = tokio::task::spawn_blocking(move || -> DbLoadResult {
            db.with_conn(|conn| {
                // Load servers
                let servers = conn
                    .prepare("SELECT id, data FROM ssh_servers")?
                    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
                    .collect::<Result<Vec<_>, _>>()?;
                // Load credentials
                let creds = conn
                    .prepare("SELECT server_id, credential_type, credential_value FROM ssh_credentials")?
                    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)))?
                    .collect::<Result<Vec<_>, _>>()?;
                // Load port mappings
                let mappings = conn
                    .prepare("SELECT id, data FROM port_mappings")?
                    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
                    .collect::<Result<Vec<_>, _>>()?;
                // Load service exposures
                let exposures = conn
                    .prepare("SELECT id, data FROM service_exposures")?
                    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok((servers, creds, mappings, exposures))
            })
        }).await;

        match result {
            Ok(Ok((servers, creds, mappings, exposures))) => {
                let mut servers_map = self.servers.write().await;
                for (id_str, data) in servers {
                    if let (Ok(id), Ok(server)) = (
                        id_str.parse::<Id>(),
                        serde_json::from_str::<SshServer>(&data),
                    ) {
                        servers_map.insert(id, server);
                    }
                }
                drop(servers_map);

                let mut creds_map = self.credentials.write().await;
                for (server_id_str, cred_type, cred_value) in creds {
                    if let Ok(server_id) = server_id_str.parse::<Id>() {
                        let cred = match cred_type.as_str() {
                            "password" => Some(StoredCredential::Password(cred_value)),
                            "private_key" => {
                                if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&cred_value) {
                                    Some(StoredCredential::PrivateKey {
                                        key_pem: obj["key_pem"].as_str().unwrap_or("").to_string(),
                                        passphrase: obj["passphrase"].as_str().map(std::string::ToString::to_string),
                                    })
                                } else {
                                    None
                                }
                            }
                            _ => None,
                        };
                        if let Some(c) = cred {
                            creds_map.insert(server_id, c);
                        }
                    }
                }
                drop(creds_map);

                let mut mappings_map = self.port_mappings.write().await;
                for (id_str, data) in mappings {
                    if let (Ok(id), Ok(mut mapping)) = (
                        id_str.parse::<Id>(),
                        serde_json::from_str::<PortMapping>(&data),
                    ) {
                        // Reset runtime status to Stopped on load
                        mapping.status = PortMappingStatus::Stopped;
                        mappings_map.insert(id, mapping);
                    }
                }
                drop(mappings_map);

                let mut exposures_map = self.service_exposures.write().await;
                for (id_str, data) in exposures {
                    if let (Ok(id), Ok(mut exposure)) = (
                        id_str.parse::<Id>(),
                        serde_json::from_str::<ServiceExposure>(&data),
                    ) {
                        // Reset runtime status on load
                        exposure.status = ServiceExposureStatus::Stopped;
                        exposure.public_url = None;
                        exposures_map.insert(id, exposure);
                    }
                }

                tracing::info!("Loaded SSH data from database");
            }
            Ok(Err(e)) => tracing::error!("Failed to load SSH data from database: {e}"),
            Err(e) => tracing::error!("Failed to spawn database load task: {e}"),
        }
    }

    /// Persist a server to the database.
    fn persist_server(&self, server: &SshServer) {
        if let Some(db) = &self.db {
            let db = Arc::clone(db);
            let id_str = server.id.to_string();
            let data = serde_json::to_string(server).unwrap_or_default();
            let created_at = server.created_at.to_rfc3339();
            tokio::task::spawn_blocking(move || {
                let _ = db.with_conn(|conn| {
                    conn.execute(
                        "INSERT OR REPLACE INTO ssh_servers (id, data, created_at) VALUES (?1, ?2, ?3)",
                        rusqlite::params![id_str, data, created_at],
                    )
                });
            });
        }
    }

    /// Delete a server from the database.
    fn delete_server_db(&self, id: Id) {
        if let Some(db) = &self.db {
            let db = Arc::clone(db);
            let id_str = id.to_string();
            tokio::task::spawn_blocking(move || {
                let _ = db.with_conn(|conn| {
                    conn.execute("DELETE FROM ssh_servers WHERE id = ?1", [&id_str])?;
                    conn.execute("DELETE FROM ssh_credentials WHERE server_id = ?1", [&id_str])
                });
            });
        }
    }

    /// Persist credentials to the database.
    fn persist_credential(&self, server_id: Id, credential: &StoredCredential) {
        if let Some(db) = &self.db {
            let db = Arc::clone(db);
            let server_id_str = server_id.to_string();
            let (cred_type, cred_value) = match credential {
                StoredCredential::Password(pw) => ("password".to_string(), pw.clone()),
                StoredCredential::PrivateKey { key_pem, passphrase } => {
                    let val = serde_json::json!({
                        "key_pem": key_pem,
                        "passphrase": passphrase
                    });
                    ("private_key".to_string(), val.to_string())
                }
            };
            tokio::task::spawn_blocking(move || {
                let _ = db.with_conn(|conn| {
                    conn.execute(
                        "INSERT OR REPLACE INTO ssh_credentials (server_id, credential_type, credential_value) VALUES (?1, ?2, ?3)",
                        rusqlite::params![server_id_str, cred_type, cred_value],
                    )
                });
            });
        }
    }

    /// Persist a port mapping to the database.
    fn persist_port_mapping(&self, mapping: &PortMapping) {
        if let Some(db) = &self.db {
            let db = Arc::clone(db);
            let id_str = mapping.id.to_string();
            let data = serde_json::to_string(mapping).unwrap_or_default();
            let created_at = mapping.created_at.to_rfc3339();
            tokio::task::spawn_blocking(move || {
                let _ = db.with_conn(|conn| {
                    conn.execute(
                        "INSERT OR REPLACE INTO port_mappings (id, data, created_at) VALUES (?1, ?2, ?3)",
                        rusqlite::params![id_str, data, created_at],
                    )
                });
            });
        }
    }

    /// Delete a port mapping from the database.
    fn delete_port_mapping_db(&self, id: Id) {
        if let Some(db) = &self.db {
            let db = Arc::clone(db);
            let id_str = id.to_string();
            tokio::task::spawn_blocking(move || {
                let _ = db.with_conn(|conn| {
                    conn.execute("DELETE FROM port_mappings WHERE id = ?1", [&id_str])
                });
            });
        }
    }

    /// Persist a service exposure to the database.
    fn persist_service_exposure(&self, exposure: &ServiceExposure) {
        if let Some(db) = &self.db {
            let db = Arc::clone(db);
            let id_str = exposure.id.to_string();
            let data = serde_json::to_string(exposure).unwrap_or_default();
            let created_at = exposure.created_at.to_rfc3339();
            tokio::task::spawn_blocking(move || {
                let _ = db.with_conn(|conn| {
                    conn.execute(
                        "INSERT OR REPLACE INTO service_exposures (id, data, created_at) VALUES (?1, ?2, ?3)",
                        rusqlite::params![id_str, data, created_at],
                    )
                });
            });
        }
    }

    /// Delete a service exposure from the database.
    fn delete_service_exposure_db(&self, id: Id) {
        if let Some(db) = &self.db {
            let db = Arc::clone(db);
            let id_str = id.to_string();
            tokio::task::spawn_blocking(move || {
                let _ = db.with_conn(|conn| {
                    conn.execute("DELETE FROM service_exposures WHERE id = ?1", [&id_str])
                });
            });
        }
    }

    // --- SSH Servers ---

    pub async fn create_server(&self, req: CreateSshServerRequest) -> SshServer {
        let now = Utc::now();
        let id = new_id();
        let server = SshServer {
            id,
            name: req.name,
            host: req.host,
            port: req.port.unwrap_or(22),
            username: req.username,
            auth_method: req.auth_method,
            group: req.group,
            tags: req.tags.unwrap_or_default(),
            remark: req.remark,
            os_type: None,
            status: SshServerStatus::Disconnected,
            connect_timeout_ms: req.connect_timeout_ms.unwrap_or(10000),
            heartbeat_ms: req.heartbeat_ms.unwrap_or(30000),
            default_path: req.default_path,
            init_script: req.init_script,
            jump_host: req.jump_host,
            proxy: req.proxy,
            created_at: now,
            updated_at: now,
            last_connected_at: None,
        };

        // Store credential if provided
        if let Some(pw) = req.password {
            let cred = StoredCredential::Password(pw);
            self.persist_credential(id, &cred);
            self.credentials.write().await.insert(id, cred);
        } else if let Some(key) = req.private_key {
            let cred = StoredCredential::PrivateKey { key_pem: key, passphrase: None };
            self.persist_credential(id, &cred);
            self.credentials.write().await.insert(id, cred);
        }

        self.persist_server(&server);
        self.servers.write().await.insert(id, server.clone());
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
            if req.remark.is_some() {
                server.remark = req.remark;
            }
            if let Some(timeout) = req.connect_timeout_ms {
                server.connect_timeout_ms = timeout;
            }
            if let Some(heartbeat) = req.heartbeat_ms {
                server.heartbeat_ms = heartbeat;
            }
            if req.default_path.is_some() {
                server.default_path = req.default_path;
            }
            if req.init_script.is_some() {
                server.init_script = req.init_script;
            }
            if req.jump_host.is_some() {
                server.jump_host = req.jump_host;
            }
            if req.proxy.is_some() {
                server.proxy = req.proxy;
            }
            server.updated_at = Utc::now();

            // Update credentials if provided
            if let Some(pw) = req.password {
                let cred = StoredCredential::Password(pw);
                self.persist_credential(id, &cred);
                self.credentials.write().await.insert(id, cred);
            } else if let Some(key) = req.private_key {
                let cred = StoredCredential::PrivateKey { key_pem: key, passphrase: None };
                self.persist_credential(id, &cred);
                self.credentials.write().await.insert(id, cred);
            }

            let updated = server.clone();
            self.persist_server(&updated);
            Some(updated)
        } else {
            None
        }
    }

    pub async fn delete_server(&self, id: Id) -> bool {
        self.credentials.write().await.remove(&id);
        let removed = self.servers.write().await.remove(&id).is_some();
        if removed { self.delete_server_db(id); }
        removed
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

    /// Update server connection status (called when terminal connects/disconnects).
    pub async fn update_server_status(&self, id: Id, status: SshServerStatus) -> Option<SshServer> {
        let mut servers = self.servers.write().await;
        if let Some(server) = servers.get_mut(&id) {
            server.status = status;
            if server.status == SshServerStatus::Connected {
                server.last_connected_at = Some(Utc::now());
            }
            let updated = server.clone();
            self.persist_server(&updated);
            Some(updated)
        } else {
            None
        }
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
            auto_start: req.auto_start,
            remark: req.remark,
            status: PortMappingStatus::Stopped,
            created_at: Utc::now(),
        };
        self.persist_port_mapping(&mapping);
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
        let removed = self.port_mappings.write().await.remove(&id).is_some();
        if removed { self.delete_port_mapping_db(id); }
        removed
    }

    pub async fn start_port_mapping(&self, id: Id) -> Option<PortMapping> {
        // Get mapping info
        let mapping = {
            let mappings = self.port_mappings.read().await;
            mappings.get(&id)?.clone()
        };

        // Resolve SSH credentials
        let conn_info = match self.resolve(&mapping.ssh_server_id.to_string()).await {
            Ok(info) => info,
            Err(e) => {
                tracing::error!("Port mapping {id}: failed to resolve SSH info: {e}");
                let mut mappings = self.port_mappings.write().await;
                if let Some(m) = mappings.get_mut(&id) {
                    m.status = PortMappingStatus::Error;
                }
                return None;
            }
        };

        let local_port = mapping.local_port;
        let remote_host = mapping.remote_host.clone();
        let remote_port = mapping.remote_port;

        // Bind local port
        let listener = match tokio::net::TcpListener::bind(
            std::net::SocketAddr::from(([127, 0, 0, 1], local_port)),
        )
        .await
        {
            Ok(l) => l,
            Err(e) => {
                tracing::error!("Port mapping {id}: cannot bind 127.0.0.1:{local_port}: {e}");
                let mut mappings = self.port_mappings.write().await;
                if let Some(m) = mappings.get_mut(&id) {
                    m.status = PortMappingStatus::Error;
                }
                return None;
            }
        };

        tracing::info!(
            "Port mapping {id}: listening on 127.0.0.1:{local_port} -> {remote_host}:{remote_port}"
        );

        // Spawn background accept loop
        let mappings_ref_for_task = Arc::clone(&self.port_mappings);
        let task = tokio::spawn(async move {
            loop {
                let Ok((stream, _peer)) = listener.accept().await else {
                    break;
                };

                let conn_info = conn_info.clone();
                let remote_host = remote_host.clone();
                let mappings_err_ref = Arc::clone(&mappings_ref_for_task);

                tokio::spawn(async move {
                    if let Err(e) = forward_tcp_via_ssh(
                        stream,
                        conn_info,
                        remote_host,
                        remote_port,
                        local_port,
                    )
                    .await
                    {
                        let err_str = e.to_string();
                        tracing::warn!("Port forward connection error: {err_str}");
                        // Permanent errors: mark mapping as error so user sees feedback
                        if err_str.contains("AdministrativelyProhibited")
                            || err_str.contains("RequestDenied")
                            || err_str.contains("authentication failed")
                        {
                            let mut mappings = mappings_err_ref.write().await;
                            if let Some(m) = mappings.get_mut(&id) {
                                m.status = PortMappingStatus::Error;
                            }
                        }
                    }
                });
            }
        });

        // Store abort handle
        self.port_forward_handles
            .write()
            .await
            .insert(id, task.abort_handle());

        // Update status
        let mut mappings = self.port_mappings.write().await;
        if let Some(m) = mappings.get_mut(&id) {
            m.status = PortMappingStatus::Active;
            return Some(m.clone());
        }
        None
    }

    pub async fn stop_port_mapping(&self, id: Id) -> Option<PortMapping> {
        // Cancel the forward task
        if let Some(handle) = self.port_forward_handles.write().await.remove(&id) {
            handle.abort();
        }
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
            basic_auth_credential_id: None,
            status: ServiceExposureStatus::Stopped,
            public_url: None,
            ssh_command: req.ssh_command,
            created_at: Utc::now(),
        };
        self.persist_service_exposure(&exposure);
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
        let removed = self.service_exposures.write().await.remove(&id).is_some();
        if removed { self.delete_service_exposure_db(id); }
        removed
    }

    pub async fn start_service_exposure(&self, id: Id) -> Option<ServiceExposure> {
        let ssh_command = {
            let exposures = self.service_exposures.read().await;
            exposures.get(&id)?.ssh_command.clone()
        };

        if let Some(cmd) = ssh_command {
            let exposures_ref = Arc::clone(&self.service_exposures);

            let task = tokio::spawn(async move {
                let mut child = match tokio::process::Command::new("sh")
                    .args(["-c", &cmd])
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                {
                    Ok(c) => c,
                    Err(e) => {
                        tracing::error!("Failed to spawn exposure command: {e}");
                        let mut exp = exposures_ref.write().await;
                        if let Some(e) = exp.get_mut(&id) {
                            e.status = ServiceExposureStatus::Error;
                        }
                        return;
                    }
                };

                // Monitor both stdout and stderr for URLs
                let url_re = regex::Regex::new(r"https?://[\w./:?=&#%+-]+").unwrap();

                let stderr = child.stderr.take().map(tokio::io::BufReader::new);
                let stdout = child.stdout.take().map(tokio::io::BufReader::new);

                if let (Some(out), Some(err)) = (stdout, stderr) {
                    tokio::join!(
                        scan_for_urls(out, id, Arc::clone(&exposures_ref), url_re.clone()),
                        scan_for_urls(err, id, Arc::clone(&exposures_ref), url_re)
                    );
                }

                let _ = child.wait().await;

                // Mark stopped when process exits
                let mut exp = exposures_ref.write().await;
                if let Some(e) = exp.get_mut(&id)
                    && e.status != ServiceExposureStatus::Error {
                        e.status = ServiceExposureStatus::Stopped;
                    }
            });

            self.exposure_handles
                .write()
                .await
                .insert(id, task.abort_handle());
        }

        let mut exposures = self.service_exposures.write().await;
        if let Some(exposure) = exposures.get_mut(&id) {
            exposure.status = ServiceExposureStatus::Active;
            Some(exposure.clone())
        } else {
            None
        }
    }

    pub async fn stop_service_exposure(&self, id: Id) -> Option<ServiceExposure> {
        // Kill the SSH process
        if let Some(handle) = self.exposure_handles.write().await.remove(&id) {
            handle.abort();
        }
        let mut exposures = self.service_exposures.write().await;
        if let Some(exposure) = exposures.get_mut(&id) {
            exposure.status = ServiceExposureStatus::Stopped;
            exposure.public_url = None;
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

impl SshInfoProvider for SshManager {
    fn resolve(
        &self,
        connection_id: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<SshConnInfo, String>> + Send + '_>>
    {
        let connection_id = connection_id.to_string();
        Box::pin(async move {
            let id: Id = connection_id
                .parse()
                .map_err(|_| format!("Invalid SSH server ID: {connection_id}"))?;

            let servers = self.servers.read().await;
            let server = servers
                .get(&id)
                .ok_or_else(|| format!("SSH server {connection_id} not found"))?;

            let credentials = self.credentials.read().await;
            let auth = match credentials.get(&id) {
                Some(StoredCredential::Password(pw)) => SshAuth::Password(pw.clone()),
                Some(StoredCredential::PrivateKey {
                    key_pem,
                    passphrase,
                }) => SshAuth::PrivateKey {
                    key_pem: key_pem.clone(),
                    passphrase: passphrase.clone(),
                },
                None => {
                    // Try to infer from auth method — key_path might be a local file
                    match &server.auth_method {
                        SshAuthMethod::PrivateKey {
                            key_path: Some(path),
                            ..
                        } => {
                            let key_pem = tokio::fs::read_to_string(path)
                                .await
                                .map_err(|e| format!("无法读取密钥文件 {path}: {e}"))?;
                            SshAuth::PrivateKey {
                                key_pem,
                                passphrase: None,
                            }
                        }
                        SshAuthMethod::Agent => {
                            // Try default key files like SSH client does
                            let home =
                                std::env::var("HOME").unwrap_or_else(|_| "/root".into());
                            let ssh_dir = std::path::Path::new(&home).join(".ssh");
                            let default_keys = ["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa"];
                            let mut found: Option<std::path::PathBuf> = None;
                            for name in &default_keys {
                                let p = ssh_dir.join(name);
                                if p.exists() {
                                    found = Some(p);
                                    break;
                                }
                            }
                            match found {
                                Some(path) => {
                                    let key_pem = tokio::fs::read_to_string(&path)
                                        .await
                                        .map_err(|e| {
                                            format!("无法读取默认密钥文件 {}: {e}", path.display())
                                        })?;
                                    SshAuth::PrivateKey {
                                        key_pem,
                                        passphrase: None,
                                    }
                                }
                                None => {
                                    return Err(
                                        "未找到默认 SSH 密钥文件（~/.ssh/id_ed25519 等），请为此服务器配置认证方式".into(),
                                    );
                                }
                            }
                        }
                        SshAuthMethod::Password { .. } => {
                            return Err(
                                "密码认证未配置，请在 SSH 管理中编辑此服务器并设置连接密码".into(),
                            );
                        }
                        SshAuthMethod::PrivateKey { .. } => {
                            return Err("未找到此 SSH 服务器的认证凭据，请检查服务器配置".into());
                        }
                    }
                }
            };

            Ok(SshConnInfo {
                host: server.host.clone(),
                port: server.port,
                username: server.username.clone(),
                auth,
            })
        })
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SshServerTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::*;
    use crate::types::{ServiceSourceType, SshAuthMethod};

    fn test_server_req(name: &str) -> CreateSshServerRequest {
        CreateSshServerRequest {
            name: name.to_string(),
            host: "10.0.0.1".to_string(),
            port: None,
            username: "root".to_string(),
            auth_method: SshAuthMethod::Password {
                credential_id: None,
            },
            group: None,
            tags: None,
            remark: None,
            connect_timeout_ms: None,
            heartbeat_ms: None,
            default_path: None,
            init_script: None,
            jump_host: None,
            proxy: None,
            password: None,
            private_key: None,
        }
    }

    #[tokio::test]
    async fn test_create_and_list_servers() {
        let mgr = SshManager::new();
        let mut req = test_server_req("dev-server");
        req.group = Some("dev".to_string());
        let server = mgr.create_server(req).await;

        assert_eq!(server.name, "dev-server");
        assert_eq!(server.port, 22);

        let servers = mgr.list_servers().await;
        assert_eq!(servers.len(), 1);
    }

    #[tokio::test]
    async fn test_update_server() {
        let mgr = SshManager::new();
        let mut req = test_server_req("old-name");
        req.port = Some(22);
        let server = mgr.create_server(req).await;

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
                    remark: None,
                    connect_timeout_ms: None,
                    heartbeat_ms: None,
                    default_path: None,
                    init_script: None,
                    jump_host: None,
                    proxy: None,
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
        let server = mgr.create_server(test_server_req("temp")).await;

        assert!(mgr.delete_server(server.id).await);
        assert!(mgr.get_server(server.id).await.is_none());
    }

    #[tokio::test]
    async fn test_port_mapping_lifecycle() {
        let mgr = SshManager::new();
        // Provide a password so resolve() can succeed without a real SSH agent
        let mut req = test_server_req("test");
        req.password = Some("test_pass".to_string());
        let server = mgr.create_server(req).await;

        let mapping = mgr
            .create_port_mapping(CreatePortMappingRequest {
                name: "pg-tunnel".to_string(),
                ssh_server_id: server.id,
                remote_host: "localhost".to_string(),
                remote_port: 5432,
                local_port: 15432,
                auto_start: false,
                remark: None,
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
                ssh_command: None,
            })
            .await;

        assert_eq!(exposure.status, ServiceExposureStatus::Stopped);
        assert!(exposure.basic_auth_enabled);

        let started = mgr.start_service_exposure(exposure.id).await.unwrap();
        assert_eq!(started.status, ServiceExposureStatus::Active);

        assert!(mgr.delete_service_exposure(exposure.id).await);
    }
}

// ── Service exposure URL scanner ─────────────────────────────────────────────

async fn scan_for_urls(
    mut reader: impl tokio::io::AsyncBufRead + Unpin,
    id: Id,
    exposures: Arc<RwLock<HashMap<Id, ServiceExposure>>>,
    re: regex::Regex,
) {
    use tokio::io::AsyncBufReadExt;
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                if let Some(m) = re.find(&line) {
                    let url = m.as_str().trim_end_matches('/').to_string();
                    tracing::info!("Tunnel URL detected: {url}");
                    let mut exp = exposures.write().await;
                    if let Some(e) = exp.get_mut(&id) {
                        e.public_url = Some(url);
                    }
                }
            }
        }
    }
}

// ── SSH port-forward helper ──────────────────────────────────────────────────

struct PortFwdHandler;

impl russh::client::Handler for PortFwdHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Open a direct-tcpip SSH channel and bridge it with the given TCP stream.
async fn forward_tcp_via_ssh(
    mut stream: tokio::net::TcpStream,
    conn_info: SshConnInfo,
    remote_host: String,
    remote_port: u16,
    local_port: u16,
) -> anyhow::Result<()> {

    let config = Arc::new(russh::client::Config::default());
    let handler = PortFwdHandler;
    let mut session =
        russh::client::connect(config, (conn_info.host.as_str(), conn_info.port), handler).await?;

    // Authenticate
    let auth_ok = match &conn_info.auth {
        SshAuth::Password(pw) => session
            .authenticate_password(&conn_info.username, pw)
            .await
            .map(|r| r.success())
            .unwrap_or(false),
        SshAuth::PrivateKey { key_pem, passphrase } => {
            let key = russh::keys::decode_secret_key(key_pem, passphrase.as_deref())?;
            let key_with_alg =
                russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key), None);
            session
                .authenticate_publickey(&conn_info.username, key_with_alg)
                .await
                .map(|r| r.success())
                .unwrap_or(false)
        }
    };

    if !auth_ok {
        anyhow::bail!("SSH authentication failed");
    }

    // Open direct-tcpip channel
    let channel = session
        .channel_open_direct_tcpip(&remote_host, u32::from(remote_port), "127.0.0.1", u32::from(local_port))
        .await?;

    // Bidirectional bridge: TCP stream <-> SSH channel stream
    let mut channel_stream = channel.into_stream();
    tokio::io::copy_bidirectional(&mut stream, &mut channel_stream).await?;

    Ok(())
}
