//! Comprehensive API integration tests for `ventoos-server`.

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use serde_json::{json, Value};
use tower::ServiceExt;

use ventoos_server::routes::create_router;
use ventoos_server::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build an `AppState` with in-memory DB and a fresh router.
fn build_app() -> Router {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let state = AppState::new_test().expect("failed to create test AppState");
    create_router(&state)
}

/// Read response body into `serde_json::Value`.
async fn body_json(resp: axum::response::Response) -> Value {
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

/// Run setup + login, return the bearer token.
async fn setup_auth(app: &Router) -> String {
    // Setup password
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "test1234"}).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Login
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "test1234"}).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let json = body_json(resp).await;
    json["data"]["token"]
        .as_str()
        .expect("token missing")
        .to_string()
}

/// Build a request with Authorization header.
fn authed_request(method: Method, uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

/// Build a request with Authorization header and JSON body.
fn authed_json_request(method: Method, uri: &str, token: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

// ===========================================================================
//  HEALTH & AUTH
// ===========================================================================

#[tokio::test]
async fn test_health_returns_ok() {
    let app = build_app();
    let req = Request::builder()
        .uri("/api/health")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"]["status"], "ok");
}

#[tokio::test]
async fn test_auth_status_not_initialized() {
    let app = build_app();
    let req = Request::builder()
        .uri("/api/auth/status")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"]["initialized"], false);
}

#[tokio::test]
async fn test_auth_setup_creates_password() {
    let app = build_app();
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "mypass"}).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"]["initialized"], true);

    // Verify auth status shows initialized
    let req = Request::builder()
        .uri("/api/auth/status")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["data"]["initialized"], true);
}

#[tokio::test]
async fn test_auth_setup_already_initialized_returns_error() {
    let app = build_app();
    // First setup
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "first"}).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Second setup should fail
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "second"}).to_string()))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let json = body_json(resp).await;
    assert_eq!(json["success"], false);
}

#[tokio::test]
async fn test_auth_login_correct_password() {
    let app = build_app();
    // Setup
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "correct"}).to_string()))
        .unwrap();
    app.clone().oneshot(req).await.unwrap();

    // Login
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "correct"}).to_string()))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert!(json["data"]["token"].as_str().is_some());
}

#[tokio::test]
async fn test_auth_login_wrong_password() {
    let app = build_app();
    // Setup
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "correct"}).to_string()))
        .unwrap();
    app.clone().oneshot(req).await.unwrap();

    // Login with wrong password
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "wrong"}).to_string()))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    let json = body_json(resp).await;
    assert_eq!(json["success"], false);
}

#[tokio::test]
async fn test_protected_route_without_token_returns_401() {
    let app = build_app();
    // Setup password first so auth middleware enforces tokens
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "pw"}).to_string()))
        .unwrap();
    app.clone().oneshot(req).await.unwrap();

    // Try to access protected route without token
    let req = Request::builder()
        .uri("/api/tasks")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_protected_route_with_valid_token() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/tasks", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_auth_logout_invalidates_token() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Logout
    let req = authed_request(Method::POST, "/api/auth/logout", &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Token should now be invalid
    let req = authed_request(Method::GET, "/api/tasks", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_auth_change_password_valid() {
    let app = build_app();
    let _token = setup_auth(&app).await;

    // Change password
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/change-password")
        .header("authorization", format!("Bearer {_token}"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({"current_password": "test1234", "new_password": "newpass"}).to_string(),
        ))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);

    // Old token should be invalidated
    let req = authed_request(Method::GET, "/api/tasks", &_token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    // Login with new password should work
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "newpass"}).to_string()))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_auth_change_password_wrong_current() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_json_request(
        Method::POST,
        "/api/auth/change-password",
        &token,
        json!({"current_password": "wrong", "new_password": "newpass"}),
    );
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let json = body_json(resp).await;
    assert_eq!(json["success"], false);
}

