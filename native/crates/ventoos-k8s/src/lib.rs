/// `VentoOS` Kubernetes adapter.
///
/// This crate provides Kubernetes cluster management, resource browsing,
/// log streaming, exec terminals, and port forwarding capabilities.
pub mod exec;
pub mod k8s_client;
pub mod log_stream;
pub mod manager;
pub mod port_forward;
pub mod routes;
pub mod service_bridge;
pub mod teleport;
pub mod types;

pub use manager::K8sManager;
pub use port_forward::PortForwardManager;
pub use routes::K8sPlugin;
pub use teleport::TeleportManager;
pub use types::*;
