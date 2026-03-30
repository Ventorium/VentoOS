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
    PersistentVolumeClaim,
    Namespace,
    Node,
    ServiceAccount,
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
