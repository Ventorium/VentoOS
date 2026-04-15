use std::io::{BufRead, BufReader, Read};
use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use rustls::pki_types::{CertificateDer, PrivateKeyDer, ServerName};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

// ---------------------------------------------------------------------------
// Kubeconfig model
// ---------------------------------------------------------------------------

/// Parsed cluster entry from kubeconfig.
#[derive(Debug, Clone)]
pub struct KubeconfigCluster {
    pub name: String,
    pub server: String,
    /// Base64-encoded CA certificate data.
    pub ca_data: Option<String>,
    /// Path to CA certificate file.
    pub ca_file: Option<String>,
}

/// Parsed user entry from kubeconfig.
#[derive(Debug, Clone)]
pub struct KubeconfigUser {
    pub name: String,
    pub token: Option<String>,
    /// Base64-encoded client certificate.
    pub client_cert_data: Option<String>,
    /// Base64-encoded client key.
    pub client_key_data: Option<String>,
    /// Path to client certificate file.
    pub client_cert_file: Option<String>,
    /// Path to client key file.
    pub client_key_file: Option<String>,
}

/// Parsed context entry from kubeconfig.
#[derive(Debug, Clone)]
pub struct KubeconfigContextEntry {
    pub name: String,
    pub cluster: String,
    pub user: String,
    pub namespace: Option<String>,
}

/// Full parsed kubeconfig.
#[derive(Debug, Clone)]
pub struct Kubeconfig {
    pub clusters: Vec<KubeconfigCluster>,
    pub users: Vec<KubeconfigUser>,
    pub contexts: Vec<KubeconfigContextEntry>,
    pub current_context: Option<String>,
}

// ---------------------------------------------------------------------------
// Minimal YAML parser for kubeconfig
// ---------------------------------------------------------------------------

