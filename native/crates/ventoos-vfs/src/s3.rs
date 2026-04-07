//! Minimal S3-compatible object storage VFS adapter.
//!
//! Implements AWS Signature V4 over raw TLS (tokio-rustls + ring).
//! Compatible with AWS S3, `MinIO`, Cloudflare R2, and any S3-compatible endpoint.
//!
//! URI format: `s3://accessKeyId:secretAccessKey@endpoint[:port]/bucket[/prefix]`
//! For HTTPS-only use: port defaults to 443.

use std::sync::Arc;
use std::sync::Once;

use ring::{digest, hmac};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

use crate::types::VfsNode;

// ─── S3 URI parser ────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub(crate) struct S3Config {
    pub access_key: String,
    pub secret_key: String,
    /// The endpoint hostname (e.g. "s3.amazonaws.com" or "minio.example.com")
    pub endpoint: String,
    pub port: u16,
    /// The bucket name.
    pub bucket: String,
    /// Optional key prefix (e.g. "backups/").
    pub prefix: String,
    /// AWS region (defaults to "us-east-1").
    pub region: String,
    /// Use path-style access (e.g., for `MinIO`).
    pub path_style: bool,
    /// Whether to use TLS (false when endpoint scheme is http://).
    pub use_tls: bool,
}

impl S3Config {
    /// Parse a URI: `s3://accessKey:secretKey@endpoint[:port]/bucket[/prefix]`
    /// Optionally append `?region=us-west-2&path_style=true`.
    pub fn parse(uri: &str) -> Result<Self, String> {
        let rest = uri
            .strip_prefix("s3://")
            .ok_or_else(|| format!("Not an S3 URI: {uri}"))?;

        // Split query string
        let (rest, query) = rest.split_once('?').unwrap_or((rest, ""));

        // auth@host:port/bucket/prefix
        let (auth, hostpath) = rest
            .split_once('@')
            .ok_or("S3 URI missing '@': expected s3://key:secret@endpoint/bucket")?;

        let (access_key, secret_key) = auth
            .split_once(':')
            .ok_or("S3 URI: access key and secret must be separated by ':'")?;

        let (hostport, bucket_prefix) = hostpath.split_once('/').unwrap_or((hostpath, ""));

        let (host, port_s) = hostport.split_once(':').unwrap_or((hostport, "443"));
        let port_from_host: u16 = port_s.parse().unwrap_or(443);

        let (bucket_from_path, prefix) = bucket_prefix
            .split_once('/')
            .map(|(b, p)| {
                // Ensure prefix always ends with '/' (but don't double)
                let prefix = if p.is_empty() {
                    String::new()
                } else if p.ends_with('/') {
                    p.to_string()
                } else {
                    format!("{p}/")
                };
                (b, prefix)
            })
            .unwrap_or((bucket_prefix, String::new()));

        // Parse query params first — we need `endpoint` to decide whether
        // the host part is the bucket (Rclone / Cloudflare R2 style) or the
        // endpoint (traditional AWS-style: s3://key:secret@s3.amazonaws.com/bucket).
        let mut region = "us-east-1".to_string();
        let mut path_style = false;
        let mut endpoint_from_query: Option<String> = None;
        let mut port_from_query: Option<u16> = None;
        let mut endpoint_is_http = false;
        for pair in query.split('&').filter(|s| !s.is_empty()) {
            if let Some((k, v)) = pair.split_once('=') {
                let v = urlpercent_decode(v);
                match k {
                    "region" => region = v,
                    "endpoint" => {
                        // Strip scheme, extract host and optional port
                        let (ep, is_http) = if let Some(s) = v.strip_prefix("http://") {
                            (s.to_string(), true)
                        } else if let Some(s) = v.strip_prefix("https://") {
                            (s.to_string(), false)
                        } else {
                            (v.to_string(), false)
                        };
                        let ep = ep.trim_end_matches('/');
                        let (ep_host, ep_port) = ep.split_once(':').unwrap_or((ep, ""));
                        if let Ok(p) = ep_port.parse::<u16>() {
                            port_from_query = Some(p);
                        }
                        endpoint_from_query = Some(ep_host.to_string());
                        endpoint_is_http = is_http;
                    }
                    "path_style" if v == "true" || v == "1" => path_style = true,
                    _ => {}
                }
            } else {
                match pair {
                    "path_style=true" | "path_style=1" => path_style = true,
                    _ => {}
                }
            }
        }

        // Determine (endpoint, port, bucket):
        // • If an `endpoint` query param is provided AND bucket_prefix is empty,
        //   the URI is in the bucket-as-host format: s3://key:secret@bucket?endpoint=...
        // • Otherwise it's the classical format:    s3://key:secret@endpoint/bucket
        let (endpoint, port, bucket, use_tls) = if let Some(ep) = endpoint_from_query {
            if bucket_from_path.is_empty() {
                // Rclone / R2-style: host == bucket, endpoint comes from query
                let p = port_from_query.unwrap_or(if endpoint_is_http { 80 } else { 443 });
                (ep, p, host.to_string(), !endpoint_is_http)
            } else {
                // endpoint given explicitly but bucket is also in path — prefer path
                let p = port_from_query.unwrap_or(port_from_host);
                (ep, p, bucket_from_path.to_string(), !endpoint_is_http)
            }
        } else {
            // No explicit endpoint — infer TLS from port (80 = plain HTTP)
            let tls = port_from_host != 80;
            (
                host.to_string(),
                port_from_host,
                bucket_from_path.to_string(),
                tls,
            )
        };

        if bucket.is_empty() {
            return Err("S3 URI: bucket name required. Expected s3://key:secret@endpoint/bucket or s3://key:secret@bucket?endpoint=https://...".to_string());
        }

        // Auto-detect MinIO by non-AWS endpoint → enable path-style
        let is_aws = endpoint.ends_with(".amazonaws.com");
        if !is_aws {
            path_style = true;
        }

        Ok(S3Config {
            access_key: access_key.to_string(),
            secret_key: secret_key.to_string(),
            endpoint,
            port,
            bucket,
            prefix,
            region,
            path_style,
            use_tls,
        })
    }

