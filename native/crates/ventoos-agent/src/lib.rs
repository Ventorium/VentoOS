/// `VentoOS` AI Agent Bridge.
///
/// Adapts local agent engines (Claude Code, Codex, `OpenCode`) into
/// a unified tool/skill registration and execution framework.
pub mod manager;
pub mod routes;
pub mod types;

pub use manager::AgentManager;
pub use routes::AgentPlugin;
pub use types::*;
