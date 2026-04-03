use std::sync::Arc;
use std::thread;

use tempfile::tempdir;
use ventoos_core::types::new_id;
use ventoos_core::window::{WindowState, WindowStatus};
use ventoos_persist::{Database, SettingsManager, StorageManager, WindowStateManager};

// ─── Helpers ────────────────────────────────────────────────────────────────

fn mem_db() -> Arc<Database> {
    Arc::new(Database::open_in_memory().unwrap())
}

fn make_window(app_id: &str, z: u32, status: WindowStatus) -> WindowState {
    WindowState {
        id: new_id(),
        app_id: app_id.to_string(),
        title: format!("{app_id} window"),
        x: 100.0,
        y: 50.0,
        width: 800.0,
        height: 600.0,
        z_index: z,
        status,
        is_maximized: false,
        tab_states: None,
        app_state: None,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Database Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn db_open_in_memory_creates_tables() {
    let db = mem_db();
    let tables: Vec<String> = db
        .with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")?;
            let rows = stmt.query_map([], |r| r.get(0))?;
            rows.collect()
        })
        .unwrap();
    assert!(tables.contains(&"settings".to_string()));
    assert!(tables.contains(&"window_states".to_string()));
    assert!(tables.contains(&"connections".to_string()));
}

#[test]
fn db_open_file_creates_persistent_database() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    {
        let db = Database::open(&db_path).unwrap();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('k', 'v')",
                [],
            )?;
            Ok(())
        })
        .unwrap();
    }

    assert!(db_path.exists());
    let db = Database::open(&db_path).unwrap();
    let val: String = db
        .with_conn(|conn| {
            conn.query_row("SELECT value FROM settings WHERE key='k'", [], |r| r.get(0))
        })
        .unwrap();
    assert_eq!(val, "v");
}

#[test]
fn db_with_conn_executes_queries() {
    let db = mem_db();
    let count: i64 = db
        .with_conn(|conn| {
            conn.query_row("SELECT count(*) FROM settings", [], |r| r.get(0))
        })
        .unwrap();
    assert_eq!(count, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SettingsManager Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn settings_set_get_delete() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    mgr.set("theme", "dark").unwrap();

    assert_eq!(mgr.get("theme").unwrap(), Some("dark".to_string()));

    let deleted = mgr.delete("theme").unwrap();
    assert!(deleted);
    assert_eq!(mgr.get("theme").unwrap(), None);
}

#[test]
fn settings_get_nonexistent_returns_none() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    assert_eq!(mgr.get("nonexistent").unwrap(), None);
}

#[test]
fn settings_get_batch_mixed_keys() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    mgr.set("a", "1").unwrap();
    mgr.set("c", "3").unwrap();

    let result = mgr.get_batch(&["a", "b", "c"]).unwrap();
    assert_eq!(result.get("a"), Some(&"1".to_string()));
    assert_eq!(result.get("b"), None);
    assert_eq!(result.get("c"), Some(&"3".to_string()));
    assert_eq!(result.len(), 2);
}

#[test]
fn settings_overwrite_existing() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    mgr.set("lang", "en").unwrap();
    mgr.set("lang", "zh-CN").unwrap();
    assert_eq!(mgr.get("lang").unwrap(), Some("zh-CN".to_string()));
}

#[test]
fn settings_delete_nonexistent_returns_false() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    assert!(!mgr.delete("ghost").unwrap());
}

#[test]
fn settings_large_values() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    let big = "x".repeat(10 * 1024); // 10 KB
    mgr.set("big", &big).unwrap();
    assert_eq!(mgr.get("big").unwrap().unwrap().len(), 10 * 1024);
}

#[test]
fn settings_special_characters_in_keys_and_values() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    let key = "key/with.special-chars_and spaces!";
    let value = r#"{"json": true, "sql": "DROP TABLE; --", "path": "C:\Users\test"}"#;
    mgr.set(key, value).unwrap();
    assert_eq!(mgr.get(key).unwrap(), Some(value.to_string()));
}