impl Kubeconfig {
    /// Parse a kubeconfig YAML string. Handles the specific structure used by
    /// Kubernetes without pulling in a full YAML library.
    #[allow(clippy::too_many_lines, clippy::items_after_statements)]
    pub fn parse(yaml_str: &str) -> Result<Self, String> {
        let mut clusters = Vec::new();
        let mut users = Vec::new();
        let mut contexts = Vec::new();
        let mut current_context: Option<String> = None;

        // Track which top-level section we're in and current entry fields.
        #[derive(PartialEq)]
        enum Section {
            None,
            Clusters,
            Users,
            Contexts,
        }

        let mut section = Section::None;

        // Cluster fields
        let mut c_name = String::new();
        let mut c_server = String::new();
        let mut c_ca_data: Option<String> = None;
        let mut c_ca_file: Option<String> = None;

        // User fields
        let mut u_name = String::new();
        let mut u_token: Option<String> = None;
        let mut u_client_cert_data: Option<String> = None;
        let mut u_client_key_data: Option<String> = None;
        let mut u_client_cert_file: Option<String> = None;
        let mut u_client_key_file: Option<String> = None;

        // Context fields
        let mut ctx_name = String::new();
        let mut ctx_cluster = String::new();
        let mut ctx_user = String::new();
        let mut ctx_ns: Option<String> = None;

        let flush_cluster = |clusters: &mut Vec<KubeconfigCluster>,
                             name: &mut String,
                             server: &mut String,
                             ca_data: &mut Option<String>,
                             ca_file: &mut Option<String>| {
            if !name.is_empty() && !server.is_empty() {
                clusters.push(KubeconfigCluster {
                    name: name.clone(),
                    server: server.clone(),
                    ca_data: ca_data.take(),
                    ca_file: ca_file.take(),
                });
            }
            name.clear();
            server.clear();
            *ca_data = None;
            *ca_file = None;
        };

        let flush_user = |users: &mut Vec<KubeconfigUser>,
                          name: &mut String,
                          token: &mut Option<String>,
                          cert_data: &mut Option<String>,
                          key_data: &mut Option<String>,
                          cert_file: &mut Option<String>,
                          key_file: &mut Option<String>| {
            if !name.is_empty() {
                users.push(KubeconfigUser {
                    name: name.clone(),
                    token: token.take(),
                    client_cert_data: cert_data.take(),
                    client_key_data: key_data.take(),
                    client_cert_file: cert_file.take(),
                    client_key_file: key_file.take(),
                });
            }
            name.clear();
            *token = None;
            *cert_data = None;
            *key_data = None;
            *cert_file = None;
            *key_file = None;
        };

        let flush_context = |contexts: &mut Vec<KubeconfigContextEntry>,
                             name: &mut String,
                             cluster: &mut String,
                             user: &mut String,
                             ns: &mut Option<String>| {
            if !name.is_empty() {
                contexts.push(KubeconfigContextEntry {
                    name: name.clone(),
                    cluster: cluster.clone(),
                    user: user.clone(),
                    namespace: ns.take(),
                });
            }
            name.clear();
            cluster.clear();
            user.clear();
            *ns = None;
        };

        for line in yaml_str.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            // Detect top-level keys (no indentation)
            if !line.starts_with(' ') && !line.starts_with('\t') && !line.starts_with('-') {
                // Flush previous section
                match section {
                    Section::Clusters => {
                        flush_cluster(
                            &mut clusters,
                            &mut c_name,
                            &mut c_server,
                            &mut c_ca_data,
                            &mut c_ca_file,
                        );
                    }
                    Section::Users => {
                        flush_user(
                            &mut users,
                            &mut u_name,
                            &mut u_token,
                            &mut u_client_cert_data,
                            &mut u_client_key_data,
                            &mut u_client_cert_file,
                            &mut u_client_key_file,
                        );
                    }
                    Section::Contexts => {
                        flush_context(
                            &mut contexts,
                            &mut ctx_name,
                            &mut ctx_cluster,
                            &mut ctx_user,
                            &mut ctx_ns,
                        );
                    }
                    Section::None => {}
                }

                if trimmed == "clusters:" {
                    section = Section::Clusters;
                } else if trimmed == "users:" {
                    section = Section::Users;
                } else if trimmed == "contexts:" {
                    section = Section::Contexts;
                } else if trimmed.starts_with("current-context:") {
                    section = Section::None;
                    current_context = Some(yaml_value(trimmed, "current-context:"));
                } else {
                    section = Section::None;
                }
                continue;
            }

            // Inside a section
            match section {
                Section::Clusters => {
                    if trimmed.starts_with("- cluster:") || trimmed.starts_with("- name:") {
                        // New entry — flush previous
                        flush_cluster(
                            &mut clusters,
                            &mut c_name,
                            &mut c_server,
                            &mut c_ca_data,
                            &mut c_ca_file,
                        );
                        if trimmed.starts_with("- name:") {
                            c_name = yaml_value(trimmed, "- name:");
                        }
                    } else if trimmed.starts_with("name:") {
                        c_name = yaml_value(trimmed, "name:");
                    } else if trimmed.starts_with("server:") {
                        c_server = yaml_value(trimmed, "server:");
                    } else if trimmed.starts_with("certificate-authority-data:") {
                        c_ca_data = Some(yaml_value(trimmed, "certificate-authority-data:"));
                    } else if trimmed.starts_with("certificate-authority:") {
                        c_ca_file = Some(yaml_value(trimmed, "certificate-authority:"));
                    }
                }
                Section::Users => {
                    if trimmed.starts_with("- name:") {
                        flush_user(
                            &mut users,
                            &mut u_name,
                            &mut u_token,
                            &mut u_client_cert_data,
                            &mut u_client_key_data,
                            &mut u_client_cert_file,
                            &mut u_client_key_file,
                        );
                        u_name = yaml_value(trimmed, "- name:");
                    } else if trimmed.starts_with("token:") {
                        u_token = Some(yaml_value(trimmed, "token:"));
                    } else if trimmed.starts_with("client-certificate-data:") {
                        u_client_cert_data = Some(yaml_value(trimmed, "client-certificate-data:"));
                    } else if trimmed.starts_with("client-key-data:") {
                        u_client_key_data = Some(yaml_value(trimmed, "client-key-data:"));
                    } else if trimmed.starts_with("client-certificate:") {
                        u_client_cert_file = Some(yaml_value(trimmed, "client-certificate:"));
                    } else if trimmed.starts_with("client-key:") {
                        u_client_key_file = Some(yaml_value(trimmed, "client-key:"));
                    }
                }
                Section::Contexts => {
                    if trimmed.starts_with("- name:") {
                        flush_context(
                            &mut contexts,
                            &mut ctx_name,
                            &mut ctx_cluster,
                            &mut ctx_user,
                            &mut ctx_ns,
                        );
                        ctx_name = yaml_value(trimmed, "- name:");
                    } else if trimmed.starts_with("- context:") {
                        // Alternate format: `- context:` then `name:` on next line
                        flush_context(
                            &mut contexts,
                            &mut ctx_name,
                            &mut ctx_cluster,
                            &mut ctx_user,
                            &mut ctx_ns,
                        );
                    } else if trimmed.starts_with("name:") {
                        // Could be context name (if using alternate format)
                        if ctx_name.is_empty() {
                            ctx_name = yaml_value(trimmed, "name:");
                        }
                    } else if trimmed.starts_with("cluster:") {
                        ctx_cluster = yaml_value(trimmed, "cluster:");
                    } else if trimmed.starts_with("user:") {
                        ctx_user = yaml_value(trimmed, "user:");
                    } else if trimmed.starts_with("namespace:") {
                        ctx_ns = Some(yaml_value(trimmed, "namespace:"));
                    }
                }
                Section::None => {}
            }
        }

        // Final flush
        match section {
            Section::Clusters => {
                flush_cluster(
                    &mut clusters,
                    &mut c_name,
                    &mut c_server,
                    &mut c_ca_data,
                    &mut c_ca_file,
                );
            }
            Section::Users => {
                flush_user(
                    &mut users,
                    &mut u_name,
                    &mut u_token,
                    &mut u_client_cert_data,
                    &mut u_client_key_data,
                    &mut u_client_cert_file,
                    &mut u_client_key_file,
                );
            }
            Section::Contexts => {
                flush_context(
                    &mut contexts,
                    &mut ctx_name,
                    &mut ctx_cluster,
                    &mut ctx_user,
                    &mut ctx_ns,
                );
            }
            Section::None => {}
        }

        Ok(Kubeconfig {
            clusters,
            users,
            contexts,
            current_context,
        })
    }

    /// Resolve a context name to its cluster and user entries.
    pub fn resolve_context(
        &self,
        context_name: &str,
    ) -> Result<(&KubeconfigCluster, &KubeconfigUser, Option<&str>), String> {
        let ctx = self
            .contexts
            .iter()
            .find(|c| c.name == context_name)
            .ok_or_else(|| format!("Context '{context_name}' not found in kubeconfig"))?;

        let cluster = self
            .clusters
            .iter()
            .find(|c| c.name == ctx.cluster)
            .ok_or_else(|| format!("Cluster '{}' not found in kubeconfig", ctx.cluster))?;

        let user = self
            .users
            .iter()
            .find(|u| u.name == ctx.user)
            .ok_or_else(|| format!("User '{}' not found in kubeconfig", ctx.user))?;

        Ok((cluster, user, ctx.namespace.as_deref()))
    }
}

