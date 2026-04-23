//! Comprehensive tests for the ventoos-vfs crate.

use std::sync::Arc;
use tempfile::tempdir;
use ventoos_vfs::*;

// ─── Helper ──────────────────────────────────────────────────────────────────

/// Create a VfsManager with a Local mount pointing at `root`, returning (manager, mount_id).
async fn manager_with_local_mount(root: &str) -> (VfsManager, String) {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "test-local".into(),
            kind: VfsSourceKind::Local,
            root: root.into(),
            connection_id: None,
            group: None,
                local_mount: None,
            }
)
        .await;
    (mgr, mount.id)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn mount_create_local() {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "local-home".into(),
            kind: VfsSourceKind::Local,
            root: "/tmp".into(),
            connection_id: None,
            group: None,
                local_mount: None,
            }
)
        .await;
    assert_eq!(mount.name, "local-home");
    assert!(matches!(mount.kind, VfsSourceKind::Local));
    assert_eq!(mount.root, "/tmp");
    assert!(!mount.id.is_empty());
}

#[tokio::test]
async fn mount_create_sftp() {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "remote-server".into(),
            kind: VfsSourceKind::Sftp,
            root: "/home/user".into(),
            connection_id: Some("ssh-conn-1".into()),
            group: None,
                local_mount: None,
            }
)
        .await;
    assert_eq!(mount.name, "remote-server");
    assert!(matches!(mount.kind, VfsSourceKind::Sftp));
    assert_eq!(mount.connection_id, Some("ssh-conn-1".into()));
}

#[tokio::test]
async fn mount_create_s3() {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "bucket-data".into(),
            kind: VfsSourceKind::S3,
            root: "s3://my-bucket".into(),
            connection_id: None,
            group: None,
                local_mount: None,
            }
)
        .await;
    assert_eq!(mount.name, "bucket-data");
    assert!(matches!(mount.kind, VfsSourceKind::S3));
}

#[tokio::test]
async fn mount_create_with_all_optional_fields() {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "full-mount".into(),
            kind: VfsSourceKind::Ftp,
            root: "ftp://server/data".into(),
            connection_id: Some("ftp-conn-42".into()),
            group: Some("infrastructure".into()),
            local_mount: None,
        })
        .await;
    assert_eq!(mount.connection_id, Some("ftp-conn-42".into()));
    assert_eq!(mount.group, Some("infrastructure".into()));
}

#[tokio::test]
async fn mount_get_existing() {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "findme".into(),
            kind: VfsSourceKind::Local,
            root: "/tmp".into(),
            connection_id: None,
            group: None,
                local_mount: None,
            }
)
        .await;
    let found = mgr.get_mount(&mount.id).await;
    assert!(found.is_some());
    assert_eq!(found.unwrap().name, "findme");
}

#[tokio::test]
async fn mount_get_nonexisting_returns_none() {
    let mgr = VfsManager::new();
    assert!(mgr.get_mount("does-not-exist").await.is_none());
}

#[tokio::test]
async fn mount_list() {
    let mgr = VfsManager::new();
    mgr.create_mount(CreateVfsMountReq {
        name: "alpha".into(),
        kind: VfsSourceKind::Local,
        root: "/tmp".into(),
        connection_id: None,
        group: None,
            local_mount: None,
        }
)
    .await;
    mgr.create_mount(CreateVfsMountReq {
        name: "beta".into(),
        kind: VfsSourceKind::Local,
        root: "/tmp".into(),
        connection_id: None,
        group: None,
            local_mount: None,
        }
)
    .await;
    let list = mgr.list_mounts().await;
    assert_eq!(list.len(), 2);
    // list_mounts sorts alphabetically
    assert_eq!(list[0].name, "alpha");
    assert_eq!(list[1].name, "beta");
}

#[tokio::test]
async fn mount_delete() {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "deleteme".into(),
            kind: VfsSourceKind::Local,
            root: "/tmp".into(),
            connection_id: None,
            group: None,
                local_mount: None,
            }
)
        .await;
    assert!(mgr.delete_mount(&mount.id).await);
    assert!(mgr.get_mount(&mount.id).await.is_none());
}

