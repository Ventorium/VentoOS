mod auth;
mod process_manager;
mod routes;
mod shell;
mod ssh_manager;
mod state;
mod websocket;

use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::Result;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::state::AppState;

#[tokio::main]
async fn main() -> Result<()> {
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
    let db_path = data_dir.join("ventoos.db");

    // Initialize state
    let state = AppState::new(&db_path)?;
    info!("Database initialized at {}", db_path.display());

    // Build router
    let app = routes::create_router(&state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    // Bind and serve
    let addr = SocketAddr::from(([0, 0, 0, 0], 5454));
    info!("Listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn dirs_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("VENTOOS_DATA_DIR") {
        return PathBuf::from(dir);
    }
    let base = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    base.join("ventoos")
}

fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Library").join("Application Support"))
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_DATA_HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var("HOME")
                    .ok()
                    .map(|h| PathBuf::from(h).join(".local").join("share"))
            })
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA").ok().map(PathBuf::from)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}