// ===========================================================================
//  TASKS
// ===========================================================================

#[tokio::test]
async fn test_tasks_list_empty() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/tasks", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"], json!([]));
}

#[tokio::test]
async fn test_tasks_create() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({
        "name": "Deploy pods",
        "description": "Rolling update",
        "priority": "high",
        "source": "user"
    });
    let req = authed_json_request(Method::POST, "/api/tasks", &token, body);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"]["name"], "Deploy pods");
    assert_eq!(json["data"]["status"], "queued");
}

#[tokio::test]
async fn test_tasks_get_by_id() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({"name": "Task A", "source": "user"});
    let req = authed_json_request(Method::POST, "/api/tasks", &token, body);
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let id = json["data"]["id"].as_str().unwrap();

    let req = authed_request(Method::GET, &format!("/api/tasks/{id}"), &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["data"]["name"], "Task A");
}

#[tokio::test]
async fn test_tasks_cancel() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({"name": "Cancel me", "source": "system"});
    let req = authed_json_request(Method::POST, "/api/tasks", &token, body);
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let id = json["data"]["id"].as_str().unwrap();

    // Cancel
    let req = authed_request(Method::POST, &format!("/api/tasks/{id}/cancel"), &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["data"]["status"], "cancelled");
}

#[tokio::test]
async fn test_tasks_get_nonexistent_returns_404() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let fake_id = "00000000-0000-0000-0000-000000000000";
    let req = authed_request(Method::GET, &format!("/api/tasks/{fake_id}"), &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

// ===========================================================================
//  SETTINGS
// ===========================================================================

#[tokio::test]
async fn test_settings_desktop_get_defaults() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/settings/desktop", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    // Should have default values
    assert!(json["data"]["wallpaper"].is_string());
    assert!(json["data"]["theme_mode"].is_string());
}

#[tokio::test]
async fn test_settings_desktop_update() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({
        "wallpaper": "/wallpapers/custom.jpg",
        "theme_mode": "light",
        "dock_icon_size": 64,
        "dock_auto_hide": true
    });
    let req = authed_json_request(Method::PUT, "/api/settings/desktop", &token, body);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify
    let req = authed_request(Method::GET, "/api/settings/desktop", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["data"]["wallpaper"], "/wallpapers/custom.jpg");
    assert_eq!(json["data"]["theme_mode"], "light");
    assert_eq!(json["data"]["dock_icon_size"], 64);
    assert_eq!(json["data"]["dock_auto_hide"], true);
}

#[tokio::test]
async fn test_settings_windows_get_empty() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/settings/windows", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"], json!([]));
}

#[tokio::test]
async fn test_settings_windows_save() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let windows = json!([
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "app_id": "kubernetes",
            "title": "Kubernetes",
            "x": 100.0, "y": 50.0,
            "width": 1200.0, "height": 800.0,
            "z_index": 1,
            "status": "active",
            "is_maximized": false
        }
    ]);
    let req = authed_json_request(Method::PUT, "/api/settings/windows", &token, windows);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify
    let req = authed_request(Method::GET, "/api/settings/windows", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let states = json["data"].as_array().unwrap();
    assert_eq!(states.len(), 1);
    assert_eq!(states[0]["app_id"], "kubernetes");
}

// ===========================================================================
//  STORAGE
// ===========================================================================

#[tokio::test]
async fn test_storage_list_empty() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/storage/empty-app-unique", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"], json!([]));
}

#[tokio::test]
async fn test_storage_set_value() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({"value": "hello world"});
    let req = authed_json_request(
        Method::PUT,
        "/api/storage/test-app/key1",
        &token,
        body,
    );
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["data"]["saved"], true);
}

#[tokio::test]
async fn test_storage_get_value() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Set
    let body = json!({"value": "my_value"});
    let req = authed_json_request(Method::PUT, "/api/storage/myapp/mykey", &token, body);
    app.clone().oneshot(req).await.unwrap();

    // Get
    let req = authed_request(Method::GET, "/api/storage/myapp/mykey", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["data"]["value"], "my_value");
}

