//! VFS integration tests.
//!
//! These tests require real server infrastructure and are marked `#[ignore]`
//! so they do not run in normal CI. Run them explicitly with:
//!
//!   cargo test -p ventoos-vfs -- --ignored --test-threads=1
//!
//! Required environment (edit constants below or set env vars):
//!   - SFTP: `root@<SFTP_HOST>:22` with password `SFTP_PASS`
//!   - S3 (MinIO): `http://<S3_ENDPOINT>` with `S3_ACCESS_KEY` / `S3_SECRET_KEY`
//!   - SMB: `smb://<SMB_HOST>` 或 `smb://<SMB_HOST>/<SMB_SHARE>`，user/pass `SMB_USER` / `SMB_PASS`
//!   - FTP: `ftp://<FTP_HOST>` user/pass `FTP_USER` / `FTP_PASS`

#![cfg(test)]

use crate::archive::{ArchiveFormat, ArchiveRequest, ExtractRequest};
use crate::manager::VfsManager;
use crate::types::{
    CreateVfsMountReq, VfsCopyReq, VfsDeleteReq, VfsListReq, VfsMkdirReq, VfsMoveReq, VfsReadReq,
    VfsSearchReq, VfsSourceKind, VfsWriteReq,
};

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
    std::env::var("SMB_SHARE").unwrap_or_else(|_| "share1".to_string())
}
fn smb_share_two() -> String {
    std::env::var("SMB_SHARE_2").unwrap_or_else(|_| "share2".to_string())
}
fn smb_user() -> String {
    std::env::var("SMB_USER").unwrap_or_else(|_| "testuser".to_string())
}
fn smb_pass() -> String {
    std::env::var("SMB_PASS").unwrap_or_else(|_| "123456".to_string())
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
            group: None,                local_mount: None,
            }
)
        .await;

    let result = manager
        .list_dir(&VfsListReq {
            mount_id: mount.id.clone(),
            path: "/".to_string(),
            show_hidden: false,
        })
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
        group: None,            local_mount: None,
        }
;
    let result = manager.test_connection(&req).await;
    assert!(
        result.is_ok(),
        "SFTP test_connection failed: {:?}",
        result.err()
    );
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
            group: None,                local_mount: None,
            }
)
        .await;

    let dir_name = format!("/tmp/vfs_test_{}", uuid::Uuid::new_v4());
    let mkdir_result = manager
        .mkdir(&VfsMkdirReq {
            mount_id: mount.id.clone(),
            path: dir_name.clone(),
        })
        .await;
    assert!(
        mkdir_result.is_ok(),
        "SFTP mkdir failed: {:?}",
        mkdir_result.err()
    );

    let list_result = manager
        .list_dir(&VfsListReq {
            mount_id: mount.id.clone(),
            path: "/tmp".to_string(),
            show_hidden: false,
        })
        .await;
    assert!(
        list_result.is_ok(),
        "SFTP list /tmp failed: {:?}",
        list_result.err()
    );
    let entries = list_result.unwrap();
    let short_name = dir_name
        .trim_start_matches('/')
        .split('/')
        .next_back()
        .unwrap_or("");
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
            endpoint
                .trim_start_matches("http://")
                .trim_start_matches("https://")
        ),
        connection_id: None,
        group: None,            local_mount: None,
        }
;
    let result = manager.test_connection(&req).await;
    assert!(
        result.is_ok(),
        "S3 test_connection failed: {:?}",
        result.err()
    );
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
                endpoint
                    .trim_start_matches("http://")
                    .trim_start_matches("https://")
            ),
            connection_id: None,
            group: None,                local_mount: None,
            }
)
        .await;

    let result = manager
        .list_dir(&VfsListReq {
            mount_id: mount.id.clone(),
            path: "/".to_string(),
            show_hidden: false,
        })
        .await;
    assert!(result.is_ok(), "S3 list_dir failed: {:?}", result.err());
}

// ─── SMB ──────────────────────────────────────────────────────────────────

fn smb_share_root_uri() -> String {
    format!(
        "smb://{}:{}@{}/{}",
        smb_user(),
        smb_pass(),
        smb_host(),
        smb_share()
    )
}

fn smb_server_root_uri() -> String {
    format!("smb://{}:{}@{}", smb_user(), smb_pass(), smb_host())
}

