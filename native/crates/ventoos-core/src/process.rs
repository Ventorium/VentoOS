use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Status of a virtual process managed by the OS kernel.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessStatus {
    Running,
    Suspended,
    Terminated,
}

/// A virtual process record — one per open application window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VProcess {
    /// Auto-incrementing process ID.
    pub pid: u32,
    /// Application identifier.
    pub app_id: String,
    /// Frontend window ID that spawned this process.
    pub window_id: String,
    /// Current status.
    pub status: ProcessStatus,
    /// When the process was created.
    pub created_at: DateTime<Utc>,
    /// Application-specific context (opaque JSON).
    #[serde(default)]
    pub context: serde_json::Value,
}

/// Request body for creating a new process.
#[derive(Debug, Deserialize)]
pub struct CreateProcessRequest {
    pub app_id: String,
    pub window_id: String,
}

/// Minimal response when a process is created.
#[derive(Debug, Serialize)]
pub struct CreateProcessResponse {
    pub pid: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_serialization() {
        let proc = VProcess {
            pid: 42,
            app_id: "kubernetes".to_string(),
            window_id: "win-1234-1".to_string(),
            status: ProcessStatus::Running,
            created_at: Utc::now(),
            context: serde_json::Value::Null,
        };
        let json = serde_json::to_string(&proc).unwrap();
        let deserialized: VProcess = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.pid, 42);
        assert_eq!(deserialized.status, ProcessStatus::Running);
    }
}