#[test]
fn settings_unicode_values() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    mgr.set("greeting", "你好世界").unwrap();
    mgr.set("emoji", "🚀🎉💻").unwrap();
    mgr.set("mixed", "Hello 世界 🌍").unwrap();

    assert_eq!(mgr.get("greeting").unwrap(), Some("你好世界".to_string()));
    assert_eq!(mgr.get("emoji").unwrap(), Some("🚀🎉💻".to_string()));
    assert_eq!(mgr.get("mixed").unwrap(), Some("Hello 世界 🌍".to_string()));
}

#[test]
fn settings_empty_string_key_and_value() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    mgr.set("", "empty_key_value").unwrap();
    assert_eq!(
        mgr.get("").unwrap(),
        Some("empty_key_value".to_string())
    );

    mgr.set("empty_val", "").unwrap();
    assert_eq!(mgr.get("empty_val").unwrap(), Some(String::new()));
}

#[test]
fn settings_large_number_of_entries() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    for i in 0..150 {
        mgr.set(&format!("key_{i:04}"), &format!("value_{i}"))
            .unwrap();
    }
    // Spot check
    assert_eq!(
        mgr.get("key_0000").unwrap(),
        Some("value_0".to_string())
    );
    assert_eq!(
        mgr.get("key_0149").unwrap(),
        Some("value_149".to_string())
    );

    // Batch
    let keys: Vec<String> = (0..150).map(|i| format!("key_{i:04}")).collect();
    let key_refs: Vec<&str> = keys.iter().map(String::as_str).collect();
    let batch = mgr.get_batch(&key_refs).unwrap();
    assert_eq!(batch.len(), 150);
}

#[test]
fn settings_set_then_immediate_get_consistency() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    for i in 0..50 {
        let key = format!("fast_{i}");
        let val = format!("v_{i}");
        mgr.set(&key, &val).unwrap();
        assert_eq!(mgr.get(&key).unwrap(), Some(val));
    }
}

#[test]
fn settings_get_batch_empty_keys() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    let result = mgr.get_batch(&[]).unwrap();
    assert!(result.is_empty());
}

#[test]
fn settings_get_batch_duplicate_keys() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);
    mgr.set("dup", "val").unwrap();
    let result = mgr.get_batch(&["dup", "dup", "dup"]).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result.get("dup"), Some(&"val".to_string()));
}

#[test]
fn settings_persistence_across_manager_recreation() {
    let db = mem_db();
    {
        let mgr = SettingsManager::new(Arc::clone(&db));
        mgr.set("persist_key", "persist_val").unwrap();
    }
    let mgr2 = SettingsManager::new(db);
    assert_eq!(
        mgr2.get("persist_key").unwrap(),
        Some("persist_val".to_string())
    );
}

