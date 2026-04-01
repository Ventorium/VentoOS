//! VFS integration tests.
//!
//! These tests require real server infrastructure and are marked `#[ignore]`
//! so they do not run in normal CI. Run them explicitly with:
//!
//!   cargo test -p ventoos-vfs -- --ignored --test-threads=1
//!
//! Required environment (edit constants below or set env vars):
//!   - SFTP: root@<SFTP_HOST>:22 with password SFTP_PASS
//!   - S3 (MinIO): http://<S3_ENDPOINT> with S3_ACCESS_KEY / S3_SECRET_KEY
//!   - SMB: smb://<SMB_HOST>/<SMB_SHARE> user/pass SMB_USER / SMB_PASS
//!   - FTP: ftp://<FTP_HOST> user/pass FTP_USER / FTP_PASS

#![cfg(test)]

use crate::manager::VfsManager;
use crate::types::{CreateVfsMountReq, VfsListReq, VfsMkdirReq, VfsSourceKind};

fn sftp_host() -> String {
    std::env::var("SFTP_HOST").unwrap_or_else(|_| "192.168.211.239".to_string())
}
fn sftp_pass() -> String {
    std::env::var("SFTP_PASS").unwrap_or_else(|_| "eu5wG4z6NHvm".to_string())
}
fn s3_endpoint() -> String {
    std::env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://127.0.0.1:9000".to_string())
}
fn s3_access_key() -> String {
    std::env::var("S3_ACCESS_KEY").unwrap_or_else(|_| "rustfsadmin".to_string())
}
fn s3_secret_key() -> String {
    std::env::var("S3_SECRET_KEY").unwrap_or_else(|_| "rustfsadmin".to_string())
}
fn smb_host() -> String {
    std::env::var("SMB_HOST").unwrap_or_else(|_| "127.0.0.1".to_string())
}
fn smb_share() -> String {
    std::env::var("SMB_SHARE").unwrap_or_else(|_| "testshare".to_string())
}
fn smb_user() -> String {
    std::env::var("SMB_USER").unwrap_or_else(|_| "testuser".to_string())
}
fn smb_pass() -> String {
    std::env::var("SMB_PASS").unwrap_or_else(|_| "testpass".to_string())
}
fn ftp_host() -> String {
    std::env::var("FTP_HOST").unwrap_or_else(|_| "127.0.0.1".to_string())
}
fn ftp_user() -> String {
    std::env::var("FTP_USER").unwrap_or_else(|_| "testuser".to_string())
}
fn ftp_pass() -> String {
    std::env::var("FTP_PASS").unwrap_or_else(|_| "testpass".to_string())
}

// ─── SFTP ─────────────────────────────────────────────────────────────────

#[tokio::test]
#[ignore = "requires real SFTP server"]
async fn test_sftp_list_root() {
    let manager = VfsManager::new();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "test-sftp".to_string(),
            kind: VfsSourceKind::Sftp,
            root: format!("sftp://root:{}@{}", sftp_pass(), sftp_host()),
            connection_id: None,
            group: None,
        })
        .await;

    let result = manager
        .list_dir(&VfsListReq { mount_id: mount.id.clone(), path: "/".to_string() })
        .await;
    assert!(result.is_ok(), "SFTP list_dir failed: {:?}", result.err());
    let nodes = result.unwrap();
    assert!(!nodes.is_empty(), "Expected non-empty root directory");
}

#[tokio::test]
#[ignore = "requires real SFTP server"]
async fn test_sftp_test_connection() {
    let manager = VfsManager::new();
    let req = CreateVfsMountReq {
        name: "test-sftp-conn".to_string(),
        kind: VfsSourceKind::Sftp,
        root: format!("sftp://root:{}@{}", sftp_pass(), sftp_host()),
        connection_id: None,
        group: None,
    };
    let result = manager.test_connection(&req).await;
    assert!(result.is_ok(), "SFTP test_connection failed: {:?}", result.err());
}

#[tokio::test]
#[ignore = "requires real SFTP server"]
async fn test_sftp_mkdir_and_list() {
    let manager = VfsManager::new();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "test-sftp".to_string(),
            kind: VfsSourceKind::Sftp,
            root: format!("sftp://root:{}@{}", sftp_pass(), sftp_host()),
            connection_id: None,
            group: None,
        })
        .await;

    let dir_name = format!("/tmp/vfs_test_{}", uuid::Uuid::new_v4());
    let mkdir_result = manager
        .mkdir(&VfsMkdirReq {
            mount_id: mount.id.clone(),
            path: dir_name.clone(),
        })
        .await;
    assert!(mkdir_result.is_ok(), "SFTP mkdir failed: {:?}", mkdir_result.err());

    let list_result = manager.list_dir(&VfsListReq { mount_id: mount.id.clone(), path: "/tmp".to_string() }).await;
    assert!(list_result.is_ok(), "SFTP list /tmp failed: {:?}", list_result.err());
    let entries = list_result.unwrap();
    let short_name = dir_name.trim_start_matches('/').split('/').last().unwrap_or("");
    assert!(
        entries.iter().any(|e| e.name == short_name),
        "Created directory not found in listing"
    );
}

