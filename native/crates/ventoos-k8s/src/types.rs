use serde::{Deserialize, Serialize};

/// A registered Kubernetes cluster context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sCluster {
    pub id: String,
    pub name: String,
    pub context_name: String,
    /// Path to kubeconfig file, if file-based.
    pub kubeconfig_path: Option<String>,
    /// Inline kubeconfig YAML (for paste-based import).
    pub kubeconfig_inline: Option<String>,
    pub server_url: Option<String>,
    pub namespace: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateK8sClusterReq {
    pub name: String,
    /// Path to kubeconfig file on server filesystem.
    pub kubeconfig_path: Option<String>,
    /// Raw kubeconfig YAML pasted by user.
    pub kubeconfig_inline: Option<String>,
    /// Context name to use (if kubeconfig has multiple).
    pub context_name: Option<String>,
    pub default_namespace: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateK8sClusterReq {
    pub name: Option<String>,
    pub kubeconfig_path: Option<String>,
    pub kubeconfig_inline: Option<String>,
    pub context_name: Option<String>,
    pub default_namespace: Option<String>,
}

/// Minimal representation for listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sNamespace {
    pub name: String,
    pub status: String,
}

/// Supported Kubernetes resource kind.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum K8sResourceKind {
    Pod,
    Deployment,
    Service,
    ConfigMap,
    Secret,
    Ingress,
    StatefulSet,
    DaemonSet,
    Job,
    CronJob,
    ReplicaSet,
    PersistentVolumeClaim,
    PersistentVolume,
    StorageClass,
    Namespace,
    Node,
    ServiceAccount,
    NetworkPolicy,
    Role,
    ClusterRole,
    RoleBinding,
    ClusterRoleBinding,
}

/// A single Kubernetes resource entry for listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sResource {
    pub name: String,
    pub namespace: Option<String>,
    pub kind: String,
    pub status: Option<String>,
    pub age: Option<String>,
    pub labels: Option<serde_json::Value>,
    pub annotations: Option<serde_json::Value>,
    /// Raw resource JSON/YAML for detail view.
    pub raw: Option<serde_json::Value>,
}

/// Request to list resources.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sResourceListReq {
    pub cluster_id: String,
    pub namespace: Option<String>,
    pub kind: K8sResourceKind,
    pub label_selector: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sTestResult {
    pub success: bool,
    pub message: String,
    pub server_version: Option<String>,
}

/// Parsed contexts from a kubeconfig file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubeconfigContext {
    pub name: String,
    pub cluster: String,
    pub user: String,
    pub namespace: Option<String>,
}

// ─── Log Stream Types ──────────────────────────────────────────────────────

/// Request parameters for Pod log streaming.
#[derive(Debug, Clone, Deserialize)]
pub struct PodLogStreamReq {
    pub namespace: Option<String>,
    pub container: Option<String>,
    pub tail_lines: Option<u64>,
    pub follow: Option<bool>,
    /// Regex filter pattern for log lines.
    pub filter: Option<String>,
    /// Label selector for multi-pod aggregation.
    pub label_selector: Option<String>,
}

/// A single log line entry.
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub pod: String,
    pub container: String,
    pub timestamp: Option<String>,
    pub message: String,
}

// ─── Exec Types ────────────────────────────────────────────────────────────

/// Request parameters for Pod exec.
#[derive(Debug, Clone, Deserialize)]
pub struct PodExecReq {
    pub container: Option<String>,
    pub command: Option<Vec<String>>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

/// WebSocket message for exec sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ExecMessage {
    /// Terminal input from the client.
    #[serde(rename = "stdin")]
    Stdin(String),
    /// Terminal output to the client.
    #[serde(rename = "stdout")]
    Stdout(String),
    /// Terminal resize.
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    /// Error message.
    #[serde(rename = "error")]
    Error(String),
    /// Session closed.
    #[serde(rename = "close")]
    Close,
}

// ─── Port-Forward Types ────────────────────────────────────────────────────

/// Request to create a port-forward.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePortForwardReq {
    pub pod_name: String,
    pub namespace: String,
    pub remote_port: u16,
    /// If None, a random port is assigned.
    pub local_port: Option<u16>,
}

/// Status of a port-forward.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PortForwardStatus {
    Active,
    Closing,
    Closed,
}

/// A running port-forward entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardInfo {
    pub id: String,
    pub cluster_id: String,
    pub pod_name: String,
    pub namespace: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub status: PortForwardStatus,
}

// ─── Resource Detail Types ─────────────────────────────────────────────────

/// A Kubernetes Event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sEvent {
    pub reason: Option<String>,
    pub message: Option<String>,
    #[serde(rename = "type")]
    pub event_type: Option<String>,
    pub count: Option<u32>,
    pub first_timestamp: Option<String>,
    pub last_timestamp: Option<String>,
    pub source: Option<String>,
}

/// A condition from a resource's status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sCondition {
    #[serde(rename = "type")]
    pub condition_type: String,
    pub status: String,
    pub reason: Option<String>,
    pub message: Option<String>,
    pub last_transition_time: Option<String>,
}

/// Resource detail including events, conditions, and annotations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sResourceDetail {
    pub resource: K8sResource,
    pub events: Vec<K8sEvent>,
    pub conditions: Vec<K8sCondition>,
}

// ─── Service Bridge Types ──────────────────────────────────────────────────

/// Detected service type.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DetectedServiceType {
    PostgreSQL,
    MySQL,
    Redis,
    Unknown,
}

/// Detection result for a K8s Service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceDetectResult {
    pub service_type: DetectedServiceType,
    pub port: u16,
    pub target_port: u16,
    pub annotations: Option<serde_json::Value>,
}

/// Result of bridging to a service (port-forward created).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceBridgeResult {
    pub service_type: DetectedServiceType,
    pub local_port: u16,
    pub remote_port: u16,
    pub forward_id: String,
}