async fn create_smb_mount(manager: &VfsManager, name: &str, root: String) -> String {
    manager
        .create_mount(CreateVfsMountReq {
            name: name.to_string(),
            kind: VfsSourceKind::Smb,
            root,
            connection_id: None,
            group: None,                local_mount: None,
            }
)
        .await
        .id
}

async fn smb_list_names(manager: &VfsManager, mount_id: &str, path: &str) -> Vec<String> {
    manager
        .list_dir(&VfsListReq {
            mount_id: mount_id.to_string(),
            path: path.to_string(),
            show_hidden: false,
        })
        .await
        .unwrap_or_else(|e| panic!("SMB list_dir failed at {path}: {e}"))
        .into_iter()
        .map(|node| node.name)
        .collect()
}

async fn smb_make_tree(
    manager: &VfsManager,
    mount_id: &str,
    base_dir: &str,
) -> (String, String, String, String) {
    let dir_a = format!("{base_dir}/a");
    let dir_b = format!("{dir_a}/b");
    let dir_c = format!("{dir_b}/c");
    let file_path = format!("{dir_c}/hello.txt");

    for path in [base_dir, &dir_a, &dir_b, &dir_c] {
        manager
            .mkdir(&VfsMkdirReq {
                mount_id: mount_id.to_string(),
                path: path.to_string(),
            })
            .await
            .unwrap_or_else(|e| panic!("SMB mkdir failed at {path}: {e}"));
    }

    manager
        .write_file(&VfsWriteReq {
            mount_id: mount_id.to_string(),
            path: file_path.clone(),
            content: "hello from ventoos smb".to_string(),
        })
        .await
        .unwrap_or_else(|e| panic!("SMB write_file failed at {file_path}: {e}"));

    (dir_a, dir_b, dir_c, file_path)
}

async fn smb_cleanup_tree(manager: &VfsManager, mount_id: &str, paths: &[String]) {
    for path in paths {
        let _ = manager
            .delete(&VfsDeleteReq {
                mount_id: mount_id.to_string(),
                path: path.clone(),
            })
            .await;
    }
}

#[tokio::test]
#[ignore = "requires SMB server"]
async fn test_smb_test_connection() {
    let manager = VfsManager::new();
    let req = CreateVfsMountReq {
        name: "test-smb".to_string(),
        kind: VfsSourceKind::Smb,
        root: smb_share_root_uri(),
        connection_id: None,
        group: None,            local_mount: None,
        }
;
    let result = manager.test_connection(&req).await;
    assert!(
        result.is_ok(),
        "SMB test_connection failed: {:?}",
        result.err()
    );
}

#[tokio::test]
#[ignore = "requires SMB server"]
async fn test_smb_server_root_list() {
    let manager = VfsManager::new();
    let req = CreateVfsMountReq {
        name: "test-smb-root".to_string(),
        kind: VfsSourceKind::Smb,
        root: smb_server_root_uri(),
        connection_id: None,
        group: None,            local_mount: None,
        }
;
    let mount = manager.create_mount(req).await;

    let result = manager
        .list_dir(&VfsListReq {
            mount_id: mount.id.clone(),
            path: "/".to_string(),
            show_hidden: false,
        })
        .await;
    assert!(
        result.is_ok(),
        "SMB server-root list_dir failed: {:?}",
        result.err()
    );
    let entries = result.unwrap();
    assert!(
        !entries.is_empty(),
        "Expected SMB server-root listing to return at least one share"
    );
    assert!(
        entries
            .iter()
            .any(|entry| entry.name.eq_ignore_ascii_case(&smb_share())),
        "Expected SMB server-root listing to include primary share"
    );
}