// ─── S3 (MinIO) ───────────────────────────────────────────────────────────

#[tokio::test]
#[ignore = "requires MinIO / S3 server"]
async fn test_s3_test_connection() {
    let manager = VfsManager::new();
    let endpoint = s3_endpoint();
    let req = CreateVfsMountReq {
        name: "test-s3".to_string(),
        kind: VfsSourceKind::S3,
        root: format!(
            "s3://{}:{}@{}",
            s3_access_key(),
            s3_secret_key(),
            endpoint.trim_start_matches("http://").trim_start_matches("https://")
        ),
        connection_id: None,
        group: None,
    };
    let result = manager.test_connection(&req).await;
    assert!(result.is_ok(), "S3 test_connection failed: {:?}", result.err());
}

#[tokio::test]
#[ignore = "requires MinIO / S3 server"]
async fn test_s3_list_root() {
    let manager = VfsManager::new();
    let endpoint = s3_endpoint();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "test-s3".to_string(),
            kind: VfsSourceKind::S3,
            root: format!(
                "s3://{}:{}@{}",
                s3_access_key(),
                s3_secret_key(),
                endpoint.trim_start_matches("http://").trim_start_matches("https://")
            ),
            connection_id: None,
            group: None,
        })
        .await;

    let result = manager.list_dir(&VfsListReq { mount_id: mount.id.clone(), path: "/".to_string() }).await;
    assert!(result.is_ok(), "S3 list_dir failed: {:?}", result.err());
}

// ─── SMB ──────────────────────────────────────────────────────────────────

#[tokio::test]
#[ignore = "requires SMB server"]
async fn test_smb_test_connection() {
    let manager = VfsManager::new();
    let req = CreateVfsMountReq {
        name: "test-smb".to_string(),
        kind: VfsSourceKind::Smb,
        root: format!(
            "smb://{}:{}@{}/{}",
            smb_user(),
            smb_pass(),
            smb_host(),
            smb_share()
        ),
        connection_id: None,
        group: None,
    };
    let result = manager.test_connection(&req).await;
    assert!(result.is_ok(), "SMB test_connection failed: {:?}", result.err());
}

#[tokio::test]
#[ignore = "requires SMB server"]
async fn test_smb_list_root() {
    let manager = VfsManager::new();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "test-smb".to_string(),
            kind: VfsSourceKind::Smb,
            root: format!(
                "smb://{}:{}@{}/{}",
                smb_user(),
                smb_pass(),
                smb_host(),
                smb_share()
            ),
            connection_id: None,
            group: None,
        })
        .await;

    let result = manager.list_dir(&VfsListReq { mount_id: mount.id.clone(), path: "/".to_string() }).await;
    assert!(result.is_ok(), "SMB list_dir failed: {:?}", result.err());
}

// ─── FTP ──────────────────────────────────────────────────────────────────

#[tokio::test]
#[ignore = "requires FTP server"]
async fn test_ftp_test_connection() {
    let manager = VfsManager::new();
    let req = CreateVfsMountReq {
        name: "test-ftp".to_string(),
        kind: VfsSourceKind::Ftp,
        root: format!("ftp://{}:{}@{}", ftp_user(), ftp_pass(), ftp_host()),
        connection_id: None,
        group: None,
    };
    let result = manager.test_connection(&req).await;
    assert!(result.is_ok(), "FTP test_connection failed: {:?}", result.err());
}

#[tokio::test]
#[ignore = "requires FTP server"]
async fn test_ftp_list_root() {
    let manager = VfsManager::new();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "test-ftp".to_string(),
            kind: VfsSourceKind::Ftp,
            root: format!("ftp://{}:{}@{}", ftp_user(), ftp_pass(), ftp_host()),
            connection_id: None,
            group: None,
        })
        .await;

    let result = manager.list_dir(&VfsListReq { mount_id: mount.id.clone(), path: "/".to_string() }).await;
    assert!(result.is_ok(), "FTP list_dir failed: {:?}", result.err());
}

// ─── Unit test: URL parsing ────────────────────────────────────────────────

#[tokio::test]
async fn test_create_and_get_mount() {
    let manager = VfsManager::new();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "local-test".to_string(),
            kind: VfsSourceKind::Local,
            root: "/tmp".to_string(),
            connection_id: None,
            group: None,
        })
        .await;

    assert_eq!(mount.name, "local-test");
    assert_eq!(mount.root, "/tmp");

    let fetched = manager.get_mount(&mount.id).await;
    assert!(fetched.is_some());
    assert_eq!(fetched.unwrap().id, mount.id);
}