/// Extract value after a YAML key prefix, trimming whitespace and optional quotes.
fn yaml_value(line: &str, prefix: &str) -> String {
    let raw = line.trim().strip_prefix(prefix).unwrap_or("").trim();
    // Strip surrounding quotes if present
    if (raw.starts_with('"') && raw.ends_with('"'))
        || (raw.starts_with('\'') && raw.ends_with('\''))
    {
        raw[1..raw.len() - 1].to_string()
    } else {
        raw.to_string()
    }
}

// ---------------------------------------------------------------------------
// K8s HTTPS Client
// ---------------------------------------------------------------------------

/// Minimal HTTPS client for talking to a Kubernetes API server.
pub struct K8sClient {
    server_url: String,
    host: String,
    port: u16,
    use_tls: bool,
    tls_config: Option<Arc<rustls::ClientConfig>>,
    auth_header: Option<String>,
}

impl K8sClient {
    /// Build a client from kubeconfig for a given context.
    pub async fn from_kubeconfig(
        kubeconfig: &Kubeconfig,
        context_name: &str,
    ) -> Result<Self, String> {
        let (cluster, user, _ns) = kubeconfig.resolve_context(context_name)?;

        let (use_tls, host, port) = parse_server_url(&cluster.server)?;

        // Build TLS config
        let tls_config = if use_tls {
            Some(Arc::new(build_tls_config(cluster, user).await?))
        } else {
            None
        };

        // Auth header
        let auth_header = user.token.as_ref().map(|token| format!("Bearer {token}"));

        Ok(Self {
            server_url: cluster.server.clone(),
            host,
            port,
            use_tls,
            tls_config,
            auth_header,
        })
    }

    /// Execute an HTTP GET request against the K8s API and return the JSON body.
    pub async fn get(&self, path: &str) -> Result<Value, String> {
        let raw = self.get_raw_text(path).await?;
        serde_json::from_str(&raw).map_err(|e| format!("JSON parse error: {e}"))
    }

    /// Execute an HTTP GET and return the raw response body as text.
    pub async fn get_raw_text(&self, path: &str) -> Result<String, String> {
        let request = format!(
            "GET {path} HTTP/1.1\r\n\
             Host: {host}\r\n\
             Accept: application/json\r\n\
             Connection: close\r\n\
             {auth}\
             \r\n",
            host = self.host,
            auth = self
                .auth_header
                .as_ref()
                .map(|a| format!("Authorization: {a}\r\n"))
                .unwrap_or_default(),
        );

        let addr = format!("{}:{}", self.host, self.port);
        let tcp = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("TCP connect to {addr} failed: {e}"))?;

        if self.use_tls {
            let connector = TlsConnector::from(
                self.tls_config
                    .clone()
                    .ok_or("TLS config missing for HTTPS server")?,
            );
            let server_name = ServerName::try_from(self.host.clone())
                .map_err(|e| format!("Invalid server name '{}': {e}", self.host))?;

            let mut tls_stream = connector
                .connect(server_name, tcp)
                .await
                .map_err(|e| format!("TLS handshake failed: {e}"))?;

            tls_stream
                .write_all(request.as_bytes())
                .await
                .map_err(|e| format!("TLS write failed: {e}"))?;

            let mut buf = Vec::new();
            tls_stream
                .read_to_end(&mut buf)
                .await
                .map_err(|e| format!("TLS read failed: {e}"))?;

            parse_http_response(&buf)
        } else {
            let mut tcp = tcp;
            tcp.write_all(request.as_bytes())
                .await
                .map_err(|e| format!("TCP write failed: {e}"))?;

            let mut buf = Vec::new();
            tcp.read_to_end(&mut buf)
                .await
                .map_err(|e| format!("TCP read failed: {e}"))?;

            parse_http_response(&buf)
        }
    }

    /// Execute an HTTP PUT request with a JSON body and return the JSON response.
    pub async fn put_json(&self, path: &str, body: &str) -> Result<Value, String> {
        self.send_json_body("PUT", path, body, "application/json").await
    }

    /// Execute an HTTP POST request with a JSON body and return the JSON response.
    pub async fn post_json(&self, path: &str, body: &str) -> Result<Value, String> {
        self.send_json_body("POST", path, body, "application/json").await
    }

    /// Execute an HTTP PATCH request with a JSON body and return the JSON response.
    pub async fn patch_json(&self, path: &str, body: &str) -> Result<Value, String> {
        self.send_json_body(
            "PATCH",
            path,
            body,
            "application/strategic-merge-patch+json",
        )
        .await
    }

    pub async fn send_json_body(
        &self,
        method: &str,
        path: &str,
        body: &str,
        content_type: &str,
    ) -> Result<Value, String> {
        let content_len = body.len();
        let request = format!(
            "{method} {path} HTTP/1.1\r\n\
             Host: {host}\r\n\
             Content-Type: {content_type}\r\n\
             Accept: application/json\r\n\
             Content-Length: {content_len}\r\n\
             Connection: close\r\n\
             {auth}\
             \r\n\
             {body}",
            host = self.host,
            auth = self
                .auth_header
                .as_ref()
                .map(|a| format!("Authorization: {a}\r\n"))
                .unwrap_or_default(),
        );

        let addr = format!("{}:{}", self.host, self.port);
        let tcp = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("TCP connect to {addr} failed: {e}"))?;

        let raw = if self.use_tls {
            let connector = TlsConnector::from(
                self.tls_config
                    .clone()
                    .ok_or("TLS config missing for HTTPS server")?,
            );
            let server_name = ServerName::try_from(self.host.clone())
                .map_err(|e| format!("Invalid server name '{}': {e}", self.host))?;

            let mut tls_stream = connector
                .connect(server_name, tcp)
                .await
                .map_err(|e| format!("TLS handshake failed: {e}"))?;

            tls_stream
                .write_all(request.as_bytes())
                .await
                .map_err(|e| format!("TLS write failed: {e}"))?;

            let mut buf = Vec::new();
            tls_stream
                .read_to_end(&mut buf)
                .await
                .map_err(|e| format!("TLS read failed: {e}"))?;

            parse_http_response(&buf)?
        } else {
            let mut tcp = tcp;
            tcp.write_all(request.as_bytes())
                .await
                .map_err(|e| format!("TCP write failed: {e}"))?;

            let mut buf = Vec::new();
            tcp.read_to_end(&mut buf)
                .await
                .map_err(|e| format!("TCP read failed: {e}"))?;

            parse_http_response(&buf)?
        };

        serde_json::from_str(&raw).map_err(|e| format!("JSON parse error: {e}"))
    }
}

