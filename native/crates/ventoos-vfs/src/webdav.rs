//! WebDAV client adapter for VFS.
//!
//! URI format:
//!   webdav://[user:pass@]host[:port][/basePath]   — plain HTTP
//!   webdavs://[user:pass@]host[:port][/basePath]  — HTTPS

use reqwest::{Client, Method, RequestBuilder, StatusCode};

use crate::types::VfsNode;

// ─── Config ───────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub(crate) struct WebDavConfig {
    /// Full base URL (e.g. "https://demo.nextcloud.com/remote.php/dav/files/admin/")
    pub base_url: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

impl WebDavConfig {
    /// Parse a `webdav://` or `webdavs://` URI into a `WebDavConfig`.
    pub fn parse(uri: &str) -> Result<Self, String> {
        // Normalise scheme: webdav -> http, webdavs -> https
        let (scheme, rest) = if let Some(r) = uri.strip_prefix("webdavs://") {
            ("https", r)
        } else if let Some(r) = uri.strip_prefix("webdav://") {
            ("http", r)
        } else {
            return Err(format!("Not a WebDAV URI: {uri}"));
        };

        // Split credentials from host
        let (creds, host_path) = if let Some(at) = rest.rfind('@') {
            (Some(&rest[..at]), &rest[at + 1..])
        } else {
            (None, rest)
        };

        let (username, password) = if let Some(c) = creds {
            let (u, p) = c.split_once(':').unwrap_or((c, ""));
            (Some(urlencoding_decode(u)), Some(urlencoding_decode(p)))
        } else {
            (None, None)
        };

        // Build the base URL (ensure it ends with /)
        let base_url = format!("{scheme}://{host_path}");
        let base_url = if base_url.ends_with('/') {
            base_url
        } else {
            format!("{base_url}/")
        };

        Ok(Self {
            base_url,
            username,
            password,
        })
    }

    /// Build the full URL for a given VFS path.
    /// `rel_path` is like "/" or "/subdir/file.txt".
    pub fn url_for(&self, rel_path: &str) -> String {
        let path = rel_path.trim_start_matches('/');
        if path.is_empty() {
            self.base_url.clone()
        } else {
            // Percent-encode each path segment
            let encoded: Vec<String> = path.split('/').map(|seg| percent_encode(seg)).collect();
            format!("{}{}", self.base_url, encoded.join("/"))
        }
    }
}

// ─── HTTP client wrapper ──────────────────────────────────────────────────────

pub(crate) struct WebDavClient {
    pub config: WebDavConfig,
    client: Client,
}

impl WebDavClient {
    pub fn new(config: WebDavConfig) -> Self {
        let client = Client::builder()
            .danger_accept_invalid_certs(false)
            .build()
            .unwrap_or_default();
        Self { config, client }
    }

    fn request(&self, method: &str, url: &str) -> RequestBuilder {
        let m = Method::from_bytes(method.as_bytes()).unwrap_or(Method::GET);
        let mut req = self.client.request(m, url);
        if let (Some(u), Some(p)) = (&self.config.username, &self.config.password) {
            req = req.basic_auth(u, Some(p));
        }
        req
    }

    // ─── list_dir ─────────────────────────────────────────────────────────────

    pub async fn list_dir(&self, path: &str) -> Result<Vec<VfsNode>, String> {
        let url = self.config.url_for(path);
        tracing::debug!("WebDAV PROPFIND {url}");

        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:getetag/>
  </D:prop>
</D:propfind>"#;

        let resp = self
            .request("PROPFIND", &url)
            .header("Depth", "1")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("WebDAV PROPFIND failed: {e}"))?;

        let status = resp.status();
        if status != StatusCode::MULTI_STATUS {
            return Err(format!("WebDAV PROPFIND returned {status}"));
        }

        let text = resp
            .text()
            .await
            .map_err(|e| format!("WebDAV read body: {e}"))?;

