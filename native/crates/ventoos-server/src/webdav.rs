// webdav.rs — Minimal read-only WebDAV server for VFS mounts.
//
// Exposes VFS mounts at /dav/{mount_id}/ so macOS Finder (and any
// WebDAV client) can mount and browse them without requiring any
// code-signed extension or FUSE kernel module.
//
// Supported WebDAV methods:
//   OPTIONS   – advertise DAV support
//   PROPFIND  – list directory / file properties (depth 0 and 1)
//   GET       – download file contents
//   HEAD      – file headers without body

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, Method, Request, Response, StatusCode},
};
use std::sync::Arc;
use tracing::debug;
use ventoos_vfs::{VfsListReq, VfsManager};

use crate::state::AppState;

// ── Public Axum handler ────────────────────────────────────────────────────

/// Entry point for all `WebDAV` requests under `/dav/{mount_id}/{*path}`.
pub async fn webdav_handler(
    method: Method,
    State(state): State<AppState>,
    Path((mount_id, tail)): Path<(String, String)>,
    headers: HeaderMap,
    req: Request<Body>,
) -> Response<Body> {
    handle(method, Arc::clone(&state.vfs), mount_id, tail, headers, req).await
}

/// Entry point for `WebDAV` requests under `/dav/{mount_id}` (no trailing path).
pub async fn webdav_root_handler(
    method: Method,
    State(state): State<AppState>,
    Path(mount_id): Path<String>,
    headers: HeaderMap,
    req: Request<Body>,
) -> Response<Body> {
    handle(method, Arc::clone(&state.vfs), mount_id, String::new(), headers, req).await
}

// ── Core logic ────────────────────────────────────────────────────────────

async fn handle(
    method: Method,
    vfs: Arc<VfsManager>,
    mount_id: String,
    tail: String,
    headers: HeaderMap,
    _req: Request<Body>,
) -> Response<Body> {
    // Validate mount exists
    if vfs.get_mount(&mount_id).await.is_none() {
        return status_response(StatusCode::NOT_FOUND, "Mount not found");
    }

    // Normalize path: always starts with "/"
    let path = if tail.is_empty() || tail == "/" {
        "/".to_string()
    } else {
        format!("/{}", tail.trim_matches('/'))
    };

    debug!("WebDAV {method} /{mount_id}{path}");

    match method {
        Method::OPTIONS => options_response(),
        m if m.as_str() == "PROPFIND" => propfind(&vfs, &mount_id, &path, &headers).await,
        Method::GET => get_file(&vfs, &mount_id, &path).await,
        Method::HEAD => head_file(&vfs, &mount_id, &path).await,
        _ => status_response(StatusCode::METHOD_NOT_ALLOWED, "Read-only WebDAV"),
    }
}

// ── OPTIONS ────────────────────────────────────────────────────────────────

fn options_response() -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .header("DAV", "1, 2")
        .header("Allow", "OPTIONS, GET, HEAD, PROPFIND")
        .header("MS-Author-Via", "DAV")
        .header(header::CONTENT_LENGTH, "0")
        .body(Body::empty())
        .unwrap()
}

// ── PROPFIND ───────────────────────────────────────────────────────────────

async fn propfind(
    vfs: &VfsManager,
    mount_id: &str,
    path: &str,
    headers: &HeaderMap,
) -> Response<Body> {
    let depth = headers
        .get("depth")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("1");

    // Stat the requested path to determine if it's file or dir
    match vfs.stat(mount_id, path).await {
        Err(_) => status_response(StatusCode::NOT_FOUND, "Not found"),
        Ok(node) => {
            let base_href = format!("/dav/{mount_id}{}", encode_path(path));
            let mut responses = String::new();

            // Self
            responses.push_str(&prop_response(&base_href, &node));

            // Children if it's a directory and depth != "0"
            if node.is_dir && depth != "0" {
                let list_req = VfsListReq {
                    mount_id: mount_id.to_string(),
                    path: path.to_string(),
                    show_hidden: false,
                };
                if let Ok(children) = vfs.list_dir(&list_req).await {
                    for child in &children {
                        let child_href = format!(
                            "/dav/{mount_id}{}",
                            encode_path(&child.path)
                        );
                        responses.push_str(&prop_response(&child_href, child));
                    }
                }
            }

            let body = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:">
{responses}
</D:multistatus>"#
            );

            Response::builder()
                .status(207) // Multi-Status
                .header(header::CONTENT_TYPE, "application/xml; charset=utf-8")
                .header(header::CONTENT_LENGTH, body.len().to_string())
                .body(Body::from(body))
                .unwrap()
        }
    }
}