impl std::fmt::Debug for K8sClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("K8sClient")
            .field("server_url", &self.server_url)
            .finish_non_exhaustive()
    }
}

// ---------------------------------------------------------------------------
// TLS helpers
// ---------------------------------------------------------------------------

async fn build_tls_config(
    cluster: &KubeconfigCluster,
    user: &KubeconfigUser,
) -> Result<rustls::ClientConfig, String> {
    let mut root_store = rustls::RootCertStore::empty();

    // Add cluster CA
    if let Some(ref ca_b64) = cluster.ca_data {
        let ca_pem = BASE64
            .decode(ca_b64)
            .map_err(|e| format!("CA data base64 decode failed: {e}"))?;
        add_pem_certs_to_store(&mut root_store, &ca_pem)?;
    } else if let Some(ref ca_path) = cluster.ca_file {
        let ca_pem = tokio::fs::read(ca_path)
            .await
            .map_err(|e| format!("Read CA file {ca_path}: {e}"))?;
        add_pem_certs_to_store(&mut root_store, &ca_pem)?;
    } else {
        // Fall back to system/webpki roots
        root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    }

    // Client-certificate auth
    let client_auth = resolve_client_cert(user).await?;

    let config = if let Some((certs, key)) = client_auth {
        rustls::ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_client_auth_cert(certs, key)
            .map_err(|e| format!("Client cert auth config failed: {e}"))?
    } else {
        rustls::ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth()
    };

    Ok(config)
}

fn add_pem_certs_to_store(
    store: &mut rustls::RootCertStore,
    pem_bytes: &[u8],
) -> Result<(), String> {
    let mut reader = BufReader::new(pem_bytes);
    let certs: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut reader)
        .filter_map(Result::ok)
        .collect();
    if certs.is_empty() {
        return Err("No valid certificates found in PEM data".into());
    }
    for cert in certs {
        store
            .add(cert)
            .map_err(|e| format!("Add CA cert failed: {e}"))?;
    }
    Ok(())
}

async fn resolve_client_cert(
    user: &KubeconfigUser,
) -> Result<Option<(Vec<CertificateDer<'static>>, PrivateKeyDer<'static>)>, String> {
    let cert_pem = if let Some(ref b64) = user.client_cert_data {
        Some(
            BASE64
                .decode(b64)
                .map_err(|e| format!("Client cert base64 decode: {e}"))?,
        )
    } else if let Some(ref path) = user.client_cert_file {
        Some(
            tokio::fs::read(path)
                .await
                .map_err(|e| format!("Read client cert {path}: {e}"))?,
        )
    } else {
        None
    };

    let key_pem = if let Some(ref b64) = user.client_key_data {
        Some(
            BASE64
                .decode(b64)
                .map_err(|e| format!("Client key base64 decode: {e}"))?,
        )
    } else if let Some(ref path) = user.client_key_file {
        Some(
            tokio::fs::read(path)
                .await
                .map_err(|e| format!("Read client key {path}: {e}"))?,
        )
    } else {
        None
    };

    match (cert_pem, key_pem) {
        (Some(cert_bytes), Some(key_bytes)) => {
            let certs: Vec<CertificateDer<'static>> =
                rustls_pemfile::certs(&mut BufReader::new(cert_bytes.as_slice()))
                    .filter_map(Result::ok)
                    .collect();
            if certs.is_empty() {
                return Err("No client certificates found in PEM".into());
            }

            let key = rustls_pemfile::private_key(&mut BufReader::new(key_bytes.as_slice()))
                .map_err(|e| format!("Parse client key: {e}"))?
                .ok_or("No private key found in PEM")?;

            Ok(Some((certs, key)))
        }
        (Some(_), None) => Err("Client certificate provided without key".into()),
        (None, Some(_)) => Err("Client key provided without certificate".into()),
        (None, None) => Ok(None),
    }
}

// ---------------------------------------------------------------------------
// HTTP response parser
// ---------------------------------------------------------------------------