        parse_propfind_response(&text, &self.config.base_url, path)
    }

    // ─── stat ─────────────────────────────────────────────────────────────────

    pub async fn stat(&self, path: &str) -> Result<VfsNode, String> {
        let url = self.config.url_for(path);

        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
  </D:prop>
</D:propfind>"#;

        let resp = self
            .request("PROPFIND", &url)
            .header("Depth", "0")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("WebDAV PROPFIND (stat) failed: {e}"))?;

        let status = resp.status();
        if status != StatusCode::MULTI_STATUS {
            return Err(format!("WebDAV stat returned {status}"));
        }

        let text = resp
            .text()
            .await
            .map_err(|e| format!("WebDAV read body: {e}"))?;

        let nodes = parse_propfind_response(&text, &self.config.base_url, path)?;
        nodes
            .into_iter()
            .next()
            .ok_or_else(|| "WebDAV stat: no response entry".to_string())
    }

    // ─── read_file ────────────────────────────────────────────────────────────

    pub async fn read_file(&self, path: &str, max_bytes: Option<u64>) -> Result<Vec<u8>, String> {
        let url = self.config.url_for(path);
        let mut req = self.request("GET", &url);
        if let Some(max) = max_bytes {
            req = req.header("Range", format!("bytes=0-{}", max - 1));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("WebDAV GET failed: {e}"))?;

        let status = resp.status();
        // 416 Range Not Satisfiable — some servers don't support partial content
        // (e.g. empty files or servers that ignore range headers). Retry without Range.
        if status == StatusCode::RANGE_NOT_SATISFIABLE {
            let resp2 = self
                .request("GET", &url)
                .send()
                .await
                .map_err(|e| format!("WebDAV GET fallback failed: {e}"))?;
            let status2 = resp2.status();
            if !status2.is_success() {
                return Err(format!("WebDAV GET returned {status2}"));
            }
            return resp2
                .bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(|e| format!("WebDAV read body: {e}"));
        }
        if !status.is_success() {
            return Err(format!("WebDAV GET returned {status}"));
        }

        resp.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("WebDAV read body: {e}"))
    }

    // ─── write_file ───────────────────────────────────────────────────────────

    pub async fn write_file(&self, path: &str, data: Vec<u8>) -> Result<(), String> {
        let url = self.config.url_for(path);
        let resp = self
            .request("PUT", &url)
            .body(data)
            .send()
            .await
            .map_err(|e| format!("WebDAV PUT failed: {e}"))?;

        let status = resp.status();
        if !status.is_success() {
            return Err(format!("WebDAV PUT returned {status}"));
        }
        Ok(())
    }

    // ─── mkdir ────────────────────────────────────────────────────────────────

    pub async fn mkdir(&self, path: &str) -> Result<(), String> {
        let url = self.config.url_for(path);
        let resp = self
            .request("MKCOL", &url)
            .send()
            .await
            .map_err(|e| format!("WebDAV MKCOL failed: {e}"))?;

        let status = resp.status();
        // 201 Created or 405 Method Not Allowed (already exists) are OK
        if status.is_success() || status == StatusCode::METHOD_NOT_ALLOWED {
            return Ok(());
        }
        Err(format!("WebDAV MKCOL returned {status}"))
    }

    // ─── delete ───────────────────────────────────────────────────────────────

    pub async fn delete(&self, path: &str) -> Result<(), String> {
        let url = self.config.url_for(path);
        let resp = self
            .request("DELETE", &url)
            .send()
            .await
            .map_err(|e| format!("WebDAV DELETE failed: {e}"))?;

        let status = resp.status();
        if status.is_success() || status == StatusCode::NOT_FOUND {
            return Ok(());
        }
        Err(format!("WebDAV DELETE returned {status}"))
    }

    // ─── move_file ────────────────────────────────────────────────────────────

    pub async fn move_file(&self, src: &str, dest: &str) -> Result<(), String> {
        let src_url = self.config.url_for(src);
        let dest_url = self.config.url_for(dest);
        let resp = self
            .request("MOVE", &src_url)
            .header("Destination", &dest_url)
            .header("Overwrite", "T")
            .send()
            .await
            .map_err(|e| format!("WebDAV MOVE failed: {e}"))?;

        let status = resp.status();
        if status.is_success() {
            return Ok(());
        }
        Err(format!("WebDAV MOVE returned {status}"))
    }

    // ─── copy_file ────────────────────────────────────────────────────────────

    pub async fn copy_file(&self, src: &str, dest: &str) -> Result<(), String> {
        let src_url = self.config.url_for(src);
        let dest_url = self.config.url_for(dest);
        let resp = self
            .request("COPY", &src_url)
            .header("Destination", &dest_url)
            .header("Overwrite", "T")
            .header("Depth", "infinity")
            .send()
            .await
            .map_err(|e| format!("WebDAV COPY failed: {e}"))?;

        let status = resp.status();
        if status.is_success() {
            return Ok(());
        }
        Err(format!("WebDAV COPY returned {status}"))
    }
}