#[tokio::test]
async fn test_update_mount() {
    let manager = VfsManager::new();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "original".to_string(),
            kind: VfsSourceKind::Local,
            root: "/tmp".to_string(),
            connection_id: None,
            group: None,
        })
        .await;

    let updated = manager
        .update_mount(
            &mount.id,
            CreateVfsMountReq {
                name: "updated".to_string(),
                kind: VfsSourceKind::Local,
                root: "/var/tmp".to_string(),
                connection_id: None,
                group: None,
            },
        )
        .await;

    assert!(updated.is_some());
    let u = updated.unwrap();
    assert_eq!(u.name, "updated");
    assert_eq!(u.root, "/var/tmp");
    assert_eq!(u.id, mount.id);
}

#[tokio::test]
async fn test_delete_mount() {
    let manager = VfsManager::new();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "to-delete".to_string(),
            kind: VfsSourceKind::Local,
            root: "/tmp".to_string(),
            connection_id: None,
            group: None,
        })
        .await;

    manager.delete_mount(&mount.id).await;
    let fetched = manager.get_mount(&mount.id).await;
    assert!(fetched.is_none());
}

// ─── WebDAV Unit Tests ────────────────────────────────────────────────────────

#[tokio::test]
async fn test_webdav_config_parse() {
    use crate::webdav::WebDavConfig;
    let cfg = WebDavConfig::parse("webdav://user:pass@example.com/dav").unwrap();
    assert_eq!(cfg.base_url, "http://example.com/dav/");
    assert_eq!(cfg.username.as_deref(), Some("user"));
}

#[tokio::test]
async fn test_webdav_config_parse_https() {
    use crate::webdav::WebDavConfig;
    let cfg = WebDavConfig::parse("webdavs://example.com:443/dav/").unwrap();
    assert_eq!(cfg.base_url, "https://example.com:443/dav/");
    assert!(cfg.username.is_none());
}

#[tokio::test]
async fn test_validate_mount_name() {
    use crate::types::validate_mount_name;
    assert!(validate_mount_name("My Documents").is_none(), "valid name");
    assert!(validate_mount_name("").is_some(), "empty should fail");
    assert!(validate_mount_name("a/b").is_some(), "slash should fail");
    assert!(validate_mount_name("a\\b").is_some(), "backslash should fail");
    assert!(validate_mount_name(" leading").is_some(), "leading space should fail");
    assert!(validate_mount_name("trailing ").is_some(), "trailing space should fail");
    let long = "a".repeat(101);
    assert!(validate_mount_name(&long).is_some(), "too long should fail");
}

#[tokio::test]
async fn test_webdav_server_settings_default() {
    let manager = VfsManager::new();
    let settings = manager.webdav_server_settings().await;
    assert!(!settings.enabled);
    assert!(settings.exposed_mounts.is_empty());
}

#[tokio::test]
async fn test_webdav_server_settings_update() {
    use crate::types::WebDavServerSettings;
    let manager = VfsManager::new();
    manager
        .update_webdav_server_settings(WebDavServerSettings {
            enabled: true,
            username: "testuser".to_string(),
            password: "testpass".to_string(),
            exposed_mounts: vec!["mount-1".to_string()],
        })
        .await;
    let settings = manager.webdav_server_settings().await;
    assert!(settings.enabled);
    assert_eq!(settings.username, "testuser");
    assert_eq!(settings.exposed_mounts, vec!["mount-1"]);
}

// These tests require a real WebDAV server; run with `--ignored`
fn webdav_host() -> String {
    std::env::var("WEBDAV_URL")
        .unwrap_or_else(|_| "webdav://demo.sabre.io/".to_string())
}

#[tokio::test]
#[ignore = "requires public WebDAV server access"]
async fn test_webdav_list_root() {
    let manager = VfsManager::new();
    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "test-webdav".to_string(),
            kind: VfsSourceKind::WebDav,
            root: webdav_host(),
            connection_id: None,
            group: None,
        })
        .await;

    let result = manager
        .list_dir(&VfsListReq { mount_id: mount.id.clone(), path: "/".to_string() })
        .await;
    assert!(result.is_ok(), "WebDAV list_dir failed: {:?}", result.err());
}

#[tokio::test]
#[ignore = "requires public WebDAV server access"]
async fn test_webdav_test_connection() {
    let manager = VfsManager::new();
    let req = CreateVfsMountReq {
        name: "test-webdav-conn".to_string(),
        kind: VfsSourceKind::WebDav,
        root: webdav_host(),
        connection_id: None,
        group: None,
    };
    let result = manager.test_connection(&req).await;
    assert!(result.is_ok(), "WebDAV test_connection failed: {:?}", result.err());
}