fn parse_http_response(raw: &[u8]) -> Result<String, String> {
    let mut reader = BufReader::new(raw);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .map_err(|e| format!("Read status line: {e}"))?;

    // Parse status code (e.g. "HTTP/1.1 200 OK")
    let status_code = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);

    // Skip headers until blank line
    loop {
        let mut header_line = String::new();
        let n = reader
            .read_line(&mut header_line)
            .map_err(|e| format!("Read header: {e}"))?;
        if n == 0 || header_line.trim().is_empty() {
            break;
        }
    }

    // Read the rest as body
    let mut body = String::new();
    reader
        .read_to_string(&mut body)
        .map_err(|e| format!("Read body: {e}"))?;

    if (200u16..300).contains(&status_code) {
        Ok(body)
    } else {
        Err(format!(
            "HTTP {status_code}: {}",
            body.chars().take(500).collect::<String>()
        ))
    }
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/// Parse a K8s server URL into (`use_tls`, `host`, `port`).
fn parse_server_url(url: &str) -> Result<(bool, String, u16), String> {
    let (scheme, rest) = if let Some(r) = url.strip_prefix("https://") {
        (true, r)
    } else if let Some(r) = url.strip_prefix("http://") {
        (false, r)
    } else {
        return Err(format!("Unsupported URL scheme in: {url}"));
    };

    // Strip trailing slash
    let rest = rest.trim_end_matches('/');

    let (host, port) = if let Some(bracket_end) = rest.find(']') {
        // IPv6: [::1]:6443
        let host = &rest[..=bracket_end];
        let port = rest[bracket_end + 1..]
            .strip_prefix(':')
            .and_then(|p| p.parse().ok())
            .unwrap_or(if scheme { 443 } else { 80 });
        (host.to_string(), port)
    } else if let Some(colon) = rest.rfind(':') {
        let host = &rest[..colon];
        let port = rest[colon + 1..]
            .parse()
            .unwrap_or(if scheme { 443 } else { 80 });
        (host.to_string(), port)
    } else {
        (rest.to_string(), if scheme { 443 } else { 80 })
    };

    Ok((scheme, host, port))
}

// ---------------------------------------------------------------------------
// K8s API URL builders
// ---------------------------------------------------------------------------

use crate::types::K8sResourceKind;

impl K8sResourceKind {
    /// Return the API group path and plural resource name for this kind.
    pub fn api_info(&self) -> (&'static str, &'static str) {
        match self {
            // Core v1 resources: /api/v1
            Self::Pod => ("/api/v1", "pods"),
            Self::Service => ("/api/v1", "services"),
            Self::ConfigMap => ("/api/v1", "configmaps"),
            Self::Secret => ("/api/v1", "secrets"),
            Self::Namespace => ("/api/v1", "namespaces"),
            Self::Node => ("/api/v1", "nodes"),
            Self::ServiceAccount => ("/api/v1", "serviceaccounts"),
            Self::PersistentVolumeClaim => ("/api/v1", "persistentvolumeclaims"),
            Self::PersistentVolume => ("/api/v1", "persistentvolumes"),

            // apps/v1
            Self::Deployment => ("/apis/apps/v1", "deployments"),
            Self::StatefulSet => ("/apis/apps/v1", "statefulsets"),
            Self::DaemonSet => ("/apis/apps/v1", "daemonsets"),
            Self::ReplicaSet => ("/apis/apps/v1", "replicasets"),

            // batch/v1
            Self::Job => ("/apis/batch/v1", "jobs"),
            Self::CronJob => ("/apis/batch/v1", "cronjobs"),

            // networking.k8s.io/v1
            Self::Ingress => ("/apis/networking.k8s.io/v1", "ingresses"),
            Self::NetworkPolicy => ("/apis/networking.k8s.io/v1", "networkpolicies"),

            // storage.k8s.io/v1
            Self::StorageClass => ("/apis/storage.k8s.io/v1", "storageclasses"),

            // rbac.authorization.k8s.io/v1
            Self::Role => ("/apis/rbac.authorization.k8s.io/v1", "roles"),
            Self::ClusterRole => ("/apis/rbac.authorization.k8s.io/v1", "clusterroles"),
            Self::RoleBinding => ("/apis/rbac.authorization.k8s.io/v1", "rolebindings"),
            Self::ClusterRoleBinding => {
                ("/apis/rbac.authorization.k8s.io/v1", "clusterrolebindings")
            }
        }
    }

    /// Whether this resource is cluster-scoped (not namespaced).
    pub fn is_cluster_scoped(&self) -> bool {
        matches!(
            self,
            Self::Namespace
                | Self::Node
                | Self::PersistentVolume
                | Self::StorageClass
                | Self::ClusterRole
                | Self::ClusterRoleBinding
        )
    }

    /// Build the API path to list resources of this kind.
    pub fn list_url(&self, namespace: Option<&str>) -> String {
        let (base, plural) = self.api_info();
        if let Some(ns) = namespace.filter(|_| !self.is_cluster_scoped()) {
            format!("{base}/namespaces/{ns}/{plural}")
        } else {
            format!("{base}/{plural}")
        }
    }

    /// Build the API path to get a single resource by name.
    pub fn get_url(&self, namespace: Option<&str>, name: &str) -> String {
        let (base, plural) = self.api_info();
        if let Some(ns) = namespace.filter(|_| !self.is_cluster_scoped()) {
            format!("{base}/namespaces/{ns}/{plural}/{name}")
        } else {
            format!("{base}/{plural}/{name}")
        }
    }
}