// ─── PROPFIND XML parser ──────────────────────────────────────────────────────

/// Parse a WebDAV PROPFIND response body into `VfsNode` items.
/// Skips the entry matching `request_path` itself (i.e. only returns children
/// when called with Depth:1).
fn parse_propfind_response(
    xml: &str,
    base_url: &str,
    request_path: &str,
) -> Result<Vec<VfsNode>, String> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut nodes: Vec<VfsNode> = Vec::new();

    // State per <D:response>
    let mut in_response = false;
    let mut href_text = String::new();
    let mut in_href = false;
    let mut displayname = String::new();
    let mut in_displayname = false;
    let mut is_collection = false;
    let mut content_length: Option<u64> = None;
    let mut last_modified: Option<String> = None;
    let mut in_getcontentlength = false;
    let mut in_getlastmodified = false;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let qname = e.name();
                let name_bytes = qname.as_ref();
                let name = local_name(name_bytes);
                match name {
                    "response" => {
                        in_response = true;
                        href_text.clear();
                        displayname.clear();
                        is_collection = false;
                        content_length = None;
                        last_modified = None;
                    }
                    "href" if in_response => in_href = true,
                    "displayname" if in_response => in_displayname = true,
                    "getcontentlength" if in_response => in_getcontentlength = true,
                    "getlastmodified" if in_response => in_getlastmodified = true,
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                let qname = e.name();
                let name_bytes = qname.as_ref();
                let name = local_name(name_bytes);
                if name == "collection" && in_response {
                    is_collection = true;
                }
            }
            Ok(Event::End(ref e)) => {
                let qname = e.name();
                let name_bytes = qname.as_ref();
                let name = local_name(name_bytes);
                match name {
                    "href" => in_href = false,
                    "displayname" => in_displayname = false,
                    "getcontentlength" => in_getcontentlength = false,
                    "getlastmodified" => in_getlastmodified = false,
                    "response" if in_response => {
                        in_response = false;
                        // Convert href to a VFS path
                        if let Some(node) = href_to_vfs_node(
                            &href_text,
                            &displayname,
                            is_collection,
                            content_length,
                            last_modified.clone(),
                            base_url,
                            request_path,
                        ) {
                            nodes.push(node);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                if in_href {
                    href_text = text;
                } else if in_displayname {
                    displayname = text;
                } else if in_getcontentlength {
                    content_length = text.trim().parse().ok();
                } else if in_getlastmodified {
                    last_modified = Some(text);
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("WebDAV XML parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(nodes)
}

/// Extract the local XML element name, stripping any namespace prefix.
fn local_name(qname: &[u8]) -> &str {
    let s = std::str::from_utf8(qname).unwrap_or("");
    s.rfind(':').map_or(s, |i| &s[i + 1..])
}

/// Convert an `href` from a PROPFIND response into a `VfsNode` with a VFS-relative path.
/// Returns `None` for the root entry (i.e. the path matching `request_path`).
fn href_to_vfs_node(
    href: &str,
    displayname: &str,
    is_dir: bool,
    size: Option<u64>,
    modified: Option<String>,
    base_url: &str,
    request_path: &str,
) -> Option<VfsNode> {
    // href may be absolute (http://host/path) or relative (/path)
    let href_path = if href.starts_with("http://") || href.starts_with("https://") {
        // Strip scheme://host
        let no_scheme = href
            .splitn(3, '/')
            .nth(2)
            .map(|s| format!("/{s}"))
            .unwrap_or_else(|| href.to_string());
        no_scheme
    } else {
        href.to_string()
    };

    // Strip the base URL path prefix from the href path to get the VFS relative path
    let base_path = url_path(base_url);
    let rel = strip_prefix(&href_path, &base_path);

    // Percent-decode
    let decoded = percent_decode(rel);
    let vfs_path = format!("/{}", decoded.trim_matches('/'));

    // Strip the request_path to see if this IS the root (skip it)
    let req_clean = format!("/{}", request_path.trim_matches('/'));
    if vfs_path == req_clean || (vfs_path == "/" && req_clean == "/") {
        // This entry corresponds to the requested directory itself — skip it
        // unless Depth:0 was requested (stat).
        // We skip only if there might be children (list_dir scenario).
        // For stat we always include it.
        return None;
    }

    let name = if !displayname.is_empty() {
        displayname.to_string()
    } else {
        vfs_path
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or(&vfs_path)
            .to_string()
    };

    Some(VfsNode {
        name,
        path: vfs_path,
        is_dir,
        size,
        modified,
        permissions: None,
    })
}

/// Extract the path component from a URL string.
fn url_path(url: &str) -> String {
    // Strip scheme://host[:port]
    let without_scheme = if let Some(i) = url.find("://") {
        &url[i + 3..]
    } else {
        url
    };
    let path_start = without_scheme.find('/').unwrap_or(without_scheme.len());
    without_scheme[path_start..].to_string()
}

/// Strip a prefix from a string (case-sensitive).
fn strip_prefix<'a>(s: &'a str, prefix: &str) -> &'a str {
    s.strip_prefix(prefix).unwrap_or(s)
}

/// Minimal percent-decoder (handles %XX sequences, including multi-byte UTF-8).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut raw: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                raw.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        raw.push(bytes[i]);
        i += 1;
    }
    // Properly decode the accumulated bytes as UTF-8
    String::from_utf8(raw).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Minimal percent-encoder for URL path segments.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            // unreserved + safe-in-path
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~'
            | b'!'
            | b'\''
            | b'('
            | b')'
            | b'*' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push(char::from_digit((b >> 4) as u32, 16).unwrap_or('0'));
                out.push(char::from_digit((b & 0xf) as u32, 16).unwrap_or('0'));
            }
        }
    }
    out
}

