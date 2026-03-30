/// VentoOS Redis adapter.
///
/// Supports Redis Standalone, Sentinel, and Cluster modes.
/// Provides key browsing, value editing, command execution, and monitoring.

pub mod manager;
pub mod types;

pub use manager::RedisManager;
pub use types::*;