    /// Build the request URL path for this config.
    fn request_host(&self) -> String {
        if self.path_style {
            self.endpoint.clone()
        } else {
            format!("{}.{}", self.bucket, self.endpoint)
        }
    }

    fn base_path(&self, object_key: &str) -> String {
        if self.path_style {
            format!("/{}/{}", self.bucket, object_key.trim_start_matches('/'))
        } else {
            format!("/{}", object_key.trim_start_matches('/'))
        }
    }
}

// ─── Minimal percent-decoder (for S3 URI query param values) ─────────────────

fn urlpercent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut raw: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) =
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
            {
                raw.push(b);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            raw.push(b' ');
            i += 1;
            continue;
        }
        raw.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(raw).unwrap_or_default()
}

// ─── AWS Signature V4 ────────────────────────────────────────────────────────

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        write!(s, "{b:02x}").unwrap();
    }
    s
}

fn sha256_hex(data: &[u8]) -> String {
    let digest = digest::digest(&digest::SHA256, data);
    hex(digest.as_ref())
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let k = hmac::Key::new(hmac::HMAC_SHA256, key);
    hmac::sign(&k, data).as_ref().to_vec()
}

struct SigV4 {
    access_key: String,
    secret_key: String,
    region: String,
}

impl SigV4 {
    fn new(access_key: &str, secret_key: &str, region: &str) -> Self {
        Self {
            access_key: access_key.to_string(),
            secret_key: secret_key.to_string(),
            region: region.to_string(),
        }
    }