fn urlencoding_decode(s: &str) -> String {
    percent_decode(&s.replace('+', " "))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_http_uri() {
        let cfg = WebDavConfig::parse("webdav://user:pass@example.com/dav").unwrap();
        assert_eq!(cfg.base_url, "http://example.com/dav/");
        assert_eq!(cfg.username.as_deref(), Some("user"));
        assert_eq!(cfg.password.as_deref(), Some("pass"));
    }

    #[test]
    fn test_parse_https_uri() {
        let cfg = WebDavConfig::parse("webdavs://example.com:443/dav/files/").unwrap();
        assert_eq!(cfg.base_url, "https://example.com:443/dav/files/");
        assert!(cfg.username.is_none());
    }

    #[test]
    fn test_url_for() {
        let cfg = WebDavConfig::parse("webdav://host/base/").unwrap();
        assert_eq!(cfg.url_for("/"), "http://host/base/");
        assert_eq!(
            cfg.url_for("/sub dir/file.txt"),
            "http://host/base/sub%20dir/file.txt"
        );
    }

    #[test]
    fn test_parse_propfind_response() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:displayname>dav</D:displayname>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/hello.txt</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:displayname>hello.txt</D:displayname>
        <D:getcontentlength>13</D:getcontentlength>
        <D:getlastmodified>Mon, 01 Jan 2024 00:00:00 GMT</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let nodes = parse_propfind_response(xml, "http://host/dav/", "/").unwrap();
        assert_eq!(nodes.len(), 1, "should skip root entry");
        assert_eq!(nodes[0].name, "hello.txt");
        assert_eq!(nodes[0].size, Some(13));
        assert!(!nodes[0].is_dir);
    }

    #[test]
    fn test_percent_encode() {
        assert_eq!(percent_encode("hello world"), "hello%20world");
        assert_eq!(percent_encode("file.txt"), "file.txt");
    }
}
