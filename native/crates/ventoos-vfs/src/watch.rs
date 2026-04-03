//! File change watching with event streaming.
//!
//! - Local Provider: uses filesystem polling (avoids large `notify` dependency).
//! - Other Providers: periodic polling via list_dir comparisons.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::mpsc;

use crate::manager::VfsManager;
use crate::types::VfsListReq;

/// Type of file change event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WatchEventKind {
    Created,
    Modified,
    Deleted,
}

/// A file change event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchEvent {
    pub kind: WatchEventKind,
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

/// Handle to cancel a watch session.
pub struct WatchHandle {
    cancel: tokio::sync::oneshot::Sender<()>,
}

impl WatchHandle {
    pub fn cancel(self) {
        let _ = self.cancel.send(());
    }
}

/// Snapshot of a directory listing for change detection.
#[derive(Debug, Clone)]
struct DirSnapshot {
    /// Map of name -> (is_dir, size, modified)
    entries: HashMap<String, (bool, Option<u64>, Option<String>)>,
}

impl DirSnapshot {
    fn from_nodes(nodes: &[crate::types::VfsNode]) -> Self {
        let mut entries = HashMap::new();
        for n in nodes {
            entries.insert(n.name.clone(), (n.is_dir, n.size, n.modified.clone()));
        }
        Self { entries }
    }

    /// Compare with another snapshot and emit change events.
    fn diff(&self, newer: &DirSnapshot, base_path: &str) -> Vec<WatchEvent> {
        let mut events = Vec::new();

        // Check for created and modified
        for (name, (is_dir, size, modified)) in &newer.entries {
            let path = if base_path == "/" {
                format!("/{name}")
            } else {
                format!("{base_path}/{name}")
            };

            match self.entries.get(name) {
                None => {
                    events.push(WatchEvent {
                        kind: WatchEventKind::Created,
                        path,
                        name: name.clone(),
                        is_dir: *is_dir,
                    });
                }
                Some((_, old_size, old_modified)) => {
                    if old_size != size || old_modified != modified {
                        events.push(WatchEvent {
                            kind: WatchEventKind::Modified,
                            path,
                            name: name.clone(),
                            is_dir: *is_dir,
                        });
                    }
                }
            }
        }

        // Check for deleted
        for (name, (is_dir, _, _)) in &self.entries {
            if !newer.entries.contains_key(name) {
                let path = if base_path == "/" {
                    format!("/{name}")
                } else {
                    format!("{base_path}/{name}")
                };
                events.push(WatchEvent {
                    kind: WatchEventKind::Deleted,
                    path,
                    name: name.clone(),
                    is_dir: *is_dir,
                });
            }
        }

        events
    }
}

/// Start watching a directory for changes via polling.
/// Returns a WatchHandle to cancel and a receiver for events.
pub fn start_watch(
    mgr: Arc<VfsManager>,
    mount_id: String,
    path: String,
    poll_interval: std::time::Duration,
) -> (WatchHandle, mpsc::Receiver<WatchEvent>) {
    let (tx, rx) = mpsc::channel(64);
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

    tokio::spawn(async move {
        // Initial snapshot
        let req = VfsListReq {
            mount_id: mount_id.clone(),
            path: path.clone(),
            show_hidden: true,
        };
        let mut prev_snapshot = match mgr.list_dir(&req).await {
            Ok(nodes) => DirSnapshot::from_nodes(&nodes),
            Err(_) => DirSnapshot {
                entries: HashMap::new(),
            },
        };

        let mut interval = tokio::time::interval(poll_interval);
        loop {
            tokio::select! {
                _ = &mut cancel_rx => break,
                _ = interval.tick() => {
                    let req = VfsListReq {
                        mount_id: mount_id.clone(),
                        path: path.clone(),
                        show_hidden: true,
                    };
                    if let Ok(nodes) = mgr.list_dir(&req).await {
                        let new_snapshot = DirSnapshot::from_nodes(&nodes);
                        let events = prev_snapshot.diff(&new_snapshot, &path);
                        for event in events {
                            if tx.send(event).await.is_err() {
                                return;
                            }
                        }
                        prev_snapshot = new_snapshot;
                    }
                }
            }
        }
    });

    (WatchHandle { cancel: cancel_tx }, rx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::VfsNode;

    #[test]
    fn test_snapshot_diff_created() {
        let old = DirSnapshot {
            entries: HashMap::new(),
        };
        let new_nodes = vec![VfsNode {
            name: "test.txt".into(),
            path: "/test.txt".into(),
            is_dir: false,
            size: Some(100),
            modified: None,
            permissions: None,
        }];
        let newer = DirSnapshot::from_nodes(&new_nodes);
        let events = old.diff(&newer, "/");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, WatchEventKind::Created);
    }

    #[test]
    fn test_snapshot_diff_deleted() {
        let old_nodes = vec![VfsNode {
            name: "old.txt".into(),
            path: "/old.txt".into(),
            is_dir: false,
            size: Some(50),
            modified: None,
            permissions: None,
        }];
        let old = DirSnapshot::from_nodes(&old_nodes);
        let newer = DirSnapshot {
            entries: HashMap::new(),
        };
        let events = old.diff(&newer, "/");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, WatchEventKind::Deleted);
    }

    #[test]
    fn test_snapshot_diff_modified() {
        let old_nodes = vec![VfsNode {
            name: "file.txt".into(),
            path: "/file.txt".into(),
            is_dir: false,
            size: Some(100),
            modified: Some("2024-01-01".into()),
            permissions: None,
        }];
        let new_nodes = vec![VfsNode {
            name: "file.txt".into(),
            path: "/file.txt".into(),
            is_dir: false,
            size: Some(200),
            modified: Some("2024-01-02".into()),
            permissions: None,
        }];
        let old = DirSnapshot::from_nodes(&old_nodes);
        let newer = DirSnapshot::from_nodes(&new_nodes);
        let events = old.diff(&newer, "/");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, WatchEventKind::Modified);
    }
}