#[tokio::test]
async fn test_storage_delete_value() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Set
    let body = json!({"value": "temp"});
    let req = authed_json_request(Method::PUT, "/api/storage/app1/k1", &token, body);
    app.clone().oneshot(req).await.unwrap();

    // Delete
    let req = authed_request(Method::DELETE, "/api/storage/app1/k1", &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Get after delete
    let req = authed_request(Method::GET, "/api/storage/app1/k1", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    // Should indicate not found
    assert_eq!(json["success"], false);
}

#[tokio::test]
async fn test_storage_isolation_between_apps() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Set in app-a
    let body = json!({"value": "a-data"});
    let req = authed_json_request(Method::PUT, "/api/storage/app-a/shared-key", &token, body);
    app.clone().oneshot(req).await.unwrap();

    // Set in app-b
    let body = json!({"value": "b-data"});
    let req = authed_json_request(Method::PUT, "/api/storage/app-b/shared-key", &token, body);
    app.clone().oneshot(req).await.unwrap();

    // Get from app-a
    let req = authed_request(Method::GET, "/api/storage/app-a/shared-key", &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["data"]["value"], "a-data");

    // Get from app-b
    let req = authed_request(Method::GET, "/api/storage/app-b/shared-key", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["data"]["value"], "b-data");
}

// ===========================================================================
//  NOTIFICATIONS
// ===========================================================================

#[tokio::test]
async fn test_notifications_list_empty() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/notifications", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"], json!([]));
}

// ===========================================================================
//  SSH SERVERS (served via SshPlugin)
// ===========================================================================

#[tokio::test]
async fn test_ssh_servers_list_empty() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/ssh/servers", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"], json!([]));
}

#[tokio::test]
async fn test_ssh_servers_create() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({
        "name": "Dev Server",
        "host": "192.168.1.10",
        "port": 22,
        "username": "root",
        "auth_method": {"type": "password"}
    });
    let req = authed_json_request(Method::POST, "/api/ssh/servers", &token, body);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"]["name"], "Dev Server");
}

#[tokio::test]
async fn test_ssh_servers_get_by_id() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({
        "name": "Staging",
        "host": "10.0.0.5",
        "port": 22,
        "username": "deploy",
        "auth_method": {"type": "private_key", "key_path": "/home/deploy/.ssh/id_rsa"}
    });
    let req = authed_json_request(Method::POST, "/api/ssh/servers", &token, body);
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let id = json["data"]["id"].as_str().unwrap();

    let req = authed_request(Method::GET, &format!("/api/ssh/servers/{id}"), &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["data"]["name"], "Staging");
}

#[tokio::test]
async fn test_ssh_servers_update() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({
        "name": "Old Name",
        "host": "1.2.3.4",
        "port": 22,
        "username": "user",
        "auth_method": {"type": "password"}
    });
    let req = authed_json_request(Method::POST, "/api/ssh/servers", &token, body);
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let id = json["data"]["id"].as_str().unwrap();

    let update = json!({"name": "New Name"});
    let req = authed_json_request(
        Method::PUT,
        &format!("/api/ssh/servers/{id}"),
        &token,
        update,
    );
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["data"]["name"], "New Name");
}

#[tokio::test]
async fn test_ssh_servers_delete() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let body = json!({
        "name": "Temp Server",
        "host": "5.6.7.8",
        "port": 22,
        "username": "test",
        "auth_method": {"type": "password"}
    });
    let req = authed_json_request(Method::POST, "/api/ssh/servers", &token, body);
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let id = json["data"]["id"].as_str().unwrap();

    let req = authed_request(Method::DELETE, &format!("/api/ssh/servers/{id}"), &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify deleted
    let req = authed_request(Method::GET, &format!("/api/ssh/servers/{id}"), &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_ssh_server_get_nonexistent() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let fake_id = "00000000-0000-0000-0000-000000000099";
    let req = authed_request(Method::GET, &format!("/api/ssh/servers/{fake_id}"), &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

// ===========================================================================
//  PROCESSES
// ===========================================================================

#[tokio::test]
async fn test_processes_list_empty() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/processes", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"], json!([]));
}