#[tokio::test]
async fn mount_delete_nonexisting_returns_false() {
    let mgr = VfsManager::new();
    assert!(!mgr.delete_mount("ghost-id").await);
}

#[tokio::test]
async fn mount_update_name() {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "old-name".into(),
            kind: VfsSourceKind::Local,
            root: "/tmp".into(),
            connection_id: None,
            group: None,
                local_mount: None,
            }
)
        .await;
    let updated = mgr
        .update_mount(
            &mount.id,
            CreateVfsMountReq {
                name: "new-name".into(),
                kind: VfsSourceKind::Local,
                root: "/tmp".into(),
                connection_id: None,
                group: None,
                    local_mount: None,
                }
,
        )
        .await;
    assert!(updated.is_some());
    assert_eq!(updated.unwrap().name, "new-name");
}

#[tokio::test]
async fn mount_update_kind() {
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "switch-kind".into(),
            kind: VfsSourceKind::Local,
            root: "/tmp".into(),
            connection_id: None,
            group: None,
                local_mount: None,
            }
)
        .await;
    let updated = mgr
        .update_mount(
            &mount.id,
            CreateVfsMountReq {
                name: "switch-kind".into(),
                kind: VfsSourceKind::WebDav,
                root: "https://webdav.example.com".into(),
                connection_id: None,
                group: None,
                    local_mount: None,
                }
,
        )
        .await;
    assert!(updated.is_some());
    assert!(matches!(updated.unwrap().kind, VfsSourceKind::WebDav));
}

#[tokio::test]
async fn mount_update_nonexisting_returns_none() {
    let mgr = VfsManager::new();
    let result = mgr
        .update_mount(
            "no-such-id",
            CreateVfsMountReq {
                name: "irrelevant".into(),
                kind: VfsSourceKind::Local,
                root: "/tmp".into(),
                connection_id: None,
                group: None,
                    local_mount: None,
                }
,
        )
        .await;
    assert!(result.is_none());
}

#[tokio::test]
async fn vfs_manager_default_trait() {
    // VfsManager::new() is the canonical constructor — verify it works.
    let mgr = VfsManager::new();
    assert!(mgr.list_mounts().await.is_empty());
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL FS OPERATIONS (using tempdir)
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn local_list_directory_contents() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("file_a.txt"), "a").unwrap();
    std::fs::write(dir.path().join("file_b.txt"), "b").unwrap();
    std::fs::create_dir(dir.path().join("subdir")).unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;
    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid,
            path: "/".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    assert_eq!(nodes.len(), 3);
    // Directories come first
    assert!(nodes[0].is_dir);
    assert_eq!(nodes[0].name, "subdir");
}

#[tokio::test]
async fn local_list_with_hidden_files_shown() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join(".hidden"), "secret").unwrap();
    std::fs::write(dir.path().join("visible.txt"), "hi").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;
    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid,
            path: "/".into(),
            show_hidden: true,
        })
        .await
        .unwrap();

    let names: Vec<_> = nodes.iter().map(|n| n.name.as_str()).collect();
    assert!(names.contains(&".hidden"));
    assert!(names.contains(&"visible.txt"));
}

#[tokio::test]
async fn local_list_with_hidden_files_hidden() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join(".hidden"), "secret").unwrap();
    std::fs::write(dir.path().join("visible.txt"), "hi").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;
    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid,
            path: "/".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    let names: Vec<_> = nodes.iter().map(|n| n.name.as_str()).collect();
    assert!(!names.contains(&".hidden"));
    assert!(names.contains(&"visible.txt"));
}

#[tokio::test]
async fn local_read_text_file() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("hello.txt"), "Hello World").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;
    let content = mgr
        .read_file(&VfsReadReq {
            mount_id: mid,
            path: "/hello.txt".into(),
            max_bytes: None,
        })
        .await
        .unwrap();

    assert_eq!(content.content, "Hello World");
    assert!(!content.is_binary);
    assert!(!content.truncated);
}