    /// Compute the Authorization header for an S3 request.
    ///
    /// Returns a map of headers that must be included: `authorization`, `x-amz-date`,
    /// `x-amz-content-sha256`, and optionally `x-amz-security-token`.
    #[allow(clippy::too_many_arguments)]
    fn sign(
        &self,
        datetime: &str, // e.g. "20240115T103000Z"
        method: &str,
        host: &str,
        path: &str,
        query: &str,
        extra_headers: &[(&str, &str)],
        payload: &[u8],
    ) -> Vec<(String, String)> {
        let date = &datetime[..8]; // "20240115"
        let payload_hash = sha256_hex(payload);

        // 1. Build canonical headers (must include host + x-amz-date + x-amz-content-sha256)
        let mut headers: Vec<(String, String)> = vec![
            ("host".to_string(), host.to_string()),
            ("x-amz-content-sha256".to_string(), payload_hash.clone()),
            ("x-amz-date".to_string(), datetime.to_string()),
        ];
        for (k, v) in extra_headers {
            headers.push((k.to_lowercase(), v.to_string()));
        }
        headers.sort_by(|a, b| a.0.cmp(&b.0));
        headers.dedup_by(|a, b| a.0 == b.0);

        let mut canonical_headers = String::new();
        for (k, v) in &headers {
            canonical_headers.push_str(k);
            canonical_headers.push(':');
            canonical_headers.push_str(v.trim());
            canonical_headers.push('\n');
        }
        let signed_headers: String = headers
            .iter()
            .map(|(k, _)| k.as_str())
            .collect::<Vec<_>>()
            .join(";");

        // 2. Canonical request
        let canonical_request = format!(
            "{method}\n{path}\n{query}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
        );

        // 3. String to sign
        let scope = format!("{date}/{}/s3/aws4_request", self.region);
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{datetime}\n{scope}\n{}",
            sha256_hex(canonical_request.as_bytes())
        );

        // 4. Signing key
        let signing_key = {
            let k_date = hmac_sha256(
                format!("AWS4{}", self.secret_key).as_bytes(),
                date.as_bytes(),
            );
            let k_region = hmac_sha256(&k_date, self.region.as_bytes());
            let k_service = hmac_sha256(&k_region, b"s3");
            hmac_sha256(&k_service, b"aws4_request")
        };

        // 5. Signature
        let signature = hex(&hmac_sha256(&signing_key, string_to_sign.as_bytes()));

        // 6. Authorization header value
        let authorization = format!(
            "AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
            access_key = self.access_key,
        );

        let mut result: Vec<(String, String)> =
            headers.into_iter().filter(|(k, _)| k != "host").collect();
        result.push(("authorization".to_string(), authorization));
        result
    }
}

// ─── Minimal HTTPS client ─────────────────────────────────────────────────────

/// Build a TLS connector using `WebPKI` roots.
fn tls_connector() -> TlsConnector {
    ensure_rustls_crypto_provider();
    let mut root_store = rustls::RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    TlsConnector::from(Arc::new(config))
}

