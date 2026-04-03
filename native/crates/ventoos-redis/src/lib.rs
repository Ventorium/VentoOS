/// `VentoOS` Redis adapter.
///
/// Supports Redis Standalone, Sentinel, and Cluster modes.
/// Provides key browsing, value editing, command execution, Pub/Sub, and MONITOR.
pub mod batch;
pub mod cluster;
pub mod manager;
pub mod monitor;
pub mod pubsub;
pub mod resp;
pub mod routes;
pub mod sentinel;
pub mod stats;
pub mod stream;
pub mod tls;
pub mod types;

pub use manager::RedisManager;
pub use resp::RespValue;
pub use routes::RedisPlugin;
pub use types::*;
