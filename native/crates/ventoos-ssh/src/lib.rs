/// `VentoOS` SSH management plugin.
///
/// Provides SSH server management, port mapping, and service exposure
/// as an independent `AppPlugin` crate.
pub mod manager;
pub mod routes;
pub mod types;

pub use manager::SshManager;
pub use routes::SshPlugin;
pub use types::*;
