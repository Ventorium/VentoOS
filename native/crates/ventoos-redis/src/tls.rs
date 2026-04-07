//! TLS connection support for Redis.
//!
//! Wraps TCP streams with rustls for encrypted Redis connections.
//! Supports CA certificates and client certificate authentication.

use std::sync::Arc;

use rustls::pki_types::ServerName;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tracing::debug;

use crate::types::RedisTlsConfig;

/// Create a TLS-wrapped TCP connection to a Redis server.
pub async fn connect_tls(
    host: &str,
    port: u16,
    tls_config: &RedisTlsConfig,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>, String> {
    let addr = format!("{host}:{port}");
    let stream = TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("TCP connect failed: {e}"))?;

    let config = build_tls_config(tls_config)?;
    let connector = TlsConnector::from(Arc::new(config));

    let server_name = ServerName::try_from(host.to_string())
        .map_err(|e| format!("Invalid server name '{host}': {e}"))?;

    debug!("Establishing TLS connection to {addr}");
    let tls_stream = connector
        .connect(server_name, stream)
        .await
        .map_err(|e| format!("TLS handshake failed: {e}"))?;

    Ok(tls_stream)
}

fn build_tls_config(tls_config: &RedisTlsConfig) -> Result<rustls::ClientConfig, String> {
    let mut root_store = rustls::RootCertStore::empty();

    // Add CA certificate if provided
    if let Some(ref ca_pem) = tls_config.ca_cert {
        let certs = rustls_pemfile::certs(&mut ca_pem.as_bytes())
            .filter_map(std::result::Result::ok)
            .collect::<Vec<_>>();

        for cert in certs {
            root_store
                .add(cert)
                .map_err(|e| format!("Failed to add CA cert: {e}"))?;
        }
    } else {
        // Use system/webpki roots
        root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    }

    let builder = rustls::ClientConfig::builder().with_root_certificates(root_store);

    // Add client certificate if provided
    let config = if let (Some(cert_pem), Some(key_pem)) =
        (&tls_config.client_cert, &tls_config.client_key)
    {
        let certs = rustls_pemfile::certs(&mut cert_pem.as_bytes())
            .filter_map(std::result::Result::ok)
            .collect::<Vec<_>>();

        let key = rustls_pemfile::private_key(&mut key_pem.as_bytes())
            .map_err(|e| format!("Failed to parse client key: {e}"))?
            .ok_or("No private key found in PEM")?;

        builder
            .with_client_auth_cert(certs, key)
            .map_err(|e| format!("Failed to set client cert: {e}"))?
    } else {
        builder.with_no_client_auth()
    };

    Ok(config)
}
