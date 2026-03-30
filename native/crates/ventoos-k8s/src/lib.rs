/// VentoOS Kubernetes adapter.
///
/// This crate provides Kubernetes cluster management, resource browsing,
/// log streaming, exec terminals, and port forwarding capabilities.
pub mod manager;
pub mod types;

pub use manager::K8sManager;
pub use types::*;
