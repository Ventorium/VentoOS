use axum::Router;
use std::future::Future;
use std::pin::Pin;

pub type PluginMessageFuture<'a> = Pin<
    Box<dyn Future<Output = Result<Option<serde_json::Value>, String>> + Send + 'a>,
>;

/// Application plugin trait.
///
/// Each application crate (K8s, DB, Redis, VFS, Agent) implements this trait
/// to declare its API routes and lifecycle hooks.  The server assembles all
/// plugins during startup and dynamically merges their routes into the main
/// router.
///
/// Implementations should call `.with_state(...)` on the returned `Router`
/// before returning so the top-level router receives a `Router<()>`.
pub trait AppPlugin: Send + Sync {
    /// Unique application identifier (e.g. `"kubernetes"`, `"database"`).
    fn app_id(&self) -> &'static str;

    /// HTTP API routes owned by this plugin.
    ///
    /// The returned `Router` **must** already have its state applied (via
    /// `.with_state()`), producing a `Router<()>`.
    fn routes(&self) -> Router;

    /// Called once when the server starts.
    fn init(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Ok(())
    }

    /// Called once when the server shuts down.
    fn shutdown(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Ok(())
    }

    /// Handle application-specific WebSocket messages.
    ///
    /// Returning `Ok(Some(payload))` means handled; `Ok(None)` means ignored.
    /// Returning `Err(message)` means handled with error.
    fn handle_ws_message<'a>(&'a self, _payload: &'a serde_json::Value) -> PluginMessageFuture<'a> {
        Box::pin(async { Ok(None) })
    }
}