fn ensure_rustls_crypto_provider() {
    static INSTALL_RUSTLS_PROVIDER: Once = Once::new();

    INSTALL_RUSTLS_PROVIDER.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

/// A parsed HTTP response.
struct HttpResponse {
    status: u16,
    body: Vec<u8>,
}

/// Make a single HTTPS/HTTP request and return the status + body bytes.
async fn https_request(
    connect_host: &str,
    http_host: &str,
    port: u16,
    use_tls: bool,
    method: &str,
    path_query: &str,
    headers: &[(String, String)],
    body: &[u8],
) -> Result<HttpResponse, String> {
    let tcp = TcpStream::connect(format!("{connect_host}:{port}"))
        .await
        .map_err(|e| format!("TCP connect {connect_host}:{port}: {e}"))?;
    let mut response_bytes = Vec::new();

    if use_tls {
        let connector = tls_connector();
        let server_name = rustls::pki_types::ServerName::try_from(connect_host.to_owned())
            .map_err(|e| format!("Invalid TLS server name '{connect_host}': {e}"))?;
        let mut tls = connector
            .connect(server_name, tcp)
            .await
            .map_err(|e| format!("TLS handshake with {connect_host}: {e}"))?;

        let req_bytes = build_http11_request(method, http_host, path_query, headers, body);
        tls.write_all(&req_bytes)
            .await
            .map_err(|e| format!("Write error: {e}"))?;
        tls.flush().await.map_err(|e| format!("Flush error: {e}"))?;
        tls.read_to_end(&mut response_bytes)
            .await
            .map_err(|e| format!("Read error: {e}"))?;
    } else {
        let mut stream = tcp;
        let req_bytes = build_http11_request(method, http_host, path_query, headers, body);
        stream
            .write_all(&req_bytes)
            .await
            .map_err(|e| format!("Write error: {e}"))?;
        stream
            .flush()
            .await
            .map_err(|e| format!("Flush error: {e}"))?;
        stream
            .read_to_end(&mut response_bytes)
            .await
            .map_err(|e| format!("Read error: {e}"))?;
    }

    parse_http_response(&response_bytes)
}

fn build_http11_request(
    method: &str,
    host: &str,
    path_query: &str,
    headers: &[(String, String)],
    body: &[u8],
) -> Vec<u8> {
    let mut req = format!(
        "{method} {path_query} HTTP/1.1\r\nHost: {host}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (k, v) in headers {
        req.push_str(k);
        req.push_str(": ");
        req.push_str(v);
        req.push_str("\r\n");
    }
    req.push_str("\r\n");
    let mut bytes = req.into_bytes();
    bytes.extend_from_slice(body);
    bytes
}

fn parse_http_response(raw: &[u8]) -> Result<HttpResponse, String> {
    // Find header/body separator
    let sep = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or("HTTP response: missing header/body separator")?;
    let headers_part = &raw[..sep];
    let body = raw[sep + 4..].to_vec();

    // Parse status line
    let headers_str = String::from_utf8_lossy(headers_part);
    let first_line = headers_str.lines().next().unwrap_or("");
    let status: u16 = first_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| format!("HTTP: could not parse status from '{first_line}'"))?;

    // Handle chunked transfer encoding
    let is_chunked = headers_str
        .lines()
        .any(|l| l.to_lowercase().starts_with("transfer-encoding:") && l.contains("chunked"));
    let final_body = if is_chunked {
        decode_chunked(&body)?
    } else {
        body
    };

    Ok(HttpResponse {
        status,
        body: final_body,
    })
}

fn decode_chunked(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut result = Vec::new();
    let mut pos = 0;
    loop {
        // Find end of chunk size line
        let end = data[pos..]
            .windows(2)
            .position(|w| w == b"\r\n")
            .map(|p| pos + p)
            .ok_or("Chunked: missing chunk size CRLF")?;
        let size_str = String::from_utf8_lossy(&data[pos..end]);
        // Strip extensions after ';'
        let size_hex = size_str.split(';').next().unwrap_or("").trim();
        let chunk_size = usize::from_str_radix(size_hex, 16)
            .map_err(|e| format!("Chunked: invalid chunk size '{size_hex}': {e}"))?;
        pos = end + 2;
        if chunk_size == 0 {
            break;
        }
        result.extend_from_slice(&data[pos..pos + chunk_size]);
        pos += chunk_size + 2; // skip trailing CRLF
    }
    Ok(result)
}

// ─── S3 XML helpers ───────────────────────────────────────────────────────────

/// Extract content between `<tag>` and `</tag>` in XML.
fn xml_tag(xml: &str, tag: &str) -> Vec<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut results = Vec::new();
    let mut start = 0;
    while let Some(s) = xml[start..].find(&open) {
        let abs_s = start + s + open.len();
        if let Some(e) = xml[abs_s..].find(&close) {
            results.push(xml[abs_s..abs_s + e].to_string());
            start = abs_s + e + close.len();
        } else {
            break;
        }
    }
    results
}

fn xml_first(xml: &str, tag: &str) -> Option<String> {
    xml_tag(xml, tag).into_iter().next()
}

// ─── S3 operations ───────────────────────────────────────────────────────────

/// Sort query string parameters alphabetically (required by AWS SigV4 canonical query).
fn sort_query_params(query: &str) -> String {
    if query.is_empty() {
        return String::new();
    }
    let mut pairs: Vec<&str> = query.split('&').filter(|s| !s.is_empty()).collect();
    pairs.sort_unstable();
    pairs.join("&")
}