// ---------------------------------------------------------------------------
// Resource response parsing helpers
// ---------------------------------------------------------------------------

/// Extract a human-readable age string from a creation timestamp.
pub fn compute_age(creation_timestamp: Option<&str>) -> Option<String> {
    // Return the raw timestamp as age if present; a full time parser would
    // require the chrono crate. Callers can enhance this later.
    creation_timestamp.map(ToString::to_string)
}

/// Extract status from a pod-like resource's `.status.phase`.
pub fn extract_status(raw: &Value) -> Option<String> {
    raw.pointer("/status/phase")
        .and_then(|v| v.as_str())
        .map(String::from)
        .or_else(|| {
            // Deployments: availableReplicas / replicas
            let replicas = raw.pointer("/status/replicas").and_then(Value::as_u64);
            let available = raw
                .pointer("/status/availableReplicas")
                .and_then(Value::as_u64);
            match (replicas, available) {
                (Some(r), Some(a)) => Some(format!("{a}/{r}")),
                (Some(r), None) => Some(format!("0/{r}")),
                _ => None,
            }
        })
}

/// Parse a K8s list response (items array) into `K8sResource` vec.
pub fn parse_resource_list(json: &Value, kind_str: &str) -> Vec<crate::types::K8sResource> {
    let Some(items) = json.get("items").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let name = item
                .pointer("/metadata/name")
                .and_then(|v| v.as_str())?
                .to_string();
            let namespace = item
                .pointer("/metadata/namespace")
                .and_then(|v| v.as_str())
                .map(String::from);
            let age = compute_age(
                item.pointer("/metadata/creationTimestamp")
                    .and_then(|v| v.as_str()),
            );
            let status = extract_status(item);
            let labels = item.pointer("/metadata/labels").cloned();
            let annotations = item.pointer("/metadata/annotations").cloned();

            Some(crate::types::K8sResource {
                name,
                namespace,
                kind: kind_str.to_string(),
                status,
                age,
                labels,
                annotations,
                raw: Some(item.clone()),
            })
        })
        .collect()
}

