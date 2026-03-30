use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use tokio::sync::RwLock;
use ventoos_core::process::{CreateProcessRequest, ProcessStatus, VProcess};

/// In-memory manager for virtual OS processes.
///
/// Each open application window creates one process. The manager assigns
/// monotonically increasing PIDs and tracks running/suspended/terminated state.
#[derive(Debug, Default)]
pub struct ProcessManager {
    next_pid: AtomicU32,
    processes: Arc<RwLock<HashMap<u32, VProcess>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            next_pid: AtomicU32::new(1),
            processes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Spawn a new process for a window. Returns the assigned PID.
    pub async fn create(&self, req: CreateProcessRequest) -> VProcess {
        let pid = self.next_pid.fetch_add(1, Ordering::Relaxed);
        let proc = VProcess {
            pid,
            app_id: req.app_id,
            window_id: req.window_id,
            status: ProcessStatus::Running,
            created_at: chrono::Utc::now(),
            context: serde_json::Value::Null,
        };
        self.processes.write().await.insert(pid, proc.clone());
        proc
    }

    /// List all non-terminated processes.
    pub async fn list(&self) -> Vec<VProcess> {
        self.processes
            .read()
            .await
            .values()
            .filter(|p| p.status != ProcessStatus::Terminated)
            .cloned()
            .collect()
    }

    /// Get a single process by PID.
    #[allow(dead_code)]
    pub async fn get(&self, pid: u32) -> Option<VProcess> {
        self.processes.read().await.get(&pid).cloned()
    }

    /// Suspend a running process (e.g., when window is minimized).
    pub async fn suspend(&self, pid: u32) -> bool {
        let mut map = self.processes.write().await;
        let Some(proc) = map.get_mut(&pid) else {
            return false;
        };
        if proc.status == ProcessStatus::Running {
            proc.status = ProcessStatus::Suspended;
            return true;
        }
        false
    }

    /// Resume a suspended process.
    pub async fn resume(&self, pid: u32) -> bool {
        let mut map = self.processes.write().await;
        let Some(proc) = map.get_mut(&pid) else {
            return false;
        };
        if proc.status == ProcessStatus::Suspended {
            proc.status = ProcessStatus::Running;
            return true;
        }
        false
    }

    /// Terminate a process (mark as terminated — not removed from map for audit trail).
    pub async fn terminate(&self, pid: u32) -> bool {
        let mut map = self.processes.write().await;
        let Some(proc) = map.get_mut(&pid) else {
            return false;
        };
        if proc.status != ProcessStatus::Terminated {
            proc.status = ProcessStatus::Terminated;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_list() {
        let mgr = ProcessManager::new();
        let p = mgr
            .create(CreateProcessRequest {
                app_id: "kubernetes".to_string(),
                window_id: "win-1".to_string(),
            })
            .await;
        assert_eq!(p.pid, 1);
        assert_eq!(p.status, ProcessStatus::Running);

        let list = mgr.list().await;
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_suspend_resume() {
        let mgr = ProcessManager::new();
        let p = mgr
            .create(CreateProcessRequest {
                app_id: "database".to_string(),
                window_id: "win-2".to_string(),
            })
            .await;

        assert!(mgr.suspend(p.pid).await);
        let suspended = mgr.get(p.pid).await.unwrap();
        assert_eq!(suspended.status, ProcessStatus::Suspended);

        assert!(mgr.resume(p.pid).await);
        let resumed = mgr.get(p.pid).await.unwrap();
        assert_eq!(resumed.status, ProcessStatus::Running);
    }

    #[tokio::test]
    async fn test_terminate() {
        let mgr = ProcessManager::new();
        let p = mgr
            .create(CreateProcessRequest {
                app_id: "redis".to_string(),
                window_id: "win-3".to_string(),
            })
            .await;

        assert!(mgr.terminate(p.pid).await);
        let list = mgr.list().await;
        // Terminated processes not in list
        assert!(list.is_empty());
    }
}
