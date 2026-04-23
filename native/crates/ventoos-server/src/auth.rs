use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use tracing::warn;

use ventoos_core::auth::{AuthStatus, ChangePasswordRequest, LoginRequest, LoginResponse};
use ventoos_core::types::ApiResponse;
use ventoos_persist::Database;

/// Simple token-based auth manager (single user).
/// Tokens are persisted in the database for survival across restarts.
#[derive(Clone)]
pub struct AuthManager {
    db: Arc<Database>,
}

/// Token validity duration in seconds (24 hours).
const TOKEN_TTL: u64 = 86400;

/// `FileProvider` internal token validity: 10 years.
const FILEPROVIDER_TOKEN_TTL: u64 = 10 * 365 * 86400;

impl AuthManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Ensure a long-lived internal token exists for the `FileProvider` extension.
    /// Returns the token string. Creates one if not already present.
    pub fn ensure_fileprovider_token(&self) -> Result<String, String> {
        // Check if a FileProvider token already exists and is still valid
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let existing: Option<String> = self
            .db
            .with_conn(|conn| {
                Ok(conn
                    .query_row(
                        "SELECT token FROM auth_tokens WHERE token LIKE 'fp_%' AND expires_at > ?1 LIMIT 1",
                        rusqlite::params![i64::try_from(now).unwrap_or(i64::MAX)],
                        |row| row.get(0),
                    )
                    .ok())
            })
            .ok()
            .flatten();

        if let Some(token) = existing {
            return Ok(token);
        }

        // Generate a new long-lived token with a recognizable prefix
        let token = format!("fp_{}", generate_token());
        let expires_at = now + FILEPROVIDER_TOKEN_TTL;

        self.db
            .with_conn(|conn| {
                conn.execute(
                    "INSERT INTO auth_tokens (token, expires_at, created_at) VALUES (?1, ?2, ?3)",
                    rusqlite::params![&token, i64::try_from(expires_at).unwrap_or(i64::MAX), i64::try_from(now).unwrap_or(i64::MAX)],
                )
            })
            .map_err(|e| e.to_string())?;

        Ok(token)
    }

    /// Ensure the `FileProvider` token file exists at `~/Library/VentoOS/.fp-token`
    /// AND inside the extension's sandbox container so the sandboxed extension can read it.
    /// Called during server startup so the `FileProvider` extension can authenticate.
    pub fn ensure_fileprovider_token_file(&self) {
        let token = match self.ensure_fileprovider_token() {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Failed to generate FileProvider token: {e}");
                return;
            }
        };

        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());

        // Write to VentoOS data dir
        let dir = std::path::Path::new(&home).join("Library/VentoOS");
        if let Err(e) = std::fs::create_dir_all(&dir) {
            tracing::error!("Failed to create VentoOS dir: {e}");
        } else if let Err(e) = std::fs::write(dir.join(".fp-token"), &token) {
            tracing::error!("Failed to write FileProvider token file: {e}");
        }

        // Also write inside the extension's sandbox container so the sandboxed
        // extension process can read it (it cannot access ~/Library/VentoOS/).
        // The FileProvider extension has its OWN container (io.ventoos.VentoFS.FileProvider)
        // separate from the host app's container (io.ventoos.VentoFS).
        for container_id in &[
            "Library/Containers/io.ventoos.VentoFS/Data",
            "Library/Containers/io.ventoos.VentoFS.FileProvider/Data",
        ] {
            let container_dir = std::path::Path::new(&home).join(container_id);
            // Ensure the container directory exists — it may not have been created yet
            // if the FileProvider extension has never been launched.
            if let Err(e) = std::fs::create_dir_all(&container_dir) {
                tracing::error!("Failed to create container dir {}: {e}", container_id);
                continue;
            }
            if let Err(e) = std::fs::write(container_dir.join(".fp-token"), &token) {
                tracing::error!("Failed to write FileProvider token to {}: {e}", container_id);
            } else {
                tracing::info!("FileProvider token written to {}", container_id);
            }
        }

        tracing::info!("FileProvider token ensured");
    }

    /// Check if a password has been set up yet.
    pub fn is_initialized(&self) -> bool {
        self.db
            .with_conn(|conn| {
                let mut stmt =
                    conn.prepare("SELECT value FROM settings WHERE key = 'password_hash'")?;
                let result: Result<String, _> = stmt.query_row([], |row| row.get(0));
                Ok(result.is_ok())
            })
            .unwrap_or(false)
    }

    /// Set initial password (only if not initialized).
    pub fn setup_password(&self, password: &str) -> Result<(), String> {
        if self.is_initialized() {
            return Err("Password already set".to_string());
        }
        let hash = bcrypt::hash(password, 10).map_err(|e| e.to_string())?;
        self.db
            .with_conn(|conn| {
                conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES ('password_hash', ?1)",
                    [&hash],
                )?;
                Ok(())
            })
            .map_err(|e| e.to_string())
    }

    /// Verify password and return a token.
    pub fn login(&self, password: &str) -> Result<String, String> {
        let hash: String = self
            .db
            .with_conn(|conn| {
                let mut stmt =
                    conn.prepare("SELECT value FROM settings WHERE key = 'password_hash'")?;
                stmt.query_row([], |row| row.get(0))
                    .map_err(|_| rusqlite::Error::QueryReturnedNoRows)
            })
            .map_err(|_| "Password not initialized".to_string())?;

        if !bcrypt::verify(password, &hash).unwrap_or(false) {
            return Err("Invalid password".to_string());
        }

        let token = generate_token();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let expires_at = now + TOKEN_TTL;

        // Clean expired tokens first
        self.cleanup_expired_tokens();

        // Store token in database
        self.db
            .with_conn(|conn| {
                conn.execute(
                    "INSERT INTO auth_tokens (token, expires_at, created_at) VALUES (?1, ?2, ?3)",
                    rusqlite::params![&token, i64::try_from(expires_at).unwrap_or(i64::MAX), i64::try_from(now).unwrap_or(i64::MAX)],
                )
            })
            .map_err(|e| e.to_string())?;

        Ok(token)
    }

    /// Change password.
    pub fn change_password(&self, current: &str, new_password: &str) -> Result<(), String> {
        let hash: String = self
            .db
            .with_conn(|conn| {
                let mut stmt =
                    conn.prepare("SELECT value FROM settings WHERE key = 'password_hash'")?;
                stmt.query_row([], |row| row.get(0))
                    .map_err(|_| rusqlite::Error::QueryReturnedNoRows)
            })
            .map_err(|_| "Password not initialized".to_string())?;

        if !bcrypt::verify(current, &hash).unwrap_or(false) {
            return Err("Current password is incorrect".to_string());
        }

        let new_hash = bcrypt::hash(new_password, 10).map_err(|e| e.to_string())?;
        self.db
            .with_conn(|conn| {
                conn.execute(
                    "UPDATE settings SET value = ?1 WHERE key = 'password_hash'",
                    [&new_hash],
                )?;
                Ok(())
            })
            .map_err(|e| e.to_string())?;

        // Invalidate all tokens
        self.db
            .with_conn(|conn| conn.execute("DELETE FROM auth_tokens", []))
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Validate a token.
    pub fn validate_token(&self, token: &str) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        self.db
            .with_conn(|conn| {
                let count: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM auth_tokens WHERE token = ?1 AND expires_at > ?2",
                    rusqlite::params![token, i64::try_from(now).unwrap_or(i64::MAX)],
                    |row| row.get(0),
                )?;
                Ok(count > 0)
            })
            .unwrap_or(false)
    }

    /// Logout — remove a token.
    pub fn logout(&self, token: &str) {
        let _ = self.db.with_conn(|conn| {
            conn.execute("DELETE FROM auth_tokens WHERE token = ?1", [token])
        });
    }

    /// Clean up expired tokens.
    fn cleanup_expired_tokens(&self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let _ = self.db.with_conn(|conn| {
            conn.execute("DELETE FROM auth_tokens WHERE expires_at <= ?1", [i64::try_from(now).unwrap_or(i64::MAX)])
        });
    }

    /// Get auth status.
    pub fn status(&self) -> AuthStatus {
        AuthStatus {
            initialized: self.is_initialized(),
            locked: true, // Always locked until authenticated
        }
    }
}