/// Current UTC datetime in AWS format "20240115T103000Z" and date "20240115".
fn aws_datetime() -> (String, String) {
    let now = chrono::Utc::now();
    let datetime = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date = now.format("%Y%m%d").to_string();
    (datetime, date)
}

pub(crate) struct S3Client {
    cfg: S3Config,
    sig: SigV4,
}

impl S3Client {
    pub fn new(cfg: S3Config) -> Self {
        let sig = SigV4::new(&cfg.access_key, &cfg.secret_key, &cfg.region);
        Self { cfg, sig }
    }

    async fn do_request(
        &self,
        method: &str,
        key: &str,
        query: &str,
        extra_headers: &[(&str, &str)],
        body: &[u8],
    ) -> Result<HttpResponse, String> {
        let (datetime, _) = aws_datetime();
        let connect_host = self.cfg.request_host();
        // SigV4 canonical host must include port for non-standard ports
        let is_standard_port = (self.cfg.use_tls && self.cfg.port == 443)
            || (!self.cfg.use_tls && self.cfg.port == 80);
        let http_host = if is_standard_port {
            connect_host.clone()
        } else {
            format!("{}:{}", connect_host, self.cfg.port)
        };
        let path = self.cfg.base_path(key);
        // SigV4 canonical query string must be sorted alphabetically by key
        let canonical_query = sort_query_params(query);
        let path_query = if canonical_query.is_empty() {
            path.clone()
        } else {
            format!("{path}?{canonical_query}")
        };

        let auth_headers = self.sig.sign(
            &datetime,
            method,
            &http_host,
            &path,
            &canonical_query,
            extra_headers,
            body,
        );

        let mut all_headers = auth_headers;
        for (k, v) in extra_headers {
            all_headers.push((k.to_string(), v.to_string()));
        }

        https_request(
            &connect_host,
            &http_host,
            self.cfg.port,
            self.cfg.use_tls,
            method,
            &path_query,
            &all_headers,
            body,
        )
        .await
    }

    // ── List objects (delimiter='/' for pseudo-directory listing) ────────────

    pub async fn list_dir(&self, vfs_path: &str) -> Result<Vec<VfsNode>, String> {
        // Build prefix: config.prefix + vfs_path stripped of leading '/'
        let path_part = vfs_path.trim_start_matches('/');
        let prefix = if path_part.is_empty() {
            self.cfg.prefix.clone()
        } else if self.cfg.prefix.is_empty() {
            format!("{path_part}/")
        } else {
            format!("{}{path_part}/", self.cfg.prefix.trim_end_matches('/'))
        };

        let query = format!("list-type=2&delimiter=%2F&prefix={}", url_encode(&prefix));

        let resp = self.do_request("GET", "", &query, &[], &[]).await?;
        if resp.status != 200 {
            let body = String::from_utf8_lossy(&resp.body).to_string();
            return Err(format!(
                "S3 ListObjects failed: HTTP {}: {body}",
                resp.status
            ));
        }

        let xml = String::from_utf8_lossy(&resp.body).to_string();
        let mut nodes = Vec::new();

        // Parse <Contents> for files
        for content in xml_tag(&xml, "Contents") {
            let Some(key_full) = xml_first(&content, "Key") else {
                continue;
            };
            // Skip entries that look like directories (trailing '/')
            if key_full.ends_with('/') {
                continue;
            }
            let size: u64 = xml_first(&content, "Size")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            let modified = xml_first(&content, "LastModified");

            // Convert to VFS path by stripping prefix
            let rel = key_full.strip_prefix(&self.cfg.prefix).unwrap_or(&key_full);
            let name = rel.rsplit('/').next().unwrap_or(rel).to_string();
            let vfs_node_path = format!("/{rel}");

            nodes.push(VfsNode {
                name,
                path: vfs_node_path,
                is_dir: false,
                size: Some(size),
                modified,
                permissions: None,
            });
        }

        // Parse <CommonPrefixes> for "subdirectories"
        for cp in xml_tag(&xml, "CommonPrefixes") {
            let Some(cp_prefix) = xml_first(&cp, "Prefix") else {
                continue;
            };
            // e.g. "backups/2024/" → strip global prefix → "2024/"
            let rel = cp_prefix
                .strip_prefix(&self.cfg.prefix)
                .unwrap_or(&cp_prefix);
            let dir_name = rel.trim_end_matches('/').rsplit('/').next().unwrap_or(rel);
            let vfs_dir_path = format!("/{}", rel.trim_end_matches('/'));

            nodes.push(VfsNode {
                name: dir_name.to_string(),
                path: vfs_dir_path,
                is_dir: true,
                size: None,
                modified: None,
                permissions: None,
            });
        }

        // Sort: dirs first
        nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(nodes)
    }

