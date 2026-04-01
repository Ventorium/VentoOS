/// `VentoOS` AI Agent subsystem.
///
/// Provides:
/// - **Provider**: Multi-provider LLM integration (OpenAI-compatible, Anthropic, Ollama).
/// - **Tool**: Tool definitions, registry, and executor trait for the 4 atomic tools
///   (read / write / edit / bash).
/// - **Guard**: Security harness for tool execution (path guard, command guard).
/// - **Agent**: ReAct execution loop with streaming output.
/// - **Session**: Chat session management with system prompt support.
pub mod agent;
pub mod channel;
pub mod guard;
pub mod manager;
pub mod provider;
pub mod routes;
pub mod session;
pub mod tool;
pub mod types;

pub use manager::AgentManager;
pub use routes::AgentPlugin;
pub use tool::ToolExecutor;
pub use types::*;