#[tokio::test]
#[ignore = "requires SMB server"]
async fn test_smb_server_root_can_enter_share_and_list_nested_tree() {
    let manager = VfsManager::new();

    let share_mount_id = create_smb_mount(&manager, "test-smb-share", smb_share_root_uri()).await;
    let server_mount_id =
        create_smb_mount(&manager, "test-smb-server-root", smb_server_root_uri()).await;

    let base_dir = format!("/vfs_smb_{}", uuid::Uuid::new_v4().simple());
    let (dir_a, dir_b, dir_c, file_path) =
        smb_make_tree(&manager, &share_mount_id, &base_dir).await;

    let server_root = smb_list_names(&manager, &server_mount_id, "/").await;
    assert!(
        server_root
            .iter()
            .any(|name| name.eq_ignore_ascii_case(&smb_share())),
        "SMB server root should list primary share"
    );
    assert!(
        server_root
            .iter()
            .any(|name| name.eq_ignore_ascii_case(&smb_share_two())),
        "SMB server root should list secondary share"
    );

    let share_root = smb_list_names(&manager, &server_mount_id, &format!("/{}", smb_share())).await;
    assert!(
        share_root
            .iter()
            .any(|name| name == base_dir.trim_start_matches('/')),
        "SMB server-root share listing should expose created base directory"
    );

    let level_a = smb_list_names(
        &manager,
        &server_mount_id,
        &format!("/{}/{}", smb_share(), base_dir.trim_start_matches('/')),
    )
    .await;
    assert!(
        level_a.iter().any(|name| name == "a"),
        "Expected level-a directory"
    );

    let level_c = smb_list_names(
        &manager,
        &server_mount_id,
        &format!("/{}/{}/a/b", smb_share(), base_dir.trim_start_matches('/')),
    )
    .await;
    assert!(
        level_c.iter().any(|name| name == "c"),
        "Expected level-c directory"
    );

    let file_content = manager
        .read_file(&VfsReadReq {
            mount_id: share_mount_id.clone(),
            path: file_path.clone(),
            max_bytes: None,
        })
        .await
        .unwrap();
    assert_eq!(file_content.content, "hello from ventoos smb");

    let file_node = manager.stat(&share_mount_id, &file_path).await.unwrap();
    assert!(!file_node.is_dir);
    assert_eq!(file_node.name, "hello.txt");

    smb_cleanup_tree(
        &manager,
        &share_mount_id,
        &[
            file_path.clone(),
            dir_c.clone(),
            dir_b.clone(),
            dir_a.clone(),
            base_dir.clone(),
        ],
    )
    .await;
}

#[tokio::test]
#[ignore = "requires SMB server"]
async fn test_smb_share_root_multilevel_crud() {
    let manager = VfsManager::new();
    let mount_id = create_smb_mount(&manager, "test-smb-share-root", smb_share_root_uri()).await;

    let base_dir = format!("/vfs_smb_{}", uuid::Uuid::new_v4().simple());
    let (dir_a, dir_b, dir_c, file_path) = smb_make_tree(&manager, &mount_id, &base_dir).await;

    let root_names = smb_list_names(&manager, &mount_id, "/").await;
    assert!(
        root_names
            .iter()
            .any(|name| name == base_dir.trim_start_matches('/')),
        "Expected share root listing to include created base directory"
    );

    let a_names = smb_list_names(&manager, &mount_id, &base_dir).await;
    assert!(a_names.iter().any(|name| name == "a"));

    let b_names = smb_list_names(&manager, &mount_id, &dir_a).await;
    assert!(b_names.iter().any(|name| name == "b"));

    let c_names = smb_list_names(&manager, &mount_id, &dir_b).await;
    assert!(c_names.iter().any(|name| name == "c"));

    let read_back = manager
        .read_file(&VfsReadReq {
            mount_id: mount_id.clone(),
            path: file_path.clone(),
            max_bytes: None,
        })
        .await
        .unwrap();
    assert_eq!(read_back.content, "hello from ventoos smb");

    let search_hits = manager
        .search(&VfsSearchReq {
            mount_id: mount_id.clone(),
            path: dir_c.clone(),
            query: "hello".to_string(),
            max_results: Some(10),
        })
        .await
        .unwrap();
    assert!(
        search_hits
            .iter()
            .any(|node| node.path.ends_with("hello.txt")),
        "Expected search to find created file"
    );

    manager
        .copy_file(&VfsCopyReq {
            mount_id: mount_id.clone(),
            src: file_path.clone(),
            dest: format!("{dir_c}/hello-copy.txt"),
        })
        .await
        .unwrap();

    manager
        .move_file(&VfsMoveReq {
            mount_id: mount_id.clone(),
            src: format!("{dir_c}/hello-copy.txt"),
            dest: format!("{dir_b}/hello-moved.txt"),
        })
        .await
        .unwrap();

    let moved_names = smb_list_names(&manager, &mount_id, &dir_b).await;
    assert!(
        moved_names.iter().any(|name| name == "hello-moved.txt"),
        "Expected moved file to appear in destination directory"
    );

    let moved_content = manager
        .read_file(&VfsReadReq {
            mount_id: mount_id.clone(),
            path: format!("{dir_b}/hello-moved.txt"),
            max_bytes: None,
        })
        .await
        .unwrap();
    assert_eq!(moved_content.content, "hello from ventoos smb");

    manager
        .delete(&VfsDeleteReq {
            mount_id: mount_id.clone(),
            path: format!("{dir_b}/hello-moved.txt"),
        })
        .await
        .unwrap();
    manager
        .delete(&VfsDeleteReq {
            mount_id: mount_id.clone(),
            path: file_path.clone(),
        })
        .await
        .unwrap();

    smb_cleanup_tree(&manager, &mount_id, &[dir_c, dir_b, dir_a, base_dir]).await;
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
        group: None,            local_mount: None,
        }