#[test]
fn settings_concurrent_access() {
    let db = mem_db();
    let mgr = Arc::new(SettingsManager::new(db));

    let handles: Vec<_> = (0..10)
        .map(|i| {
            let mgr = Arc::clone(&mgr);
            thread::spawn(move || {
                let key = format!("thread_{i}");
                let val = format!("value_{i}");
                mgr.set(&key, &val).unwrap();
                assert_eq!(mgr.get(&key).unwrap(), Some(val));
            })
        })
        .collect();

    for h in handles {
        h.join().unwrap();
    }

    for i in 0..10 {
        assert_eq!(
            mgr.get(&format!("thread_{i}")).unwrap(),
            Some(format!("value_{i}"))
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. StorageManager Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn storage_crud_single_app() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    mgr.set_value("app1", "foo", "bar").unwrap();
    assert_eq!(
        mgr.get_value("app1", "foo").unwrap(),
        Some("bar".to_string())
    );

    mgr.set_value("app1", "foo", "baz").unwrap();
    assert_eq!(
        mgr.get_value("app1", "foo").unwrap(),
        Some("baz".to_string())
    );

    let deleted = mgr.delete_value("app1", "foo").unwrap();
    assert!(deleted);
    assert_eq!(mgr.get_value("app1", "foo").unwrap(), None);
}

#[test]
fn storage_app_isolation() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    mgr.set_value("app_a", "key", "alpha").unwrap();
    mgr.set_value("app_b", "key", "beta").unwrap();

    assert_eq!(
        mgr.get_value("app_a", "key").unwrap(),
        Some("alpha".to_string())
    );
    assert_eq!(
        mgr.get_value("app_b", "key").unwrap(),
        Some("beta".to_string())
    );

    mgr.delete_value("app_a", "key").unwrap();
    assert_eq!(mgr.get_value("app_a", "key").unwrap(), None);
    assert_eq!(
        mgr.get_value("app_b", "key").unwrap(),
        Some("beta".to_string())
    );
}

#[test]
fn storage_list_keys_sorted() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    mgr.set_value("myapp", "zebra", "z").unwrap();
    mgr.set_value("myapp", "apple", "a").unwrap();
    mgr.set_value("myapp", "mango", "m").unwrap();

    let keys = mgr.list_keys("myapp").unwrap();
    assert_eq!(keys, vec!["apple", "mango", "zebra"]);
}

#[test]
fn storage_multiple_apps() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    for i in 0..5 {
        let app = format!("app_{i}");
        mgr.set_value(&app, "name", &app).unwrap();
    }

    for i in 0..5 {
        let app = format!("app_{i}");
        assert_eq!(mgr.get_value(&app, "name").unwrap(), Some(app));
    }
}

#[test]
fn storage_delete_nonexistent_returns_false() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());
    assert!(!mgr.delete_value("noapp", "nokey").unwrap());
}

#[test]
fn storage_persistence_across_reopen() {
    let dir = tempdir().unwrap();

    {
        let mgr = StorageManager::new(dir.path());
        mgr.set_value("persist_app", "keep", "this").unwrap();
    }

    let mgr2 = StorageManager::new(dir.path());
    assert_eq!(
        mgr2.get_value("persist_app", "keep").unwrap(),
        Some("this".to_string())
    );
}

#[test]
fn storage_app_id_special_chars() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    // App IDs that are valid directory names
    let ids = ["my-app", "app_v2", "com.example.app"];
    for id in ids {
        mgr.set_value(id, "test", "ok").unwrap();
        assert_eq!(mgr.get_value(id, "test").unwrap(), Some("ok".to_string()));
    }
}

#[test]
fn storage_list_keys_empty_app() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());
    let keys = mgr.list_keys("empty_app").unwrap();
    assert!(keys.is_empty());
}

#[test]
fn storage_get_nonexistent_key() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());
    assert_eq!(mgr.get_value("app", "nope").unwrap(), None);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. WindowStateManager Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn window_save_and_load_roundtrip() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let state = make_window("k8s", 1, WindowStatus::Active);
    mgr.save_all(&[state.clone()]).unwrap();

    let loaded = mgr.load_all().unwrap();
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, state.id);
    assert_eq!(loaded[0].app_id, "k8s");
    assert_eq!(loaded[0].z_index, 1);
}

#[test]
fn window_save_multiple_states() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let states: Vec<_> = (0..5)
        .map(|i| make_window(&format!("app_{i}"), i, WindowStatus::Active))
        .collect();
    mgr.save_all(&states).unwrap();

    let loaded = mgr.load_all().unwrap();
    assert_eq!(loaded.len(), 5);
    // Should be ordered by z_index
    for (i, w) in loaded.iter().enumerate() {
        assert_eq!(w.z_index, i as u32);
    }
}

#[test]
fn window_clear_all() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    mgr.save_all(&[make_window("a", 0, WindowStatus::Active)])
        .unwrap();
    assert_eq!(mgr.load_all().unwrap().len(), 1);

    mgr.clear_all().unwrap();
    assert!(mgr.load_all().unwrap().is_empty());
}

