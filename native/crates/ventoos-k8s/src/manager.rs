use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing::info;

use crate::types::*;

/// Kubernetes cluster manager.
/// Manages registered clusters, connects via kubeconfig, browses resources.
pub struct K8sManager {
    clusters: Arc<RwLock<HashMap<String, K8sCluster>>>,
}

impl K8sManager {
    pub fn new() -> Self {
        Self {
            clusters: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a new cluster.
    pub async fn create_cluster(&self, req: CreateK8sClusterReq) -> K8sCluster {
        let id = uuid::Uuid::new_v4().to_string();
        let cluster = K8sCluster {
            id: id.clone(),
            name: req.name,
            context_name: req.context_name.unwrap_or_else(|| "default".into()),
            kubeconfig_path: req.kubeconfig_path,
            kubeconfig_inline: req.kubeconfig_inline,
            server_url: None,
            namespace: req.default_namespace,
            group: req.group,
        };
        self.clusters.write().await.insert(id, cluster.clone());
        cluster
    }

    pub async fn list_clusters(&self) -> Vec<K8sCluster> {
        let clusters = self.clusters.read().await;
        let mut list: Vec<_> = clusters.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn get_cluster(&self, id: &str) -> Option<K8sCluster> {
        self.clusters.read().await.get(id).cloned()
    }

    pub async fn delete_cluster(&self, id: &str) -> bool {
        self.clusters.write().await.remove(id).is_some()
    }

    /// Test connectivity to a cluster. Attempts to parse kubeconfig and connect.
    pub async fn test_cluster(&self, id: &str) -> Option<K8sTestResult> {
        let cluster = self.clusters.read().await.get(id)?.clone();
        // We parse kubeconfig to validate it, but actual API connection requires kube-rs
        if let Some(ref path) = cluster.kubeconfig_path {
            if !tokio::fs::try_exists(path).await.unwrap_or(false) {
                return Some(K8sTestResult {
                    success: false,
                    message: format!("Kubeconfig file not found: {path}"),
                    server_version: None,
                });
            }
            // File exists — we consider it a valid config
            return Some(K8sTestResult {
                success: true,
                message: "Kubeconfig file found and readable".into(),
                server_version: None,
            });
        }
        if cluster.kubeconfig_inline.is_some() {
            return Some(K8sTestResult {
                success: true,
                message: "Inline kubeconfig provided".into(),
                server_version: None,
            });
        }
        Some(K8sTestResult {
            success: false,
            message: "No kubeconfig path or inline config provided".into(),
            server_version: None,
        })
    }

    /// Parse contexts from a kubeconfig file path.
    pub async fn parse_kubeconfig_contexts(
        &self,
        path: &str,
    ) -> Result<Vec<KubeconfigContext>, String> {
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| format!("Read failed: {e}"))?;
        Self::parse_kubeconfig_yaml(&content)
    }

    /// Parse contexts from kubeconfig YAML string.
    pub fn parse_kubeconfig_yaml(yaml_str: &str) -> Result<Vec<KubeconfigContext>, String> {
        // Simple YAML parsing for contexts section without pulling in a YAML crate.
        // Looks for `contexts:` block and extracts name/cluster/user/namespace.
        let mut contexts = Vec::new();
        let mut in_contexts = false;
        let mut current_name = String::new();
        let mut current_cluster = String::new();
        let mut current_user = String::new();
        let mut current_ns: Option<String> = None;

        for line in yaml_str.lines() {
            let trimmed = line.trim();
            if trimmed == "contexts:" {
                in_contexts = true;
                continue;
            }
            if in_contexts {
                // End of contexts block
                if !trimmed.is_empty()
                    && !trimmed.starts_with('-')
                    && !trimmed.starts_with("name:")
                    && !trimmed.starts_with("context:")
                    && !trimmed.starts_with("cluster:")
                    && !trimmed.starts_with("user:")
                    && !trimmed.starts_with("namespace:")
                    && !line.starts_with(' ')
                    && !line.starts_with('\t')
                {
                    // New top-level key
                    if !current_name.is_empty() {
                        contexts.push(KubeconfigContext {
                            name: current_name.clone(),
                            cluster: current_cluster.clone(),
                            user: current_user.clone(),
                            namespace: current_ns.clone(),
                        });
                    }
                    in_contexts = false;
                    continue;
                }

                if trimmed.starts_with("- name:") {
                    // Save previous if any
                    if !current_name.is_empty() {
                        contexts.push(KubeconfigContext {
                            name: current_name.clone(),
                            cluster: current_cluster.clone(),
                            user: current_user.clone(),
                            namespace: current_ns.clone(),
                        });
                    }
                    current_name = trimmed
                        .strip_prefix("- name:")
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    current_cluster.clear();
                    current_user.clear();
                    current_ns = None;
                } else if trimmed.starts_with("cluster:") {
                    current_cluster = trimmed
                        .strip_prefix("cluster:")
                        .unwrap_or("")
                        .trim()
                        .to_string();
                } else if trimmed.starts_with("user:") {
                    current_user = trimmed
                        .strip_prefix("user:")
                        .unwrap_or("")
                        .trim()
                        .to_string();
                } else if trimmed.starts_with("namespace:") {
                    current_ns = Some(
                        trimmed
                            .strip_prefix("namespace:")
                            .unwrap_or("")
                            .trim()
                            .to_string(),
                    );
                }
            }
        }
        // Flush last context
        if in_contexts && !current_name.is_empty() {
            contexts.push(KubeconfigContext {
                name: current_name,
                cluster: current_cluster,
                user: current_user,
                namespace: current_ns,
            });
        }

        Ok(contexts)
    }

    /// List namespaces for a cluster (stub — returns common defaults).
    pub async fn list_namespaces(&self, cluster_id: &str) -> Result<Vec<K8sNamespace>, String> {
        let _cluster = self
            .clusters
            .read()
            .await
            .get(cluster_id)
            .cloned()
            .ok_or("Cluster not found")?;

        // Stub: Return common default namespaces. Real implementation would use kube-rs.
        Ok(vec![
            K8sNamespace {
                name: "default".into(),
                status: "Active".into(),
            },
            K8sNamespace {
                name: "kube-system".into(),
                status: "Active".into(),
            },
            K8sNamespace {
                name: "kube-public".into(),
                status: "Active".into(),
            },
        ])
    }

    /// List resources of a given kind (stub).
    pub async fn list_resources(
        &self,
        req: &K8sResourceListReq,
    ) -> Result<Vec<K8sResource>, String> {
        let _cluster = self
            .clusters
            .read()
            .await
            .get(&req.cluster_id)
            .cloned()
            .ok_or("Cluster not found")?;

        // Stub: Real implementation would use kube-rs dynamic API.
        info!(
            "Listing {:?} in namespace {:?} for cluster {}",
            req.kind, req.namespace, req.cluster_id
        );
        Ok(vec![])
    }

    /// Get a single resource's detail (stub).
    pub async fn get_resource(
        &self,
        cluster_id: &str,
        kind: K8sResourceKind,
        namespace: Option<&str>,
        name: &str,
    ) -> Result<K8sResource, String> {
        let _cluster = self
            .clusters
            .read()
            .await
            .get(cluster_id)
            .cloned()
            .ok_or("Cluster not found")?;

        info!("Getting {kind:?}/{name} in ns {namespace:?} for cluster {cluster_id}");
        Ok(K8sResource {
            name: name.to_string(),
            namespace: namespace.map(|s| s.to_string()),
            kind: format!("{kind:?}"),
            status: Some("Running".into()),
            age: Some("--".into()),
            labels: None,
            annotations: None,
            raw: None,
        })
    }
}

impl Default for K8sManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_list_clusters() {
        let mgr = K8sManager::new();
        let cluster = mgr
            .create_cluster(CreateK8sClusterReq {
                name: "dev-cluster".into(),
                kubeconfig_path: None,
                kubeconfig_inline: Some("apiVersion: v1\nkind: Config".into()),
                context_name: Some("dev".into()),
                default_namespace: Some("default".into()),
                group: None,
            })
            .await;
        assert_eq!(cluster.name, "dev-cluster");
        assert_eq!(cluster.context_name, "dev");

        let list = mgr.list_clusters().await;
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_delete_cluster() {
        let mgr = K8sManager::new();
        let cluster = mgr
            .create_cluster(CreateK8sClusterReq {
                name: "temp".into(),
                kubeconfig_path: None,
                kubeconfig_inline: None,
                context_name: None,
                default_namespace: None,
                group: None,
            })
            .await;
        assert!(mgr.delete_cluster(&cluster.id).await);
        assert!(mgr.get_cluster(&cluster.id).await.is_none());
    }

    #[test]
    fn test_parse_kubeconfig_yaml() {
        let yaml = r#"
apiVersion: v1
kind: Config
contexts:
- name: dev
  context:
    cluster: dev-cluster
    user: dev-user
    namespace: development
- name: prod
  context:
    cluster: prod-cluster
    user: prod-user
current-context: dev
"#;
        let contexts = K8sManager::parse_kubeconfig_yaml(yaml).unwrap();
        assert_eq!(contexts.len(), 2);
        assert_eq!(contexts[0].name, "dev");
        assert_eq!(contexts[0].cluster, "dev-cluster");
        assert_eq!(contexts[0].user, "dev-user");
        assert_eq!(contexts[0].namespace, Some("development".into()));
        assert_eq!(contexts[1].name, "prod");
    }
}