;
    let result = manager.test_connection(&req).await;
    assert!(
        result.is_ok(),
        "FTP test_connection failed: {:?}",
        result.err()
    );
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
            group: None,                local_mount: None,
            }
)
        .await;

    let result = manager
        .list_dir(&VfsListReq {
            mount_id: mount.id.clone(),
            path: "/".to_string(),
            show_hidden: false,
        })
        .await;
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
            group: None,                local_mount: None,
            }
)
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
            group: None,                local_mount: None,
            }
)
        .await;

    let updated = manager
        .update_mount(
            &mount.id,
            CreateVfsMountReq {
                name: "updated".to_string(),
                kind: VfsSourceKind::Local,
                root: "/var/tmp".to_string(),
                connection_id: None,
                group: None,                local_mount: None,
            }
,
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
            group: None,                local_mount: None,
            }
)
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
    assert!(
        validate_mount_name("a\\b").is_some(),
        "backslash should fail"
    );
    assert!(
        validate_mount_name(" leading").is_some(),
        "leading space should fail"
    );
    assert!(
        validate_mount_name("trailing ").is_some(),
        "trailing space should fail"
    );
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
    std::env::var("WEBDAV_URL").unwrap_or_else(|_| "webdav://demo.sabre.io/".to_string())
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
            group: None,                local_mount: None,
            }
)
        .await;

    let result = manager
        .list_dir(&VfsListReq {
            mount_id: mount.id.clone(),
            path: "/".to_string(),
            show_hidden: false,
        })
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
        group: None,            local_mount: None,
        }
;
    let result = manager.test_connection(&req).await;
    assert!(
        result.is_ok(),
        "WebDAV test_connection failed: {:?}",
        result.err()
    );
}

#[tokio::test]
async fn test_local_archive_7z_roundtrip() {
    let manager = VfsManager::new();
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();

    std::fs::write(root.join("root.txt"), "root file").unwrap();
    std::fs::create_dir_all(root.join("dir1/dir2")).unwrap();
    std::fs::write(root.join("dir1/nested.txt"), "nested file").unwrap();
    std::fs::write(root.join("dir1/dir2/deeper.txt"), "deeper file").unwrap();

    let mount = manager
        .create_mount(CreateVfsMountReq {
            name: "local-archive-7z".to_string(),
            kind: VfsSourceKind::Local,
            root: root.to_string_lossy().to_string(),
            connection_id: None,
            group: None,                local_mount: None,
            }
)
        .await;

    manager
        .create_archive(
            &mount.id,
            &ArchiveRequest {
                paths: vec!["root.txt".to_string(), "dir1".to_string()],
                dest: "bundle.7z".to_string(),
                format: ArchiveFormat::SevenZ,
                password: None,
            },
        )
        .await
        .unwrap();

    let archive_path = root.join("bundle.7z");
    assert!(archive_path.exists(), "7z archive should be created");

    let listed = manager
        .list_archive_contents(&mount.id, "/bundle.7z", None)
        .await
        .unwrap();
    assert!(
        listed.entries.iter().any(|entry| entry.path == "root.txt"),
        "7z listing should include root file"
    );
    assert!(
        listed
            .entries
            .iter()
            .any(|entry| entry.path == "dir1/dir2/deeper.txt"),
        "7z listing should include nested file"
    );

    manager
        .extract_archive(
            &mount.id,
            &ExtractRequest {
                archive_path: "bundle.7z".to_string(),
                dest_dir: "unzipped".to_string(),
                password: None,
            },
        )
        .await
        .unwrap();

    assert_eq!(
        std::fs::read_to_string(root.join("unzipped/root.txt")).unwrap(),
        "root file"
    );
    assert_eq!(
        std::fs::read_to_string(root.join("unzipped/dir1/nested.txt")).unwrap(),
        "nested file"
    );
    assert_eq!(
        std::fs::read_to_string(root.join("unzipped/dir1/dir2/deeper.txt")).unwrap(),
        "deeper file"
    );
}
