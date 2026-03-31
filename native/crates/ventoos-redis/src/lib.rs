/// `VentoOS` Redis adapter.
///
/// Supports Redis Standalone, Sentinel, and Cluster modes.
/// Provides key browsing, value editing, command execution, Pub/Sub, and MONITOR.
pub mod manager;
pub mod resp;
pub mod routes;
pub mod types;

pub use manager::RedisManager;
pub use resp::RespValue;
pub use routes::RedisPlugin;
pub use types::*;