    // ── Get object ───────────────────────────────────────────────────────────

    fn vfs_to_s3_key(&self, vfs_path: &str) -> String {
        let rel = vfs_path.trim_start_matches('/');
        if self.cfg.prefix.is_empty() {
            rel.to_string()
        } else {
            format!("{}{rel}", self.cfg.prefix.trim_end_matches('/'))
        }
    }

    pub async fn get_object(&self, vfs_path: &str) -> Result<Vec<u8>, String> {
        let key = self.vfs_to_s3_key(vfs_path);
        let resp = self.do_request("GET", &key, "", &[], &[]).await?;
        if resp.status != 200 {
            let body = String::from_utf8_lossy(&resp.body).to_string();
            return Err(format!(
                "S3 GetObject {key} failed: HTTP {}: {body}",
                resp.status
            ));
        }
        Ok(resp.body)
    }

    // ── Put object ───────────────────────────────────────────────────────────

    pub async fn put_object(&self, vfs_path: &str, data: &[u8]) -> Result<(), String> {
        let key = self.vfs_to_s3_key(vfs_path);
        let mime = mime_guess::from_path(&key)
            .first_or_octet_stream()
            .to_string();
        let extra = [("content-type", mime.as_str())];
        let resp = self.do_request("PUT", &key, "", &extra, data).await?;
        if resp.status != 200 && resp.status != 204 {
            let body = String::from_utf8_lossy(&resp.body).to_string();
            return Err(format!(
                "S3 PutObject {key} failed: HTTP {}: {body}",
                resp.status
            ));
        }
        Ok(())
    }

    // ── Delete object ────────────────────────────────────────────────────────

    pub async fn delete_object(&self, vfs_path: &str) -> Result<(), String> {
        let key = self.vfs_to_s3_key(vfs_path);
        let resp = self.do_request("DELETE", &key, "", &[], &[]).await?;
        if resp.status != 204 && resp.status != 200 {
            let body = String::from_utf8_lossy(&resp.body).to_string();
            return Err(format!(
                "S3 DeleteObject {key} failed: HTTP {}: {body}",
                resp.status
            ));
        }
        Ok(())
    }

    // ── Copy object ──────────────────────────────────────────────────────────

    pub async fn copy_object(&self, src_vfs: &str, dst_vfs: &str) -> Result<(), String> {
        let src_key = self.vfs_to_s3_key(src_vfs);
        let dst_key = self.vfs_to_s3_key(dst_vfs);
        let copy_src = format!("/{}/{src_key}", self.cfg.bucket);
        let extra = [("x-amz-copy-source", copy_src.as_str())];
        let resp = self.do_request("PUT", &dst_key, "", &extra, &[]).await?;
        if resp.status != 200 {
            let body = String::from_utf8_lossy(&resp.body).to_string();
            return Err(format!(
                "S3 CopyObject failed: HTTP {}: {body}",
                resp.status
            ));
        }
        Ok(())
    }

    // ── Head object (stat) ───────────────────────────────────────────────────

