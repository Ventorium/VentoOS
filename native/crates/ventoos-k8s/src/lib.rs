/// `VentoOS` Kubernetes adapter.
///
/// This crate provides Kubernetes cluster management, resource browsing,
/// log streaming, exec terminals, and port forwarding capabilities.
pub mod k8s_client;
pub mod manager;
pub mod routes;
pub mod types;

pub use manager::K8sManager;
pub use routes::K8sPlugin;
pub use types::*;
