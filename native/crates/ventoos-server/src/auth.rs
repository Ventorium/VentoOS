use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use tokio::sync::RwLock;
use tracing::warn;

use ventoos_core::auth::{AuthStatus, ChangePasswordRequest, LoginRequest, LoginResponse};
use ventoos_core::types::ApiResponse;
use ventoos_persist::Database;

/// Simple token-based auth manager (single user).
#[derive(Clone)]
pub struct AuthManager {
    inner: Arc<AuthInner>,
}

struct AuthInner {
    db: Arc<Database>,
    /// Active tokens with expiry timestamps.
    tokens: RwLock<Vec<TokenEntry>>,
}

struct TokenEntry {
    token: String,
    expires_at: u64,
}

/// Token validity duration in seconds (24 hours).
const TOKEN_TTL: u64 = 86400;

impl AuthManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            inner: Arc::new(AuthInner {
                db,
                tokens: RwLock::new(Vec::new()),
            }),
        }
    }

    /// Check if a password has been set up yet.
    pub fn is_initialized(&self) -> bool {
        self.inner
            .db
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
        self.inner
            .db
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
    pub async fn login(&self, password: &str) -> Result<String, String> {
        let hash: String = self
            .inner
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

        let mut tokens = self.inner.tokens.write().await;
        // Clean expired tokens
        tokens.retain(|t| t.expires_at > now);
        tokens.push(TokenEntry {
            token: token.clone(),
            expires_at: now + TOKEN_TTL,
        });

        Ok(token)
    }

    /// Change password.
    pub async fn change_password(&self, current: &str, new_password: &str) -> Result<(), String> {
        let hash: String = self
            .inner
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
        self.inner
            .db
            .with_conn(|conn| {
                conn.execute(
                    "UPDATE settings SET value = ?1 WHERE key = 'password_hash'",
                    [&new_hash],
                )?;
                Ok(())
            })
            .map_err(|e| e.to_string())?;

        // Invalidate all tokens
        let mut tokens = self.inner.tokens.write().await;
        tokens.clear();

        Ok(())
    }

    /// Validate a token.
    pub async fn validate_token(&self, token: &str) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let tokens = self.inner.tokens.read().await;
        tokens
            .iter()
            .any(|t| t.token == token && t.expires_at > now)
    }

    /// Logout — remove a token.
    pub async fn logout(&self, token: &str) {
        let mut tokens = self.inner.tokens.write().await;
        tokens.retain(|t| t.token != token);
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
    match auth.login(&req.password).await {
        Ok(token) => Json(ApiResponse::ok(LoginResponse { token })).into_response(),
        Err(e) => (StatusCode::UNAUTHORIZED, Json(ApiResponse::<()>::err(e))).into_response(),
    }
}

pub async fn auth_logout(State(auth): State<AuthManager>, req: Request<Body>) -> impl IntoResponse {
    if let Some(token) = extract_token(&req) {
        auth.logout(&token).await;
    }
    Json(ApiResponse::ok(serde_json::json!({"logged_out": true})))
}

pub async fn auth_change_password(
    State(auth): State<AuthManager>,
    Json(req): Json<ChangePasswordRequest>,
) -> impl IntoResponse {
    match auth
        .change_password(&req.current_password, &req.new_password)
        .await
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

    let token = extract_token(&req);
    match token {
        Some(t) if auth.validate_token(&t).await => next.run(req).await,
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
        assert!(auth.login("wrong").await.is_err());

        // Login with correct password
        let token = auth.login("test123").await.unwrap();
        assert!(!token.is_empty());

        // Validate token
        assert!(auth.validate_token(&token).await);

        // Invalid token
        assert!(!auth.validate_token("garbage").await);

        // Logout
        auth.logout(&token).await;
        assert!(!auth.validate_token(&token).await);
    }

    #[tokio::test]
    async fn test_change_password() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let auth = AuthManager::new(db);

        auth.setup_password("old_pass").unwrap();
        let token = auth.login("old_pass").await.unwrap();

        // Change password
        auth.change_password("old_pass", "new_pass").await.unwrap();

        // Old token invalidated
        assert!(!auth.validate_token(&token).await);

        // Old password doesn't work
        assert!(auth.login("old_pass").await.is_err());

        // New password works
        let new_token = auth.login("new_pass").await.unwrap();
        assert!(auth.validate_token(&new_token).await);
    }
}
