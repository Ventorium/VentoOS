//! Platform Tool executor — routes tool calls by name to registered handler functions.
//!
//! The [`PlatformToolExecutor`] wraps an inner [`ToolExecutor`] (typically the built-in
//! stub/file executor) and adds platform tool dispatch on top.  Handler functions are
//! registered per tool name; unrecognised names fall through to the inner executor.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use serde_json::Value;

use crate::tool::ToolExecutor;

/// A function that handles a single tool call.
///
/// Signature: `(arguments) -> Result<Value, String>`.
pub type ToolHandlerFn =
    dyn Fn(Value) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send>> + Send + Sync;

/// Executor that routes tool calls to per-name handler functions.
///
/// Any tool name without a registered handler is forwarded to an inner
/// (fallback) executor — typically the `StubToolExecutor` or a file executor.
pub struct PlatformToolExecutor {
    handlers: HashMap<String, Arc<ToolHandlerFn>>,
    fallback: Arc<dyn ToolExecutor>,
}

impl PlatformToolExecutor {
    /// Create a new platform executor with a fallback for unknown tools.
    pub fn new(fallback: Arc<dyn ToolExecutor>) -> Self {
        Self {
            handlers: HashMap::new(),
            fallback,
        }
    }

    /// Register a handler for the given tool name.
    pub fn register(&mut self, name: impl Into<String>, handler: Arc<ToolHandlerFn>) {
        self.handlers.insert(name.into(), handler);
    }

    /// Convenience: register a handler from a closure.
    pub fn register_fn<F, Fut>(&mut self, name: impl Into<String>, f: F)
    where
        F: Fn(Value) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Value, String>> + Send + 'static,
    {
        let handler: Arc<ToolHandlerFn> = Arc::new(move |args| Box::pin(f(args)));
        self.register(name, handler);
    }
}

impl ToolExecutor for PlatformToolExecutor {
    fn execute(
        &self,
        name: &str,
        arguments: &Value,
    ) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send + '_>> {
        if let Some(handler) = self.handlers.get(name) {
            let handler = Arc::clone(handler);
            let args = arguments.clone();
            Box::pin(async move { handler(args).await })
        } else {
            self.fallback.execute(name, arguments)
        }
    }
}

/// Register stub handlers for all platform tools.
///
/// These stubs return descriptive JSON explaining what the tool *would* do,
/// useful as a default until real Manager implementations are wired in.
pub fn register_platform_stubs(executor: &mut PlatformToolExecutor) {
    use crate::tools::platform_tools;

    for tool in platform_tools() {
        let tool_name = tool.name.clone();
        let tool_desc = tool.description.clone();
        executor.register_fn(tool.name, move |args: Value| {
            let name = tool_name.clone();
            let desc = tool_desc.clone();
            async move {
                Ok(serde_json::json!({
                    "status": "not_connected",
                    "tool": name,
                    "description": desc,
                    "arguments": args,
                    "note": "Platform tool handler is not connected to a live manager. Configure the corresponding service to enable this tool."
                }))
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tool::StubToolExecutor;

    #[tokio::test]
    async fn test_platform_executor_fallback() {
        let fallback = Arc::new(StubToolExecutor);
        let executor = PlatformToolExecutor::new(fallback);
        // Unknown tool -> falls through to stub
        let result = executor
            .execute("read", &serde_json::json!({"path": "/tmp/x"}))
            .await;
        assert!(result.is_ok());
        let val = result.unwrap();
        assert_eq!(val["status"], "stub");
    }

    #[tokio::test]
    async fn test_platform_executor_registered_handler() {
        let fallback = Arc::new(StubToolExecutor);
        let mut executor = PlatformToolExecutor::new(fallback);
        executor.register_fn("k8s_list_clusters", |_args| async {
            Ok(serde_json::json!({"clusters": ["prod", "staging"]}))
        });

        let result = executor
            .execute("k8s_list_clusters", &serde_json::json!({}))
            .await;
        assert!(result.is_ok());
        let val = result.unwrap();
        assert_eq!(val["clusters"][0], "prod");
    }

    #[tokio::test]
    async fn test_platform_stubs_registered() {
        let fallback = Arc::new(StubToolExecutor);
        let mut executor = PlatformToolExecutor::new(fallback);
        register_platform_stubs(&mut executor);

        let result = executor
            .execute("k8s_list_clusters", &serde_json::json!({}))
            .await;
        assert!(result.is_ok());
        let val = result.unwrap();
        assert_eq!(val["status"], "not_connected");
        assert_eq!(val["tool"], "k8s_list_clusters");
    }
}