fn prop_response(href: &str, node: &ventoos_vfs::VfsNode) -> String {
    let display_name = node.name.replace('&', "&amp;").replace('<', "&lt;");
    let href_escaped = href.replace('&', "&amp;").replace('<', "&lt;");
    let resource_type = if node.is_dir {
        "<D:resourcetype><D:collection/></D:resourcetype>"
    } else {
        "<D:resourcetype/>"
    };
    let size_line = if let Some(sz) = node.size {
        format!("<D:getcontentlength>{sz}</D:getcontentlength>")
    } else {
        String::new()
    };
    let modified_line = if let Some(ref m) = node.modified {
        format!("<D:getlastmodified>{m}</D:getlastmodified>")
    } else {
        String::new()
    };
    let content_type = if node.is_dir {
        r"<D:getcontenttype>httpd/unix-directory</D:getcontenttype>".to_string()
    } else {
        let mime = mime_guess::from_path(&node.name)
            .first_or_octet_stream()
            .to_string();
        format!("<D:getcontenttype>{mime}</D:getcontenttype>")
    };

    format!(
        r"  <D:response>
    <D:href>{href_escaped}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>{display_name}</D:displayname>
        {resource_type}
        {size_line}
        {modified_line}
        {content_type}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
"
    )
}

// ── GET ────────────────────────────────────────────────────────────────────

async fn get_file(vfs: &VfsManager, mount_id: &str, path: &str) -> Response<Body> {
    // Check if it's a directory — return a simple HTML listing
    match vfs.stat(mount_id, path).await {
        Err(_) => return status_response(StatusCode::NOT_FOUND, "Not found"),
        Ok(node) if node.is_dir => {
            return directory_listing(vfs, mount_id, path).await;
        }
        Ok(_) => {}
    }

    match vfs.read_file_raw(mount_id, path).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CONTENT_LENGTH, bytes.len().to_string())
                .body(Body::from(bytes))
                .unwrap()
        }
        Err(e) => status_response(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn head_file(vfs: &VfsManager, mount_id: &str, path: &str) -> Response<Body> {
    match vfs.stat(mount_id, path).await {
        Err(_) => status_response(StatusCode::NOT_FOUND, ""),
        Ok(node) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            let mut builder = Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime);
            if let Some(sz) = node.size {
                builder = builder.header(header::CONTENT_LENGTH, sz.to_string());
            }
            builder.body(Body::empty()).unwrap()
        }
    }
}

async fn directory_listing(vfs: &VfsManager, mount_id: &str, path: &str) -> Response<Body> {
    use std::fmt::Write;
    let list_req = VfsListReq {
        mount_id: mount_id.to_string(),
        path: path.to_string(),
        show_hidden: false,
    };
    let children = vfs.list_dir(&list_req).await.unwrap_or_default();
    let mut rows = String::new();
    for child in &children {
        let href = format!("/dav/{}/{}", mount_id, child.path.trim_start_matches('/'));
        let name = &child.name;
        let kind = if child.is_dir { "📁" } else { "📄" };
        let _ = writeln!(
            rows,
            "<tr><td>{kind}</td><td><a href=\"{href}\">{name}</a></td></tr>"
        );
    }
    let html = format!(
        "<html><head><title>{path}</title></head><body><h2>{path}</h2><table>{rows}</table></body></html>"
    );
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(html))
        .unwrap()
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn encode_path(path: &str) -> String {
    use std::fmt::Write;
    path.split('/')
        .map(|segment| {
            let mut out = String::new();
            for b in segment.bytes() {
                if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                    out.push(b as char);
                } else {
                    let _ = write!(out, "%{b:02X}");
                }
            }
            out
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn status_response(status: StatusCode, msg: &str) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from(msg.to_string()))
        .unwrap()
}