// ===========================================================================
//  PORT MAPPINGS & SERVICE EXPOSURES (served via SshPlugin)
// ===========================================================================

#[tokio::test]
async fn test_port_mappings_list_empty() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/port-mappings", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"], json!([]));
}

#[tokio::test]
async fn test_service_exposures_list_empty() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/service-exposures", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let json = body_json(resp).await;
    assert_eq!(json["success"], true);
    assert_eq!(json["data"], json!([]));
}

// ===========================================================================
//  FULL FLOWS
// ===========================================================================

#[tokio::test]
async fn test_full_auth_flow() {
    let app = build_app();

    // 1. Check not initialized
    let req = Request::builder()
        .uri("/api/auth/status")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["data"]["initialized"], false);

    // 2. Setup password
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "secret"}).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 3. Login
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "secret"}).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let json = body_json(resp).await;
    let token = json["data"]["token"].as_str().unwrap().to_string();

    // 4. Access protected API
    let req = authed_request(Method::GET, "/api/tasks", &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 5. Logout
    let req = authed_request(Method::POST, "/api/auth/logout", &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 6. Verify token is now invalid
    let req = authed_request(Method::GET, "/api/tasks", &token);
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_full_ssh_server_lifecycle() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Create
    let body = json!({
        "name": "Lifecycle Server",
        "host": "ssh.prod.local",
        "port": 22,
        "username": "deploy",
        "auth_method": {"type": "password"}
    });
    let req = authed_json_request(Method::POST, "/api/ssh/servers", &token, body);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let json = body_json(resp).await;
    let id = json["data"]["id"].as_str().unwrap().to_string();

    // Read
    let req = authed_request(Method::GET, &format!("/api/ssh/servers/{id}"), &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let json = body_json(resp).await;
    assert_eq!(json["data"]["name"], "Lifecycle Server");

    // Update
    let update = json!({"name": "Updated Server", "port": 2222});
    let req = authed_json_request(
        Method::PUT,
        &format!("/api/ssh/servers/{id}"),
        &token,
        update,
    );
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let json = body_json(resp).await;
    assert_eq!(json["data"]["name"], "Updated Server");

    // Verify in list
    let req = authed_request(Method::GET, "/api/ssh/servers", &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let servers = json["data"].as_array().unwrap();
    assert_eq!(servers.len(), 1);

    // Delete
    let req = authed_request(Method::DELETE, &format!("/api/ssh/servers/{id}"), &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify deleted
    let req = authed_request(Method::GET, &format!("/api/ssh/servers/{id}"), &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // Verify empty list
    let req = authed_request(Method::GET, "/api/ssh/servers", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["data"], json!([]));
}

#[tokio::test]
async fn test_full_task_lifecycle() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Create
    let body = json!({
        "name": "DB Migration",
        "description": "Run schema migration",
        "priority": "high",
        "risk_level": "medium",
        "source": "user"
    });
    let req = authed_json_request(Method::POST, "/api/tasks", &token, body);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let json = body_json(resp).await;
    let id = json["data"]["id"].as_str().unwrap().to_string();
    assert_eq!(json["data"]["status"], "queued");

    // Get task
    let req = authed_request(Method::GET, &format!("/api/tasks/{id}"), &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["data"]["name"], "DB Migration");

    // Cancel task
    let req = authed_request(Method::POST, &format!("/api/tasks/{id}/cancel"), &token);
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let json = body_json(resp).await;
    assert_eq!(json["data"]["status"], "cancelled");

    // Verify in list
    let req = authed_request(Method::GET, "/api/tasks", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let tasks = json["data"].as_array().unwrap();
    assert!(tasks.iter().any(|t| t["id"].as_str() == Some(&id)));
}

#[tokio::test]
async fn test_multiple_concurrent_ssh_server_creates() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Fire multiple SSH server creations concurrently
    let mut handles = Vec::new();
    for i in 0..5 {
        let app_clone = app.clone();
        let token_clone = token.clone();
        let handle = tokio::spawn(async move {
            let body = json!({
                "name": format!("server-{i}"),
                "host": format!("ssh-{i}.local"),
                "port": 22,
                "username": "root",
                "auth_method": {"type": "password"}
            });
            let req = authed_json_request(Method::POST, "/api/ssh/servers", &token_clone, body);
            let resp = app_clone.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::CREATED);
        });
        handles.push(handle);
    }

    for h in handles {
        h.await.unwrap();
    }

    // Verify all created
    let req = authed_request(Method::GET, "/api/ssh/servers", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    let servers = json["data"].as_array().unwrap();
    assert_eq!(servers.len(), 5);
}

// ===========================================================================
//  EDGE CASES
// ===========================================================================

#[tokio::test]
async fn test_invalid_json_body() {
    let app = build_app();

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from("not json at all"))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    // Axum returns 400 or 422 for invalid JSON
    let status = resp.status().as_u16();
    assert!(
        status == 400 || status == 422,
        "expected 400 or 422, got {status}"
    );
}

#[tokio::test]
async fn test_nonexistent_api_route_gets_fallback() {
    let app = build_app();

    // Frontend fallback serves HTML for unknown routes
    let req = Request::builder()
        .uri("/api/nonexistent")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    // The fallback handler returns 200 with HTML (SPA fallback)
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_protected_route_with_invalid_token() {
    let app = build_app();
    // Setup auth so middleware enforces tokens
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/setup")
        .header("content-type", "application/json")
        .body(Body::from(json!({"password": "pw"}).to_string()))
        .unwrap();
    app.clone().oneshot(req).await.unwrap();

    let req = authed_request(Method::GET, "/api/tasks", "invalid-token-value");
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_storage_get_nonexistent_key() {
    let app = build_app();
    let token = setup_auth(&app).await;

    let req = authed_request(Method::GET, "/api/storage/someapp/nokey", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["success"], false);
}

#[tokio::test]
async fn test_auth_before_setup_allows_protected_routes() {
    // Before any password is set, auth middleware skips authentication
    let app = build_app();

    let req = Request::builder()
        .uri("/api/tasks")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    // Should be allowed (auth not initialized means middleware is bypassed)
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_health_check_has_version() {
    let app = build_app();

    let req = Request::builder()
        .uri("/api/health")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert!(json["data"]["version"].is_string());
}

#[tokio::test]
async fn test_storage_overwrite_value() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Set initial value
    let body = json!({"value": "initial"});
    let req = authed_json_request(Method::PUT, "/api/storage/app/k", &token, body);
    app.clone().oneshot(req).await.unwrap();

    // Overwrite
    let body = json!({"value": "updated"});
    let req = authed_json_request(Method::PUT, "/api/storage/app/k", &token, body);
    app.clone().oneshot(req).await.unwrap();

    // Verify new value
    let req = authed_request(Method::GET, "/api/storage/app/k", &token);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["data"]["value"], "updated");
}

#[tokio::test]
async fn test_storage_set_missing_value_field() {
    let app = build_app();
    let token = setup_auth(&app).await;

    // Body without 'value' field
    let body = json!({"wrong_field": "data"});
    let req = authed_json_request(Method::PUT, "/api/storage/app/key", &token, body);
    let resp = app.oneshot(req).await.unwrap();
    let json = body_json(resp).await;
    assert_eq!(json["success"], false);
}
