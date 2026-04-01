//! Built-in WebDAV server that exposes VFS mounts to external WebDAV clients.
//!
//! The server is mounted at `/webdav/` on the same HTTP port as the main API.
//! Each exposed mount is accessible as a top-level "directory":
//!
//!   /webdav/{mount_name}/{file_path...}
//!
//! Access is protected by HTTP Basic Auth.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, Request, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::Router;

use crate::manager::VfsManager;
use crate::types::{
    VfsCopyReq, VfsDeleteReq, VfsMkdirReq, VfsMoveReq, VfsWriteReq,
    WebDavServerSettings,
};

/// Build the WebDAV sub-router.  All requests to `/webdav/*path` pass through
/// `webdav_handler`, which enforces Basic Auth and dispatches by HTTP method.
/// The returned router has state `Arc<VfsManager>` — the caller must apply
/// `.with_state(...)` after merging.
pub fn webdav_router() -> Router<Arc<VfsManager>> {
    Router::new()
        .route("/webdav", any(webdav_root_options))
        .route("/webdav/", any(webdav_root_options))
        .route("/webdav/{*path}", any(webdav_handler))
}

// ─── Root OPTIONS / PROPFIND ──────────────────────────────────────────────────

async fn webdav_root_options(
    State(mgr): State<Arc<VfsManager>>,
    req: Request,
) -> Response {
    let settings = mgr.webdav_server_settings().await;
    if !settings.enabled {
        return (StatusCode::NOT_FOUND, "WebDAV server is disabled").into_response();
    }

    match *req.method() {
        Method::OPTIONS => dav_options_response(),
        _ if req.method().as_str() == "PROPFIND" => {
            if let Err(r) = check_auth(&req, &settings) { return r; }
            propfind_root_response(&mgr, &settings).await
        }
        _ => (StatusCode::METHOD_NOT_ALLOWED, "").into_response(),
    }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async fn webdav_handler(
    State(mgr): State<Arc<VfsManager>>,
    Path(path): Path<String>,
    req: Request,
) -> Response {
    let settings = mgr.webdav_server_settings().await;
    if !settings.enabled {
        return (StatusCode::NOT_FOUND, "WebDAV server is disabled").into_response();
    }

    // Always allow OPTIONS without auth
    if *req.method() == Method::OPTIONS {
        return dav_options_response();
    }

    // Enforce Basic Auth
    if let Err(r) = check_auth(&req, &settings) {
        return r;
    }

    // Resolve mount from path: first segment is the mount name
    let (mount_id, file_path) = match resolve_mount(&mgr, &settings, &path).await {
        Ok(v) => v,
        Err(r) => return r,
    };

    let method = req.method().as_str().to_uppercase();
    let headers = req.headers().clone();

    match method.as_str() {
        "PROPFIND" => {
            let depth = headers
                .get("depth")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("1")
                .to_string();
            handle_propfind(&mgr, &mount_id, &file_path, &depth).await
        }
        "GET" | "HEAD" => handle_get(&mgr, &mount_id, &file_path, method == "HEAD").await,
        "PUT" => {
            let body = req.into_body();
            handle_put(&mgr, &mount_id, &file_path, body).await
        }
        "MKCOL" => handle_mkcol(&mgr, &mount_id, &file_path).await,
        "DELETE" => handle_delete(&mgr, &mount_id, &file_path).await,
        "MOVE" => {
            let dest = headers
                .get("destination")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            handle_move(&mgr, &mount_id, &file_path, &dest, &settings).await
        }
        "COPY" => {
            let dest = headers
                .get("destination")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            handle_copy(&mgr, &mount_id, &file_path, &dest, &settings).await
        }
        _ => (StatusCode::METHOD_NOT_ALLOWED, "Unsupported method").into_response(),
    }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

fn check_auth(req: &Request, settings: &WebDavServerSettings) -> Result<(), Response> {
    // If no password is set, skip auth
    if settings.password.is_empty() {
        return Ok(());
    }

    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !auth_header.starts_with("Basic ") {
        return Err(unauthorized_response());
    }

    let encoded = &auth_header["Basic ".len()..];
    let decoded = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        encoded.trim(),
    )
    .unwrap_or_default();
    let creds = String::from_utf8_lossy(&decoded);
    let (u, p) = creds.split_once(':').unwrap_or((&creds, ""));

    if u == settings.username && p == settings.password {
        Ok(())
    } else {
        Err(unauthorized_response())
    }
}

fn unauthorized_response() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        [("WWW-Authenticate", r#"Basic realm="VentoOS WebDAV""#)],
        "Unauthorized",
    )
        .into_response()
}

// ─── Mount resolution ─────────────────────────────────────────────────────────

/// Resolve the first path segment to a mount ID.
/// Returns `(mount_id, file_path_within_mount)`.
async fn resolve_mount(
    mgr: &VfsManager,
    settings: &WebDavServerSettings,
    path: &str,
) -> Result<(String, String), Response> {
    // path = "MountName/sub/dir/file.txt"
    let (mount_name, rest) = match path.split_once('/') {
        Some((m, r)) => (m, r),
        None => (path, ""),
    };

    let mounts = mgr.list_mounts().await;
    let mount = mounts
        .iter()
        .find(|m| settings.exposed_mounts.contains(&m.id) && m.name == mount_name);

    match mount {
        Some(m) => {
            let file_path = format!("/{}", rest.trim_start_matches('/'));
            Ok((m.id.clone(), file_path))
        }
        None => Err((StatusCode::NOT_FOUND, "Mount not found").into_response()),
    }
}

// ─── PROPFIND handler ─────────────────────────────────────────────────────────

async fn handle_propfind(
    mgr: &VfsManager,
    mount_id: &str,
    file_path: &str,
    depth: &str,
) -> Response {
    use crate::types::VfsListReq;

    let mount = match mgr.get_mount(mount_id).await {
        Some(m) => m,
        None => return (StatusCode::NOT_FOUND, "Mount not found").into_response(),
    };

    // stat the item first
    let stat = match mgr.stat(mount_id, file_path).await {
        Ok(s) => s,
        Err(e) => return (StatusCode::NOT_FOUND, e).into_response(),
    };

    let mut entries = vec![stat.clone()];

    // If it's a directory and depth != 0, also list children
    if stat.is_dir && depth != "0" {
        if let Ok(children) = mgr
            .list_dir(&VfsListReq {
                mount_id: mount_id.to_string(),
                path: file_path.to_string(),
            })
            .await
        {
            entries.extend(children);
        }
    }

    let prefix = format!("/webdav/{}", percent_encode_segment(&mount.name));
    let xml = build_multistatus_xml(&entries, &prefix, file_path);

    Response::builder()
        .status(StatusCode::MULTI_STATUS)
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("DAV", "1, 2")
        .body(Body::from(xml))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

async fn propfind_root_response(mgr: &VfsManager, settings: &WebDavServerSettings) -> Response {
    let mounts = mgr.list_mounts().await;
    let exposed: Vec<_> = mounts
        .iter()
        .filter(|m| settings.exposed_mounts.contains(&m.id))
        .collect();

    // Build a virtual root listing of all exposed mounts as directories
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">"#,
    );

    // Root entry
    xml.push_str(&build_response_xml("/webdav/", "", true, None, None));

    for m in &exposed {
        let href = format!("/webdav/{}/", percent_encode_segment(&m.name));
        xml.push_str(&build_response_xml(&href, &m.name, true, None, None));
    }

    xml.push_str("</D:multistatus>");

    Response::builder()
        .status(StatusCode::MULTI_STATUS)
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("DAV", "1, 2")
        .body(Body::from(xml))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

// ─── GET / HEAD ───────────────────────────────────────────────────────────────

async fn handle_get(mgr: &VfsManager, mount_id: &str, file_path: &str, head_only: bool) -> Response {
    match mgr.read_file_raw(mount_id, file_path).await {
        Ok(data) => {
            let mime = mime_guess::from_path(file_path)
                .first_raw()
                .unwrap_or("application/octet-stream");
            let content_length = data.len();
            let builder = Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", mime)
                .header("Content-Length", content_length.to_string());
            if head_only {
                builder.body(Body::empty()).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
            } else {
                builder.body(Body::from(data)).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
            }
        }
        Err(e) => (StatusCode::NOT_FOUND, e).into_response(),
    }
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

async fn handle_put(mgr: &VfsManager, mount_id: &str, file_path: &str, body: Body) -> Response {
    let bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    };

    match mgr
        .write_file(&VfsWriteReq {
            mount_id: mount_id.to_string(),
            path: file_path.to_string(),
            content: String::from_utf8_lossy(&bytes).to_string(),
        })
        .await
    {
        Ok(()) => StatusCode::CREATED.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

// ─── MKCOL ────────────────────────────────────────────────────────────────────

async fn handle_mkcol(mgr: &VfsManager, mount_id: &str, file_path: &str) -> Response {
    match mgr
        .mkdir(&VfsMkdirReq {
            mount_id: mount_id.to_string(),
            path: file_path.to_string(),
        })
        .await
    {
        Ok(()) => StatusCode::CREATED.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

async fn handle_delete(mgr: &VfsManager, mount_id: &str, file_path: &str) -> Response {
    match mgr
        .delete(&VfsDeleteReq {
            mount_id: mount_id.to_string(),
            path: file_path.to_string(),
        })
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

// ─── MOVE ─────────────────────────────────────────────────────────────────────

async fn handle_move(
    mgr: &VfsManager,
    mount_id: &str,
    src_path: &str,
    destination: &str,
    settings: &WebDavServerSettings,
) -> Response {
    let dest_path = match webdav_dest_to_vfs_path(destination, settings, mgr).await {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };

    match mgr
        .move_file(&VfsMoveReq {
            mount_id: mount_id.to_string(),
            src: src_path.to_string(),
            dest: dest_path,
        })
        .await
    {
        Ok(()) => StatusCode::CREATED.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

// ─── COPY ─────────────────────────────────────────────────────────────────────

async fn handle_copy(
    mgr: &VfsManager,
    mount_id: &str,
    src_path: &str,
    destination: &str,
    settings: &WebDavServerSettings,
) -> Response {
    let dest_path = match webdav_dest_to_vfs_path(destination, settings, mgr).await {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };

    match mgr
        .copy_file(&VfsCopyReq {
            mount_id: mount_id.to_string(),
            src: src_path.to_string(),
            dest: dest_path,
        })
        .await
    {
        Ok(()) => StatusCode::CREATED.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// Convert a WebDAV `Destination` header value to a VFS path within the same mount.
async fn webdav_dest_to_vfs_path(
    destination: &str,
    _settings: &WebDavServerSettings,
    _mgr: &VfsManager,
) -> Result<String, String> {
    // Destination may be absolute URL: http://host/webdav/MountName/path
    // or relative: /webdav/MountName/path
    let path_part = if destination.starts_with("http://") || destination.starts_with("https://") {
        destination
            .splitn(4, '/')
            .nth(3)
            .map(|s| format!("/{s}"))
            .unwrap_or_default()
    } else {
        destination.to_string()
    };

    // Strip /webdav/{mount_name} prefix
    let rest = path_part
        .strip_prefix("/webdav/")
        .unwrap_or(path_part.trim_start_matches('/'));

    // Get file path after mount name
    let file_path = match rest.split_once('/') {
        Some((_, fp)) => format!("/{fp}"),
        None => "/".to_string(),
    };

    Ok(file_path)
}

// ─── OPTIONS ──────────────────────────────────────────────────────────────────

fn dav_options_response() -> Response {
    let mut headers = HeaderMap::new();
    headers.insert("DAV", HeaderValue::from_static("1, 2"));
    headers.insert(
        "Allow",
        HeaderValue::from_static(
            "OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND",
        ),
    );
    headers.insert("MS-Author-Via", HeaderValue::from_static("DAV"));
    (StatusCode::OK, headers, "").into_response()
}

// ─── XML builders ─────────────────────────────────────────────────────────────

fn build_multistatus_xml(
    nodes: &[crate::types::VfsNode],
    mount_prefix: &str,
    request_path: &str,
) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">"#,
    );

    for node in nodes {
        let href = if node.path == "/" || node.path == request_path {
            // This is the root/requested directory itself
            let p = if node.is_dir {
                format!("{mount_prefix}/")
            } else {
                mount_prefix.to_string()
            };
            p
        } else {
            let segs: String = node
                .path
                .split('/')
                .filter(|s| !s.is_empty())
                .map(|s| format!("/{}", percent_encode_segment(s)))
                .collect();
            if node.is_dir {
                format!("{mount_prefix}{segs}/")
            } else {
                format!("{mount_prefix}{segs}")
            }
        };

        xml.push_str(&build_response_xml(
            &href,
            &node.name,
            node.is_dir,
            node.size,
            node.modified.as_deref(),
        ));
    }

    xml.push_str("</D:multistatus>");
    xml
}

fn build_response_xml(
    href: &str,
    name: &str,
    is_dir: bool,
    size: Option<u64>,
    modified: Option<&str>,
) -> String {
    let escaped_href = xml_escape(href);
    let escaped_name = xml_escape(name);
    let resource_type = if is_dir {
        "<D:resourcetype><D:collection/></D:resourcetype>"
    } else {
        "<D:resourcetype/>"
    };
    let content_length = size
        .map(|s| format!("<D:getcontentlength>{s}</D:getcontentlength>"))
        .unwrap_or_default();
    let last_modified = modified
        .map(|m| format!("<D:getlastmodified>{}</D:getlastmodified>", xml_escape(m)))
        .unwrap_or_default();

    format!(
        r#"<D:response><D:href>{escaped_href}</D:href><D:propstat><D:prop>{resource_type}<D:displayname>{escaped_name}</D:displayname>{content_length}{last_modified}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>"#
    )
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn percent_encode_segment(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' | b'!' | b'\'' | b'(' | b')' | b'*' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push(char::from_digit((b >> 4) as u32, 16).unwrap_or('0').to_ascii_uppercase());
                out.push(char::from_digit((b & 0xf) as u32, 16).unwrap_or('0').to_ascii_uppercase());
            }
        }
    }
    out
}
