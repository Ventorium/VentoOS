/// `VentoOS` Database adapter.
///
/// Supports `PostgreSQL`, `MySQL`, and `SQLite` connections,
/// schema browsing, SQL execution, and data maintenance.
pub mod manager;
pub mod routes;
pub mod types;

pub use manager::DbManager;
pub use routes::DbPlugin;
pub use types::*;