/// Parse a single K8s resource JSON into `K8sResource`.
pub fn parse_single_resource(
    json: &Value,
    kind_str: &str,
) -> Result<crate::types::K8sResource, String> {
    let name = json
        .pointer("/metadata/name")
        .and_then(|v| v.as_str())
        .ok_or("Missing metadata.name")?
        .to_string();
    let namespace = json
        .pointer("/metadata/namespace")
        .and_then(|v| v.as_str())
        .map(String::from);
    let age = compute_age(
        json.pointer("/metadata/creationTimestamp")
            .and_then(|v| v.as_str()),
    );
    let status = extract_status(json);
    let labels = json.pointer("/metadata/labels").cloned();
    let annotations = json.pointer("/metadata/annotations").cloned();

    Ok(crate::types::K8sResource {
        name,
        namespace,
        kind: kind_str.to_string(),
        status,
        age,
        labels,
        annotations,
        raw: Some(json.clone()),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(clippy::needless_raw_string_hashes)]
    const SAMPLE_KUBECONFIG: &str = r#"
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: LS0tLS1CRUdJTi0tLS0t
    server: https://10.0.0.1:6443
  name: my-cluster
- cluster:
    certificate-authority: /etc/k8s/ca.pem
    server: https://prod.example.com
  name: prod-cluster
contexts:
- context:
    cluster: my-cluster
    namespace: default
    user: admin
  name: my-context
- context:
    cluster: prod-cluster
    user: prod-admin
  name: prod-context
current-context: my-context
users:
- name: admin
  user:
    token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9
- name: prod-admin
  user:
    client-certificate-data: LS0tLS1CRUdJTi0tLS0t
    client-key-data: LS0tLS1CRUdJTi0tLS0t
"#;

    #[test]
    fn test_parse_kubeconfig_clusters() {
        let kc = Kubeconfig::parse(SAMPLE_KUBECONFIG).unwrap();
        assert_eq!(kc.clusters.len(), 2);

        assert_eq!(kc.clusters[0].name, "my-cluster");
        assert_eq!(kc.clusters[0].server, "https://10.0.0.1:6443");
        assert_eq!(
            kc.clusters[0].ca_data.as_deref(),
            Some("LS0tLS1CRUdJTi0tLS0t")
        );
        assert!(kc.clusters[0].ca_file.is_none());

        assert_eq!(kc.clusters[1].name, "prod-cluster");
        assert_eq!(kc.clusters[1].server, "https://prod.example.com");
        assert!(kc.clusters[1].ca_data.is_none());
        assert_eq!(kc.clusters[1].ca_file.as_deref(), Some("/etc/k8s/ca.pem"));
    }

    #[test]
    fn test_parse_kubeconfig_users() {
        let kc = Kubeconfig::parse(SAMPLE_KUBECONFIG).unwrap();
        assert_eq!(kc.users.len(), 2);

        assert_eq!(kc.users[0].name, "admin");
        assert_eq!(
            kc.users[0].token.as_deref(),
            Some("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9")
        );
        assert!(kc.users[0].client_cert_data.is_none());

        assert_eq!(kc.users[1].name, "prod-admin");
        assert!(kc.users[1].token.is_none());
        assert!(kc.users[1].client_cert_data.is_some());
        assert!(kc.users[1].client_key_data.is_some());
    }

    #[test]
    fn test_parse_kubeconfig_contexts() {
        let kc = Kubeconfig::parse(SAMPLE_KUBECONFIG).unwrap();
        assert_eq!(kc.contexts.len(), 2);

        assert_eq!(kc.contexts[0].name, "my-context");
        assert_eq!(kc.contexts[0].cluster, "my-cluster");
        assert_eq!(kc.contexts[0].user, "admin");
        assert_eq!(kc.contexts[0].namespace.as_deref(), Some("default"));

        assert_eq!(kc.contexts[1].name, "prod-context");
        assert_eq!(kc.contexts[1].cluster, "prod-cluster");
        assert_eq!(kc.contexts[1].user, "prod-admin");
        assert!(kc.contexts[1].namespace.is_none());
    }

    #[test]
    fn test_parse_kubeconfig_current_context() {
        let kc = Kubeconfig::parse(SAMPLE_KUBECONFIG).unwrap();
        assert_eq!(kc.current_context.as_deref(), Some("my-context"));
    }

    #[test]
    fn test_resolve_context() {
        let kc = Kubeconfig::parse(SAMPLE_KUBECONFIG).unwrap();
        let (cluster, user, ns) = kc.resolve_context("my-context").unwrap();
        assert_eq!(cluster.server, "https://10.0.0.1:6443");
        assert_eq!(user.name, "admin");
        assert_eq!(ns, Some("default"));

        let (cluster2, user2, ns2) = kc.resolve_context("prod-context").unwrap();
        assert_eq!(cluster2.server, "https://prod.example.com");
        assert_eq!(user2.name, "prod-admin");
        assert!(ns2.is_none());
    }

    #[test]
    fn test_resolve_context_not_found() {
        let kc = Kubeconfig::parse(SAMPLE_KUBECONFIG).unwrap();
        assert!(kc.resolve_context("nonexistent").is_err());
    }

    #[test]
    fn test_parse_server_url_https_with_port() {
        let (tls, host, port) = parse_server_url("https://10.0.0.1:6443").unwrap();
        assert!(tls);
        assert_eq!(host, "10.0.0.1");
        assert_eq!(port, 6443);
    }

    #[test]
    fn test_parse_server_url_https_default_port() {
        let (tls, host, port) = parse_server_url("https://k8s.example.com").unwrap();
        assert!(tls);
        assert_eq!(host, "k8s.example.com");
        assert_eq!(port, 443);
    }

    #[test]
    fn test_parse_server_url_http() {
        let (tls, host, port) = parse_server_url("http://localhost:8080").unwrap();
        assert!(!tls);
        assert_eq!(host, "localhost");
        assert_eq!(port, 8080);
    }

    #[test]
    fn test_parse_server_url_trailing_slash() {
        let (_, host, port) = parse_server_url("https://api.cluster.local:6443/").unwrap();
        assert_eq!(host, "api.cluster.local");
        assert_eq!(port, 6443);
    }

    #[test]
    fn test_resource_kind_list_url_namespaced() {
        assert_eq!(
            K8sResourceKind::Pod.list_url(Some("default")),
            "/api/v1/namespaces/default/pods"
        );
        assert_eq!(
            K8sResourceKind::Deployment.list_url(Some("kube-system")),
            "/apis/apps/v1/namespaces/kube-system/deployments"
        );
        assert_eq!(
            K8sResourceKind::Ingress.list_url(Some("web")),
            "/apis/networking.k8s.io/v1/namespaces/web/ingresses"
        );
        assert_eq!(
            K8sResourceKind::CronJob.list_url(Some("batch")),
            "/apis/batch/v1/namespaces/batch/cronjobs"
        );
    }

    #[test]
    fn test_resource_kind_list_url_cluster_scoped() {
        assert_eq!(
            K8sResourceKind::Namespace.list_url(None),
            "/api/v1/namespaces"
        );
        assert_eq!(K8sResourceKind::Node.list_url(None), "/api/v1/nodes");
        assert_eq!(
            K8sResourceKind::StorageClass.list_url(None),
            "/apis/storage.k8s.io/v1/storageclasses"
        );
        assert_eq!(
            K8sResourceKind::ClusterRole.list_url(None),
            "/apis/rbac.authorization.k8s.io/v1/clusterroles"
        );
        // Cluster-scoped kind ignores namespace even if provided
        assert_eq!(
            K8sResourceKind::Node.list_url(Some("default")),
            "/api/v1/nodes"
        );
    }

    #[test]
    fn test_resource_kind_get_url() {
        assert_eq!(
            K8sResourceKind::Pod.get_url(Some("default"), "my-pod"),
            "/api/v1/namespaces/default/pods/my-pod"
        );
        assert_eq!(
            K8sResourceKind::Node.get_url(None, "worker-1"),
            "/api/v1/nodes/worker-1"
        );
        assert_eq!(
            K8sResourceKind::Deployment.get_url(Some("prod"), "nginx"),
            "/apis/apps/v1/namespaces/prod/deployments/nginx"
        );
    }

    #[test]
    fn test_resource_kind_all_api_paths() {
        // Ensure every variant has api_info defined (no panic)
        let kinds = [
            K8sResourceKind::Pod,
            K8sResourceKind::Deployment,
            K8sResourceKind::Service,
            K8sResourceKind::ConfigMap,
            K8sResourceKind::Secret,
            K8sResourceKind::Ingress,
            K8sResourceKind::StatefulSet,
            K8sResourceKind::DaemonSet,
            K8sResourceKind::Job,
            K8sResourceKind::CronJob,
            K8sResourceKind::ReplicaSet,
            K8sResourceKind::PersistentVolumeClaim,
            K8sResourceKind::PersistentVolume,
            K8sResourceKind::StorageClass,
            K8sResourceKind::Namespace,
            K8sResourceKind::Node,
            K8sResourceKind::ServiceAccount,
            K8sResourceKind::NetworkPolicy,
            K8sResourceKind::Role,
            K8sResourceKind::ClusterRole,
            K8sResourceKind::RoleBinding,
            K8sResourceKind::ClusterRoleBinding,
        ];
        for kind in &kinds {
            let (base, plural) = kind.api_info();
            assert!(!base.is_empty());
            assert!(!plural.is_empty());
        }
    }

    #[test]
    fn test_parse_resource_list() {
        let json: Value = serde_json::from_str(
            r#"{
            "kind": "PodList",
            "items": [
                {
                    "metadata": {
                        "name": "nginx-abc123",
                        "namespace": "default",
                        "creationTimestamp": "2024-01-15T10:00:00Z",
                        "labels": {"app": "nginx"}
                    },
                    "status": {"phase": "Running"}
                },
                {
                    "metadata": {
                        "name": "redis-xyz",
                        "namespace": "default",
                        "creationTimestamp": "2024-01-14T08:00:00Z"
                    },
                    "status": {"phase": "Pending"}
                }
            ]
        }"#,
        )
        .unwrap();

        let resources = parse_resource_list(&json, "Pod");
        assert_eq!(resources.len(), 2);
        assert_eq!(resources[0].name, "nginx-abc123");
        assert_eq!(resources[0].namespace.as_deref(), Some("default"));
        assert_eq!(resources[0].kind, "Pod");
        assert_eq!(resources[0].status.as_deref(), Some("Running"));
        assert!(resources[0].labels.is_some());
        assert!(resources[0].raw.is_some());

        assert_eq!(resources[1].name, "redis-xyz");
        assert_eq!(resources[1].status.as_deref(), Some("Pending"));
    }

    #[test]
    fn test_parse_resource_list_deployment() {
        let json: Value = serde_json::from_str(
            r#"{
            "kind": "DeploymentList",
            "items": [
                {
                    "metadata": {
                        "name": "web",
                        "namespace": "prod",
                        "creationTimestamp": "2024-01-10T00:00:00Z"
                    },
                    "status": {"replicas": 3, "availableReplicas": 2}
                }
            ]
        }"#,
        )
        .unwrap();

        let resources = parse_resource_list(&json, "Deployment");
        assert_eq!(resources.len(), 1);
        assert_eq!(resources[0].status.as_deref(), Some("2/3"));
    }

    #[test]
    fn test_parse_resource_list_empty() {
        let json: Value = serde_json::from_str(r#"{"kind":"PodList","items":[]}"#).unwrap();
        assert!(parse_resource_list(&json, "Pod").is_empty());
    }

    #[test]
    fn test_parse_single_resource() {
        let json: Value = serde_json::from_str(
            r#"{
            "metadata": {
                "name": "my-pod",
                "namespace": "default",
                "creationTimestamp": "2024-01-15T10:00:00Z",
                "labels": {"app": "test"},
                "annotations": {"note": "hello"}
            },
            "status": {"phase": "Running"}
        }"#,
        )
        .unwrap();

        let res = parse_single_resource(&json, "Pod").unwrap();
        assert_eq!(res.name, "my-pod");
        assert_eq!(res.namespace.as_deref(), Some("default"));
        assert_eq!(res.status.as_deref(), Some("Running"));
        assert!(res.labels.is_some());
        assert!(res.annotations.is_some());
        assert!(res.raw.is_some());
    }

    #[test]
    fn test_parse_http_response_ok() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"ok\":true}";
        let body = parse_http_response(raw).unwrap();
        assert_eq!(body, r#"{"ok":true}"#);
    }

    #[test]
    fn test_parse_http_response_error() {
        let raw = b"HTTP/1.1 403 Forbidden\r\n\r\n{\"message\":\"forbidden\"}";
        let err = parse_http_response(raw).unwrap_err();
        assert!(err.contains("403"));
    }

    #[test]
    fn test_yaml_value_plain() {
        assert_eq!(
            yaml_value("  server: https://10.0.0.1:6443", "server:"),
            "https://10.0.0.1:6443"
        );
    }

    #[test]
    fn test_yaml_value_quoted() {
        assert_eq!(yaml_value("  token: \"abc123\"", "token:"), "abc123");
    }

    // Test kubeconfig with user-provided file paths for certs
    #[allow(clippy::needless_raw_string_hashes)]
    #[test]
    fn test_parse_kubeconfig_file_paths() {
        let yaml = r#"
apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://10.0.0.1:6443
    certificate-authority: /path/to/ca.crt
  name: file-cluster
contexts:
- context:
    cluster: file-cluster
    user: file-user
  name: file-ctx
current-context: file-ctx
users:
- name: file-user
  user:
    client-certificate: /path/to/cert.pem
    client-key: /path/to/key.pem
"#;
        let kc = Kubeconfig::parse(yaml).unwrap();
        assert_eq!(kc.clusters[0].ca_file.as_deref(), Some("/path/to/ca.crt"));
        assert_eq!(
            kc.users[0].client_cert_file.as_deref(),
            Some("/path/to/cert.pem")
        );
        assert_eq!(
            kc.users[0].client_key_file.as_deref(),
            Some("/path/to/key.pem")
        );
    }
}
