use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::Result;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use ventoos_server::routes;
use ventoos_server::state::AppState;

#[tokio::main]
async fn main() -> Result<()> {
    install_rustls_crypto_provider();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ventoos=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting VentoOS server...");

    // Determine data directory
    let data_dir = dirs_data_dir();
    std::fs::create_dir_all(&data_dir)?;
    let system_dir = data_dir.join("system");
    std::fs::create_dir_all(&system_dir)?;
    let db_path = system_dir.join("system.db");

    // Initialize state
    let state = AppState::new(&db_path, &data_dir).await?;
    info!("Data directory: {}, database: {}", data_dir.display(), db_path.display());

    // Build router
    let app = routes::create_router(&state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .layer(axum::middleware::from_fn(cross_origin_isolation_headers));

    // Bind and serve
    let addr = SocketAddr::from(([0, 0, 0, 0], 5454));
    info!("Listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn cross_origin_isolation_headers(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    headers.insert(
        axum::http::header::HeaderName::from_static("cross-origin-opener-policy"),
        axum::http::header::HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        axum::http::header::HeaderName::from_static("cross-origin-embedder-policy"),
        axum::http::header::HeaderValue::from_static("require-corp"),
    );
    response
}

fn install_rustls_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn dirs_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("VENTOOS_DATA_DIR") {
        return PathBuf::from(dir);
    }
    PathBuf::from("./storage")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_install_rustls_crypto_provider_sets_default() {
        install_rustls_crypto_provider();
        assert!(
            rustls::crypto::CryptoProvider::get_default().is_some(),
            "server startup should install a rustls default CryptoProvider"
        );
    }
}
