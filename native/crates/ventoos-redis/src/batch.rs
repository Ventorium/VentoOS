//! Batch operations.
//!
//! Provides pattern-based bulk operations: delete, set TTL, export.
//! Uses SCAN to iterate matching keys without blocking the server.

/// Maximum number of keys to process in a single batch.
pub const MAX_BATCH_KEYS: usize = 10_000;

/// Maximum number of keys to delete in a single DEL command.
pub const DEL_CHUNK_SIZE: usize = 100;