#[tokio::test]
async fn local_read_file_with_max_bytes() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("long.txt"), "abcdefghijklmnopqrstuvwxyz").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;
    let content = mgr
        .read_file(&VfsReadReq {
            mount_id: mid,
            path: "/long.txt".into(),
            max_bytes: Some(5),
        })
        .await
        .unwrap();

    assert_eq!(content.content.len(), 5);
    assert!(content.truncated);
}

#[tokio::test]
async fn local_write_and_read_back() {
    let dir = tempdir().unwrap();
    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    mgr.write_file(&VfsWriteReq {
        mount_id: mid.clone(),
        path: "/new_file.txt".into(),
        content: "fresh content".into(),
    })
    .await
    .unwrap();

    let read = mgr
        .read_file(&VfsReadReq {
            mount_id: mid,
            path: "/new_file.txt".into(),
            max_bytes: None,
        })
        .await
        .unwrap();

    assert_eq!(read.content, "fresh content");
}

#[tokio::test]
async fn local_create_directory() {
    let dir = tempdir().unwrap();
    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    mgr.mkdir(&VfsMkdirReq {
        mount_id: mid.clone(),
        path: "/new_dir".into(),
    })
    .await
    .unwrap();

    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid,
            path: "/".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    assert!(nodes.iter().any(|n| n.name == "new_dir" && n.is_dir));
}

#[tokio::test]
async fn local_delete_file() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("doomed.txt"), "bye").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    mgr.delete(&VfsDeleteReq {
        mount_id: mid.clone(),
        path: "/doomed.txt".into(),
    })
    .await
    .unwrap();

    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid,
            path: "/".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    assert!(!nodes.iter().any(|n| n.name == "doomed.txt"));
}

#[tokio::test]
async fn local_delete_directory_recursive() {
    let dir = tempdir().unwrap();
    let subdir = dir.path().join("folder");
    std::fs::create_dir(&subdir).unwrap();
    std::fs::write(subdir.join("inner.txt"), "nested").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    mgr.delete(&VfsDeleteReq {
        mount_id: mid.clone(),
        path: "/folder".into(),
    })
    .await
    .unwrap();

    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid,
            path: "/".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    assert!(!nodes.iter().any(|n| n.name == "folder"));
}

#[tokio::test]
async fn local_move_file() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("source.txt"), "moving").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    mgr.move_file(&VfsMoveReq {
        mount_id: mid.clone(),
        src: "/source.txt".into(),
        dest: "/destination.txt".into(),
    })
    .await
    .unwrap();

    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid.clone(),
            path: "/".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    let names: Vec<_> = nodes.iter().map(|n| n.name.as_str()).collect();
    assert!(!names.contains(&"source.txt"));
    assert!(names.contains(&"destination.txt"));
}

#[tokio::test]
async fn local_copy_file() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("original.txt"), "copy me").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    mgr.copy_file(&VfsCopyReq {
        mount_id: mid.clone(),
        src: "/original.txt".into(),
        dest: "/duplicate.txt".into(),
    })
    .await
    .unwrap();

    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid.clone(),
            path: "/".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    let names: Vec<_> = nodes.iter().map(|n| n.name.as_str()).collect();
    assert!(names.contains(&"original.txt"));
    assert!(names.contains(&"duplicate.txt"));

    // Verify contents match
    let copy = mgr
        .read_file(&VfsReadReq {
            mount_id: mid,
            path: "/duplicate.txt".into(),
            max_bytes: None,
        })
        .await
        .unwrap();
    assert_eq!(copy.content, "copy me");
}

#[tokio::test]
async fn local_search_files_by_name() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("readme.md"), "").unwrap();
    std::fs::write(dir.path().join("readme.txt"), "").unwrap();
    std::fs::write(dir.path().join("other.txt"), "").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    let results = mgr
        .search(&VfsSearchReq {
            mount_id: mid,
            path: "/".into(),
            query: "readme".into(),
            max_results: None,
        })
        .await
        .unwrap();

    assert_eq!(results.len(), 2);
    assert!(results.iter().all(|n| n.name.contains("readme")));
}