#[test]
fn window_save_overwrites_previous() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    mgr.save_all(&[make_window("first", 0, WindowStatus::Active)])
        .unwrap();
    mgr.save_all(&[
        make_window("second", 0, WindowStatus::Active),
        make_window("third", 1, WindowStatus::Minimized),
    ])
    .unwrap();

    let loaded = mgr.load_all().unwrap();
    assert_eq!(loaded.len(), 2);
    assert_eq!(loaded[0].app_id, "second");
    assert_eq!(loaded[1].app_id, "third");
}

#[test]
fn window_load_all_empty_database() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);
    assert!(mgr.load_all().unwrap().is_empty());
}

#[test]
fn window_all_status_variants() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let statuses = [
        WindowStatus::Created,
        WindowStatus::Opening,
        WindowStatus::Active,
        WindowStatus::Blurred,
        WindowStatus::Minimized,
        WindowStatus::Restored,
        WindowStatus::Closing,
        WindowStatus::Closed,
    ];

    let states: Vec<_> = statuses
        .iter()
        .enumerate()
        .map(|(i, s)| make_window(&format!("status_{i}"), i as u32, s.clone()))
        .collect();

    mgr.save_all(&states).unwrap();
    let loaded = mgr.load_all().unwrap();
    assert_eq!(loaded.len(), statuses.len());

    for (loaded_state, expected_status) in loaded.iter().zip(statuses.iter()) {
        assert_eq!(&loaded_state.status, expected_status);
    }
}

#[test]
fn window_preserves_tab_states_json() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let mut state = make_window("editor", 0, WindowStatus::Active);
    state.tab_states = Some(serde_json::json!({
        "tabs": [
            {"id": "tab1", "title": "main.rs"},
            {"id": "tab2", "title": "lib.rs"}
        ],
        "active": "tab1"
    }));

    mgr.save_all(&[state.clone()]).unwrap();
    let loaded = mgr.load_all().unwrap();

    assert_eq!(loaded[0].tab_states, state.tab_states);
}

#[test]
fn window_preserves_app_state_json() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let mut state = make_window("k8s", 0, WindowStatus::Active);
    state.app_state = Some(serde_json::json!({
        "cluster": "production",
        "namespace": "default",
        "view": "pods"
    }));

    mgr.save_all(&[state.clone()]).unwrap();
    let loaded = mgr.load_all().unwrap();

    assert_eq!(loaded[0].app_state, state.app_state);
}

#[test]
fn window_negative_coordinates() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let mut state = make_window("offscreen", 0, WindowStatus::Active);
    state.x = -200.0;
    state.y = -100.0;

    mgr.save_all(&[state]).unwrap();
    let loaded = mgr.load_all().unwrap();

    assert_eq!(loaded[0].x, -200.0);
    assert_eq!(loaded[0].y, -100.0);
}

#[test]
fn window_maximum_dimensions() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let mut state = make_window("huge", 0, WindowStatus::Active);
    state.width = 7680.0;
    state.height = 4320.0;
    state.z_index = u32::MAX;

    mgr.save_all(&[state]).unwrap();
    let loaded = mgr.load_all().unwrap();

    assert_eq!(loaded[0].width, 7680.0);
    assert_eq!(loaded[0].height, 4320.0);
    assert_eq!(loaded[0].z_index, u32::MAX);
}

#[test]
fn window_is_maximized_flag() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let mut state = make_window("max", 0, WindowStatus::Active);
    state.is_maximized = true;

    mgr.save_all(&[state]).unwrap();
    let loaded = mgr.load_all().unwrap();

    assert!(loaded[0].is_maximized);
}

