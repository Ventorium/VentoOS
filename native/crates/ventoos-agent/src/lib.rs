/// `VentoOS` AI Agent subsystem.
///
/// Provides:
/// - **Provider**: Multi-provider LLM integration (OpenAI-compatible, Anthropic, Ollama).
/// - **Tool**: Tool definitions, registry, and executor trait for the 4 atomic tools
///   (read / write / edit / bash).
/// - **Tools**: Platform tool definitions (K8s, DB, Redis, VFS, System).
/// - **Executor**: Platform tool executor with per-tool handler dispatch.
/// - **Guard**: Security harness for tool execution (path guard, command guard, risk guard).
/// - **Agent**: ReAct execution loop with streaming output.
/// - **Session**: Chat session management with system prompt support.
pub mod agent;
pub mod channel;
pub mod executor;
pub mod guard;
pub mod manager;
pub mod provider;
pub mod routes;
pub mod session;
pub mod tool;
pub mod tools;
pub mod types;

pub use executor::PlatformToolExecutor;
pub use manager::AgentManager;
pub use routes::AgentPlugin;
pub use tool::ToolExecutor;
pub use types::*;