#[tokio::test]
async fn local_search_with_max_results() {
    let dir = tempdir().unwrap();
    for i in 0..10 {
        std::fs::write(dir.path().join(format!("item_{i}.txt")), "").unwrap();
    }

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    let results = mgr
        .search(&VfsSearchReq {
            mount_id: mid,
            path: "/".into(),
            query: "item".into(),
            max_results: Some(3),
        })
        .await
        .unwrap();

    assert!(results.len() <= 3);
}

#[tokio::test]
async fn local_read_binary_file_detection() {
    let dir = tempdir().unwrap();
    // Write bytes that are not valid UTF-8 text
    std::fs::write(dir.path().join("data.bin"), &[0x00, 0xFF, 0xFE, 0x89, 0x50]).unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    let content = mgr
        .read_file(&VfsReadReq {
            mount_id: mid,
            path: "/data.bin".into(),
            max_bytes: None,
        })
        .await
        .unwrap();

    assert!(content.is_binary);
}

#[tokio::test]
async fn local_read_large_file_with_truncation() {
    let dir = tempdir().unwrap();
    let big_content = "x".repeat(2_000_000);
    std::fs::write(dir.path().join("big.txt"), &big_content).unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    let content = mgr
        .read_file(&VfsReadReq {
            mount_id: mid,
            path: "/big.txt".into(),
            max_bytes: Some(1024),
        })
        .await
        .unwrap();

    assert!(content.truncated);
    assert!(content.content.len() <= 1024);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VFS TYPES — serialization & construction
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn vfs_source_kind_all_variants_serialization() {
    let variants = [
        (VfsSourceKind::Local, "\"local\""),
        (VfsSourceKind::Sftp, "\"sftp\""),
        (VfsSourceKind::Ftp, "\"ftp\""),
        (VfsSourceKind::Smb, "\"smb\""),
        (VfsSourceKind::S3, "\"s3\""),
        (VfsSourceKind::WebDav, "\"webdav\""),
    ];
    for (kind, expected_json) in &variants {
        let json = serde_json::to_string(kind).unwrap();
        assert_eq!(&json, expected_json, "Failed for {:?}", kind);
        let deser: VfsSourceKind = serde_json::from_str(&json).unwrap();
        assert_eq!(&deser, kind);
    }
}

#[test]
fn vfs_node_with_all_fields() {
    let node = VfsNode {
        name: "report.csv".into(),
        path: "/data/report.csv".into(),
        is_dir: false,
        size: Some(4096),
        modified: Some("2025-01-15T12:00:00Z".into()),
        permissions: Some("rw-r--r--".into()),
    };
    assert_eq!(node.name, "report.csv");
    assert_eq!(node.size, Some(4096));
    assert!(node.permissions.is_some());

    // roundtrip JSON
    let json = serde_json::to_string(&node).unwrap();
    let back: VfsNode = serde_json::from_str(&json).unwrap();
    assert_eq!(back.name, node.name);
    assert_eq!(back.path, node.path);
}

#[test]
fn vfs_node_directory_vs_file() {
    let dir_node = VfsNode {
        name: "src".into(),
        path: "/src".into(),
        is_dir: true,
        size: None,
        modified: None,
        permissions: None,
    };
    let file_node = VfsNode {
        name: "main.rs".into(),
        path: "/src/main.rs".into(),
        is_dir: false,
        size: Some(1024),
        modified: None,
        permissions: None,
    };
    assert!(dir_node.is_dir);
    assert!(!file_node.is_dir);
    assert!(dir_node.size.is_none());
    assert!(file_node.size.is_some());
}

#[test]
fn vfs_file_content_binary_detection() {
    let content = VfsFileContent {
        path: "/img.png".into(),
        size: 2048,
        content: String::new(),
        is_binary: true,
        truncated: false,
    };
    assert!(content.is_binary);
}

#[test]
fn vfs_file_content_truncated_flag() {
    let content = VfsFileContent {
        path: "/big.log".into(),
        size: 100_000,
        content: "partial...".into(),
        is_binary: false,
        truncated: true,
    };
    assert!(content.truncated);
    assert!(content.content.len() < content.size as usize);
}

#[test]
fn vfs_list_req_serialization() {
    let req = VfsListReq {
        mount_id: "m1".into(),
        path: "/var/log".into(),
        show_hidden: true,
    };
    let json = serde_json::to_string(&req).unwrap();
    let back: VfsListReq = serde_json::from_str(&json).unwrap();
    assert_eq!(back.mount_id, "m1");
    assert!(back.show_hidden);
}

#[test]
fn vfs_read_req_with_max_bytes() {
    let req = VfsReadReq {
        mount_id: "m2".into(),
        path: "/data/file.csv".into(),
        max_bytes: Some(4096),
    };
    let json = serde_json::to_string(&req).unwrap();
    let back: VfsReadReq = serde_json::from_str(&json).unwrap();
    assert_eq!(back.max_bytes, Some(4096));
}

#[test]
fn vfs_move_req_source_dest() {
    let req = VfsMoveReq {
        mount_id: "m3".into(),
        src: "/old/path.txt".into(),
        dest: "/new/path.txt".into(),
    };
    let json = serde_json::to_string(&req).unwrap();
    assert!(json.contains("old/path.txt"));
    assert!(json.contains("new/path.txt"));
}

#[test]
fn vfs_write_req_with_content() {
    let req = VfsWriteReq {
        mount_id: "m4".into(),
        path: "/config.toml".into(),
        content: "[section]\nkey = \"value\"".into(),
    };
    let json = serde_json::to_string(&req).unwrap();
    let back: VfsWriteReq = serde_json::from_str(&json).unwrap();
    assert_eq!(back.content, req.content);
}

#[test]
fn vfs_search_req_with_max_results() {
    let req = VfsSearchReq {
        mount_id: "m5".into(),
        path: "/".into(),
        query: "*.rs".into(),
        max_results: Some(50),
    };
    let json = serde_json::to_string(&req).unwrap();
    let back: VfsSearchReq = serde_json::from_str(&json).unwrap();
    assert_eq!(back.max_results, Some(50));
    assert_eq!(back.query, "*.rs");
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBDAV SERVER SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn webdav_default_settings() {
    let mgr = VfsManager::new();
    let settings = mgr.webdav_server_settings().await;
    assert!(!settings.enabled);
    assert_eq!(settings.username, "webdav");
    assert!(settings.password.is_empty());
    assert!(settings.exposed_mounts.is_empty());
}

#[tokio::test]
async fn webdav_update_settings() {
    let mgr = VfsManager::new();
    mgr.update_webdav_server_settings(WebDavServerSettings {
        enabled: true,
        username: "admin".into(),
        password: "s3cret".into(),
        exposed_mounts: vec!["mount-1".into()],
    })
    .await;
    let settings = mgr.webdav_server_settings().await;
    assert!(settings.enabled);
    assert_eq!(settings.username, "admin");
    assert_eq!(settings.password, "s3cret");
}

#[tokio::test]
async fn webdav_settings_with_exposed_mounts() {
    let mgr = VfsManager::new();
    let ids = vec!["m-a".to_string(), "m-b".to_string(), "m-c".to_string()];
    mgr.update_webdav_server_settings(WebDavServerSettings {
        enabled: true,
        username: "user".into(),
        password: "pw".into(),
        exposed_mounts: ids.clone(),
    })
    .await;
    let settings = mgr.webdav_server_settings().await;
    assert_eq!(settings.exposed_mounts.len(), 3);
    assert_eq!(settings.exposed_mounts, ids);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn validate_mount_name_valid() {
    assert!(validate_mount_name("my-mount").is_none());
    assert!(validate_mount_name("Mount 123").is_none());
    assert!(validate_mount_name("中文名称").is_none());
}

#[test]
fn validate_mount_name_empty_returns_error() {
    let err = validate_mount_name("").unwrap();
    assert!(
        err.contains("不能为空"),
        "Expected empty-name error, got: {err}"
    );
}

#[test]
fn validate_mount_name_special_characters() {
    // Each forbidden char should produce an error
    for ch in ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'] {
        let name = format!("bad{ch}name");
        let err = validate_mount_name(&name);
        assert!(err.is_some(), "Expected error for char '{ch}'");
        assert!(
            err.as_ref().unwrap().contains(&ch.to_string()),
            "Error for '{ch}' should mention the char"
        );
    }
}

#[test]
fn validate_mount_name_too_long() {
    let long_name = "a".repeat(101);
    let err = validate_mount_name(&long_name);
    assert!(err.is_some());
    assert!(err.unwrap().contains("100"));
}

#[test]
fn validate_mount_name_leading_trailing_spaces() {
    assert!(validate_mount_name(" leading").is_some());
    assert!(validate_mount_name("trailing ").is_some());
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHMOD — parse_mode
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn chmod_parse_mode_755() {
    let mode = ventoos_vfs::chmod::parse_mode("755").unwrap();
    assert_eq!(mode, 0o755);
}

#[test]
fn chmod_parse_mode_644() {
    let mode = ventoos_vfs::chmod::parse_mode("644").unwrap();
    assert_eq!(mode, 0o644);
}

#[test]
fn chmod_parse_mode_777() {
    let mode = ventoos_vfs::chmod::parse_mode("777").unwrap();
    assert_eq!(mode, 0o777);
}

#[test]
fn chmod_parse_mode_invalid_returns_error() {
    assert!(ventoos_vfs::chmod::parse_mode("xyz").is_err());
    assert!(ventoos_vfs::chmod::parse_mode("").is_err());
    assert!(ventoos_vfs::chmod::parse_mode("999").is_err());
}

#[test]
fn chmod_mode_to_string_roundtrip() {
    let s = ventoos_vfs::chmod::mode_to_string(0o755);
    assert_eq!(s, "rwxr-xr-x");
    let s2 = ventoos_vfs::chmod::mode_to_string(0o644);
    assert_eq!(s2, "rw-r--r--");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARCHIVE types & helpers
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn archive_format_from_path_tar_gz() {
    assert_eq!(
        ventoos_vfs::archive::ArchiveFormat::from_path("backup.tar.gz"),
        Some(ventoos_vfs::archive::ArchiveFormat::TarGz)
    );
    assert_eq!(
        ventoos_vfs::archive::ArchiveFormat::from_path("archive.tgz"),
        Some(ventoos_vfs::archive::ArchiveFormat::TarGz)
    );
}

#[test]
fn archive_format_from_path_zip() {
    assert_eq!(
        ventoos_vfs::archive::ArchiveFormat::from_path("data.zip"),
        Some(ventoos_vfs::archive::ArchiveFormat::Zip)
    );
}

#[test]
fn archive_format_from_path_unknown() {
    assert!(ventoos_vfs::archive::ArchiveFormat::from_path("file.txt").is_none());
}

#[test]
fn archive_format_extension() {
    assert_eq!(
        ventoos_vfs::archive::ArchiveFormat::TarGz.extension(),
        ".tar.gz"
    );
    assert_eq!(ventoos_vfs::archive::ArchiveFormat::Zip.extension(), ".zip");
}

#[test]
fn archive_request_construction() {
    let req = ventoos_vfs::archive::ArchiveRequest {
        paths: vec!["file1.txt".into(), "dir/".into()],
        dest: "output.tar.gz".into(),
        format: ventoos_vfs::archive::ArchiveFormat::TarGz,
        password: None,
    };
    assert_eq!(req.paths.len(), 2);
    let json = serde_json::to_string(&req).unwrap();
    let back: ventoos_vfs::archive::ArchiveRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(back.dest, "output.tar.gz");
}

#[test]
fn archive_create_and_extract_tar_gz() {
    let dir = tempdir().unwrap();
    let src_dir = dir.path().join("src");
    std::fs::create_dir(&src_dir).unwrap();
    std::fs::write(src_dir.join("hello.txt"), "hello archive").unwrap();

    let archive_path = dir.path().join("out.tar.gz");
    ventoos_vfs::archive::create_tar_gz(&src_dir, &["hello.txt".into()], &archive_path).unwrap();
    assert!(archive_path.exists());

    let extract_dir = dir.path().join("extracted");
    std::fs::create_dir(&extract_dir).unwrap();
    ventoos_vfs::archive::extract_tar_gz(&archive_path, &extract_dir).unwrap();
    assert!(extract_dir.join("hello.txt").exists());
    assert_eq!(
        std::fs::read_to_string(extract_dir.join("hello.txt")).unwrap(),
        "hello archive"
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH helpers
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn search_matches_glob_star() {
    assert!(ventoos_vfs::search::matches_glob("hello.txt", "*.txt"));
    assert!(!ventoos_vfs::search::matches_glob("hello.rs", "*.txt"));
}

#[test]
fn search_matches_glob_question() {
    assert!(ventoos_vfs::search::matches_glob("a1", "a?"));
    assert!(!ventoos_vfs::search::matches_glob("ab1", "a?"));
}

#[test]
fn search_is_glob_pattern() {
    assert!(ventoos_vfs::search::is_glob_pattern("*.txt"));
    assert!(ventoos_vfs::search::is_glob_pattern("file?.rs"));
    assert!(ventoos_vfs::search::is_glob_pattern("[abc].txt"));
    assert!(!ventoos_vfs::search::is_glob_pattern("plain_name"));
}

#[test]
fn search_matches_query_substring() {
    assert!(ventoos_vfs::search::matches_query("README.md", "readme"));
    assert!(ventoos_vfs::search::matches_query("MyReadme.txt", "readme"));
    assert!(!ventoos_vfs::search::matches_query("other.txt", "readme"));
}

// ═══════════════════════════════════════════════════════════════════════════════
// WATCH types
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn watch_event_kind_serialization() {
    let kinds = [
        (ventoos_vfs::watch::WatchEventKind::Created, "\"created\""),
        (ventoos_vfs::watch::WatchEventKind::Modified, "\"modified\""),
        (ventoos_vfs::watch::WatchEventKind::Deleted, "\"deleted\""),
    ];
    for (kind, expected) in &kinds {
        let json = serde_json::to_string(kind).unwrap();
        assert_eq!(&json, expected);
    }
}

#[test]
fn watch_event_construction() {
    let evt = ventoos_vfs::watch::WatchEvent {
        kind: ventoos_vfs::watch::WatchEventKind::Modified,
        path: "/data/file.txt".into(),
        name: "file.txt".into(),
        is_dir: false,
    };
    let json = serde_json::to_string(&evt).unwrap();
    let back: ventoos_vfs::watch::WatchEvent = serde_json::from_str(&json).unwrap();
    assert_eq!(back.path, "/data/file.txt");
    assert_eq!(back.kind, ventoos_vfs::watch::WatchEventKind::Modified);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONCURRENT & EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn concurrent_mount_operations() {
    let mgr = Arc::new(VfsManager::new());
    let mut handles = Vec::new();

    for i in 0..10 {
        let mgr = Arc::clone(&mgr);
        handles.push(tokio::spawn(async move {
            mgr.create_mount(CreateVfsMountReq {
                name: format!("concurrent-{i}"),
                kind: VfsSourceKind::Local,
                root: "/tmp".into(),
                connection_id: None,
                group: None,
                    local_mount: None,
                }
)
            .await
        }));
    }

    for h in handles {
        h.await.unwrap();
    }

    let list = mgr.list_mounts().await;
    assert_eq!(list.len(), 10);
}

#[tokio::test]
async fn mount_with_very_long_root_path() {
    let long_path = format!("/tmp/{}", "a".repeat(500));
    let mgr = VfsManager::new();
    let mount = mgr
        .create_mount(CreateVfsMountReq {
            name: "long-root".into(),
            kind: VfsSourceKind::Local,
            root: long_path.clone(),
            connection_id: None,
            group: None,
                local_mount: None,
            }
)
        .await;
    assert_eq!(mount.root, long_path);
}

#[tokio::test]
async fn local_list_empty_directory() {
    let dir = tempdir().unwrap();
    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid,
            path: "/".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    assert!(nodes.is_empty());
}

#[tokio::test]
async fn local_list_nonexistent_mount_fails() {
    let mgr = VfsManager::new();
    let result = mgr
        .list_dir(&VfsListReq {
            mount_id: "bad-id".into(),
            path: "/".into(),
            show_hidden: false,
        })
        .await;
    assert!(result.is_err());
}

#[tokio::test]
async fn local_write_overwrite_existing() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("overwrite.txt"), "old").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    mgr.write_file(&VfsWriteReq {
        mount_id: mid.clone(),
        path: "/overwrite.txt".into(),
        content: "new".into(),
    })
    .await
    .unwrap();

    let read = mgr
        .read_file(&VfsReadReq {
            mount_id: mid,
            path: "/overwrite.txt".into(),
            max_bytes: None,
        })
        .await
        .unwrap();
    assert_eq!(read.content, "new");
}

#[tokio::test]
async fn local_nested_directory_listing() {
    let dir = tempdir().unwrap();
    let sub = dir.path().join("level1").join("level2");
    std::fs::create_dir_all(&sub).unwrap();
    std::fs::write(sub.join("deep.txt"), "deep").unwrap();

    let (mgr, mid) = manager_with_local_mount(dir.path().to_str().unwrap()).await;

    let nodes = mgr
        .list_dir(&VfsListReq {
            mount_id: mid,
            path: "/level1/level2".into(),
            show_hidden: false,
        })
        .await
        .unwrap();

    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].name, "deep.txt");
}

// ═══════════════════════════════════════════════════════════════════════════════
// WebDavServerSettings Default trait
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn webdav_server_settings_default_trait() {
    let settings = WebDavServerSettings::default();
    assert!(!settings.enabled);
    assert_eq!(settings.username, "webdav");
    assert!(settings.password.is_empty());
    assert!(settings.exposed_mounts.is_empty());
}

#[test]
fn webdav_server_settings_serialization() {
    let settings = WebDavServerSettings {
        enabled: true,
        username: "admin".into(),
        password: "pass".into(),
        exposed_mounts: vec!["id1".into(), "id2".into()],
    };
    let json = serde_json::to_string(&settings).unwrap();
    let back: WebDavServerSettings = serde_json::from_str(&json).unwrap();
    assert!(back.enabled);
    assert_eq!(back.username, "admin");
    assert_eq!(back.exposed_mounts.len(), 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CreateVfsMountReq & VfsMount serialization
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn create_vfs_mount_req_serialization() {
    let req = CreateVfsMountReq {
        name: "test".into(),
        kind: VfsSourceKind::Local,
        root: "/data".into(),
        connection_id: Some("conn-1".into()),
        group: Some("dev".into()),
            local_mount: None,
    };
    let json = serde_json::to_string(&req).unwrap();
    let back: CreateVfsMountReq = serde_json::from_str(&json).unwrap();
    assert_eq!(back.name, "test");
    assert_eq!(back.connection_id, Some("conn-1".into()));
    assert_eq!(back.group, Some("dev".into()));
}

#[test]
fn vfs_mount_serialization_roundtrip() {
    let mount = VfsMount {
        id: "abc-123".into(),
        name: "my-mount".into(),
        kind: VfsSourceKind::S3,
        root: "s3://bucket".into(),
        connection_id: None,
        group: Some("storage".into()),
            local_mount: None,
    };
    let json = serde_json::to_string(&mount).unwrap();
    let back: VfsMount = serde_json::from_str(&json).unwrap();
    assert_eq!(back.id, "abc-123");
    assert!(matches!(back.kind, VfsSourceKind::S3));
    assert_eq!(back.group, Some("storage".into()));
}