#[test]
fn window_no_tab_states_is_none() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let state = make_window("plain", 0, WindowStatus::Active);
    mgr.save_all(&[state]).unwrap();
    let loaded = mgr.load_all().unwrap();

    assert!(loaded[0].tab_states.is_none());
    assert!(loaded[0].app_state.is_none());
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Cross-cutting / Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn db_persistence_across_reopen() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("reopen.db");

    {
        let db = Arc::new(Database::open(&db_path).unwrap());
        let settings = SettingsManager::new(Arc::clone(&db));
        settings.set("survive", "reopen").unwrap();

        let windows = WindowStateManager::new(db);
        windows
            .save_all(&[make_window("a", 0, WindowStatus::Active)])
            .unwrap();
    }

    {
        let db = Arc::new(Database::open(&db_path).unwrap());
        let settings = SettingsManager::new(Arc::clone(&db));
        assert_eq!(
            settings.get("survive").unwrap(),
            Some("reopen".to_string())
        );

        let windows = WindowStateManager::new(db);
        let loaded = windows.load_all().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].app_id, "a");
    }
}

#[test]
fn settings_and_windows_share_database() {
    let db = mem_db();
    let settings = SettingsManager::new(Arc::clone(&db));
    let windows = WindowStateManager::new(db);

    settings.set("shared_test", "yes").unwrap();
    windows
        .save_all(&[make_window("shared", 0, WindowStatus::Active)])
        .unwrap();

    assert_eq!(
        settings.get("shared_test").unwrap(),
        Some("yes".to_string())
    );
    assert_eq!(windows.load_all().unwrap().len(), 1);
}

#[test]
fn window_save_with_complex_tab_states() {
    let db = mem_db();
    let mgr = WindowStateManager::new(db);

    let mut state = make_window("complex", 0, WindowStatus::Active);
    state.tab_states = Some(serde_json::json!({
        "tabs": [],
        "nested": {
            "deep": {
                "array": [1, 2, 3],
                "null_field": null,
                "bool": true
            }
        },
        "unicode": "你好🌍"
    }));

    mgr.save_all(&[state.clone()]).unwrap();
    let loaded = mgr.load_all().unwrap();
    assert_eq!(loaded[0].tab_states, state.tab_states);
}

#[test]
fn storage_overwrite_preserves_other_keys() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    mgr.set_value("app", "key1", "v1").unwrap();
    mgr.set_value("app", "key2", "v2").unwrap();
    mgr.set_value("app", "key1", "v1_updated").unwrap();

    assert_eq!(
        mgr.get_value("app", "key1").unwrap(),
        Some("v1_updated".to_string())
    );
    assert_eq!(
        mgr.get_value("app", "key2").unwrap(),
        Some("v2".to_string())
    );
}

#[test]
fn storage_unicode_values() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    mgr.set_value("app", "greeting", "你好世界 🚀").unwrap();
    assert_eq!(
        mgr.get_value("app", "greeting").unwrap(),
        Some("你好世界 🚀".to_string())
    );
}

#[test]
fn storage_empty_string_key_and_value() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    mgr.set_value("app", "", "empty_key").unwrap();
    assert_eq!(
        mgr.get_value("app", "").unwrap(),
        Some("empty_key".to_string())
    );

    mgr.set_value("app", "empty_val", "").unwrap();
    assert_eq!(
        mgr.get_value("app", "empty_val").unwrap(),
        Some(String::new())
    );
}

#[test]
fn storage_large_value() {
    let dir = tempdir().unwrap();
    let mgr = StorageManager::new(dir.path());

    let big = "y".repeat(50 * 1024);
    mgr.set_value("app", "big", &big).unwrap();
    assert_eq!(mgr.get_value("app", "big").unwrap().unwrap().len(), 50 * 1024);
}

#[test]
fn settings_delete_then_set_again() {
    let db = mem_db();
    let mgr = SettingsManager::new(db);

    mgr.set("recycle", "first").unwrap();
    mgr.delete("recycle").unwrap();
    mgr.set("recycle", "second").unwrap();
    assert_eq!(mgr.get("recycle").unwrap(), Some("second".to_string()));
}