    pub async fn stat(&self, vfs_path: &str) -> Result<VfsNode, String> {
        let key = self.vfs_to_s3_key(vfs_path);
        let resp = self.do_request("HEAD", &key, "", &[], &[]).await?;
        let is_dir = vfs_path.ends_with('/') || resp.status == 404;
        if !is_dir && resp.status != 200 {
            return Err(format!("S3 HeadObject {key}: HTTP {}", resp.status));
        }
        let name = vfs_path
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or(vfs_path)
            .to_string();
        Ok(VfsNode {
            name,
            path: vfs_path.to_string(),
            is_dir,
            size: None,
            modified: None,
            permissions: None,
        })
    }

    // ── Search ───────────────────────────────────────────────────────────────

    pub async fn search(
        &self,
        start: &str,
        query: &str,
        max: usize,
    ) -> Result<Vec<VfsNode>, String> {
        let entries = self.list_dir(start).await?;
        let mut results = Vec::new();
        for e in entries {
            if e.name.to_lowercase().contains(&query.to_lowercase()) {
                results.push(e.clone());
            }
            if e.is_dir
                && results.len() < max
                && let Ok(sub) = Box::pin(self.search(&e.path, query, max - results.len())).await
            {
                results.extend(sub);
            }
            if results.len() >= max {
                break;
            }
        }
        Ok(results)
    }
}

// ─── URL encoding helpers ─────────────────────────────────────────────────────

fn url_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                char::from(b).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_s3_uri_aws() {
        let cfg = S3Config::parse("s3://AKID:SECRET@s3.amazonaws.com/my-bucket/backups/").unwrap();
        assert_eq!(cfg.access_key, "AKID");
        assert_eq!(cfg.secret_key, "SECRET");
        assert_eq!(cfg.endpoint, "s3.amazonaws.com");
        assert_eq!(cfg.bucket, "my-bucket");
        assert_eq!(cfg.prefix, "backups/");
        assert_eq!(cfg.region, "us-east-1");
        assert!(!cfg.path_style); // AWS uses virtual-hosted style
    }

    #[test]
    fn test_parse_s3_uri_minio() {
        let cfg =
            S3Config::parse("s3://admin:pass@minio.local:9000/data?region=us-east-1").unwrap();
        assert_eq!(cfg.endpoint, "minio.local");
        assert_eq!(cfg.port, 9000);
        assert_eq!(cfg.bucket, "data");
        assert!(cfg.path_style); // MinIO uses path-style
    }

    #[test]
    fn test_url_encode() {
        assert_eq!(url_encode("hello world/"), "hello%20world%2F");
        assert_eq!(url_encode("2024/01/"), "2024%2F01%2F");
    }

    #[test]
    fn test_xml_tag_parsing() {
        let xml = "<Contents><Key>backups/file.txt</Key><Size>1234</Size></Contents>";
        assert_eq!(xml_first(xml, "Key").as_deref(), Some("backups/file.txt"));
        assert_eq!(xml_first(xml, "Size").as_deref(), Some("1234"));
    }

    #[test]
    fn test_sigv4_signing() {
        // Test that signing produces a non-empty Authorization header
        let sig = SigV4::new(
            "AKIDEXAMPLE",
            "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            "us-east-1",
        );
        let headers = sig.sign(
            "20240115T103000Z",
            "GET",
            "s3.amazonaws.com",
            "/my-bucket/file.txt",
            "",
            &[],
            &[],
        );
        let auth = headers
            .iter()
            .find(|(k, _)| k == "authorization")
            .map_or("", |(_, v)| v.as_str());
        assert!(auth.starts_with("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/"));
    }

    #[test]
    fn test_decode_chunked() {
        // 7 = "Mozilla" (7 bytes), 12 hex = 18 = " Developer Network" (18 bytes)
        let chunked = b"7\r\nMozilla\r\n12\r\n Developer Network\r\n0\r\n\r\n";
        let decoded = decode_chunked(chunked).unwrap();
        assert_eq!(decoded, b"Mozilla Developer Network");
    }

    #[test]
    fn test_tls_connector_installs_rustls_crypto_provider() {
        let _connector = tls_connector();
        assert!(
            rustls::crypto::CryptoProvider::get_default().is_some(),
            "tls_connector should ensure a process-level rustls CryptoProvider is installed"
        );
    }
}