fn generate_token() -> String {
    use base64::Engine;
    use rand::Rng;
    let mut rng = rand::rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.random::<u8>()).collect();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&bytes)
}

// --- Route handlers ---

pub async fn auth_status(State(auth): State<AuthManager>) -> Json<ApiResponse<AuthStatus>> {
    Json(ApiResponse::ok(auth.status()))
}

pub async fn auth_setup(
    State(auth): State<AuthManager>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    match auth.setup_password(&req.password) {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"initialized": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(e))).into_response(),
    }
}

pub async fn auth_login(
    State(auth): State<AuthManager>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    match auth.login(&req.password) {
        Ok(token) => Json(ApiResponse::ok(LoginResponse { token })).into_response(),
        Err(e) => (StatusCode::UNAUTHORIZED, Json(ApiResponse::<()>::err(e))).into_response(),
    }
}

pub async fn auth_logout(State(auth): State<AuthManager>, req: Request<Body>) -> impl IntoResponse {
    if let Some(token) = extract_token(&req) {
        auth.logout(&token);
    }
    Json(ApiResponse::ok(serde_json::json!({"logged_out": true})))
}

pub async fn auth_change_password(
    State(auth): State<AuthManager>,
    Json(req): Json<ChangePasswordRequest>,
) -> impl IntoResponse {
    match auth
        .change_password(&req.current_password, &req.new_password)
    {
        Ok(()) => Json(ApiResponse::ok(serde_json::json!({"changed": true}))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(e))).into_response(),
    }
}

/// Auth middleware — checks Bearer token on protected routes.
pub async fn auth_middleware(
    State(auth): State<AuthManager>,
    req: Request<Body>,
    next: Next,
) -> Response {
    // Skip auth if not initialized (first-time setup)
    if !auth.is_initialized() {
        return next.run(req).await;
    }

    // Skip VentoOS auth for WebDAV paths — WebDAV has its own Basic Auth
    if req.uri().path().starts_with("/webdav") {
        return next.run(req).await;
    }

    let token = extract_token(&req);
    match token {
        Some(t) if auth.validate_token(&t) => next.run(req).await,
        _ => {
            warn!("Unauthorized request to {}", req.uri().path());
            (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<()>::err("Unauthorized")),
            )
                .into_response()
        }
    }
}

fn extract_token(req: &Request<Body>) -> Option<String> {
    // 1. Try Authorization header first
    if let Some(token) = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(ToString::to_string)
    {
        return Some(token);
    }

    // 2. Fallback to query parameter (needed for WebSocket which cannot set headers)
    req.uri().query().and_then(|q| {
        q.split('&').find_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            (k == "token").then(|| v.to_string())
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_auth_flow() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let auth = AuthManager::new(db);

        // Not initialized
        assert!(!auth.is_initialized());

        // Setup password
        auth.setup_password("test123").unwrap();
        assert!(auth.is_initialized());

        // Can't setup again
        assert!(auth.setup_password("other").is_err());

        // Login with wrong password
        assert!(auth.login("wrong").is_err());

        // Login with correct password
        let token = auth.login("test123").unwrap();
        assert!(!token.is_empty());

        // Validate token
        assert!(auth.validate_token(&token));

        // Invalid token
        assert!(!auth.validate_token("garbage"));

        // Logout
        auth.logout(&token);
        assert!(!auth.validate_token(&token));
    }

    #[tokio::test]
    async fn test_change_password() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let auth = AuthManager::new(db);

        auth.setup_password("old_pass").unwrap();
        let token = auth.login("old_pass").unwrap();

        // Change password
        auth.change_password("old_pass", "new_pass").unwrap();

        // Old token invalidated
        assert!(!auth.validate_token(&token));

        // Old password doesn't work
        assert!(auth.login("old_pass").is_err());

        // New password works
        let new_token = auth.login("new_pass").unwrap();
        assert!(auth.validate_token(&new_token));
    }
}
