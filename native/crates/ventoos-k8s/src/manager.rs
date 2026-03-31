use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing::{error, info};

use crate::k8s_client::{K8sClient, Kubeconfig, parse_resource_list, parse_single_resource};
use crate::types::{
    CreateK8sClusterReq, K8sCluster, K8sNamespace, K8sResource, K8sResourceKind,
    K8sResourceListReq, K8sTestResult, KubeconfigContext,
};

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

    /// Test connectivity to a cluster. Connects to the API server and fetches `/version`.
    pub async fn test_cluster(&self, id: &str) -> Option<K8sTestResult> {
        let cluster = self.clusters.read().await.get(id)?.clone();

        let kubeconfig_yaml = match self.load_kubeconfig(&cluster).await {
            Ok(yaml) => yaml,
            Err(msg) => {
                return Some(K8sTestResult {
                    success: false,
                    message: msg,
                    server_version: None,
                });
            }
        };

        let kc = match Kubeconfig::parse(&kubeconfig_yaml) {
            Ok(kc) => kc,
            Err(e) => {
                return Some(K8sTestResult {
                    success: false,
                    message: format!("Kubeconfig parse error: {e}"),
                    server_version: None,
                });
            }
        };

        let context_name = &cluster.context_name;
        let client = match K8sClient::from_kubeconfig(&kc, context_name).await {
            Ok(c) => c,
            Err(e) => {
                return Some(K8sTestResult {
                    success: false,
                    message: format!("Client build failed: {e}"),
                    server_version: None,
                });
            }
        };

        match client.get("/version").await {
            Ok(version_json) => {
                let git_version = version_json
                    .get("gitVersion")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                Some(K8sTestResult {
                    success: true,
                    message: "Connected to API server".into(),
                    server_version: git_version,
                })
            }
            Err(e) => {
                error!("test_cluster API call failed: {e}");
                Some(K8sTestResult {
                    success: false,
                    message: format!("API request failed: {e}"),
                    server_version: None,
                })
            }
        }
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

    /// List namespaces for a cluster by calling the K8s API.
    pub async fn list_namespaces(&self, cluster_id: &str) -> Result<Vec<K8sNamespace>, String> {
        let client = self.build_client(cluster_id).await?;

        let json = client.get("/api/v1/namespaces").await?;
        let items = json
            .get("items")
            .and_then(|v| v.as_array())
            .ok_or("Invalid namespaces response: missing items")?;

        let mut namespaces = Vec::new();
        for item in items {
            let name = item
                .pointer("/metadata/name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let status = item
                .pointer("/status/phase")
                .and_then(|v| v.as_str())
                .unwrap_or("Active")
                .to_string();
            if !name.is_empty() {
                namespaces.push(K8sNamespace { name, status });
            }
        }

        Ok(namespaces)
    }

    /// List resources of a given kind by querying the K8s API.
    pub async fn list_resources(
        &self,
        req: &K8sResourceListReq,
    ) -> Result<Vec<K8sResource>, String> {
        let client = self.build_client(&req.cluster_id).await?;

        let mut url = req.kind.list_url(req.namespace.as_deref());
        if let Some(ref selector) = req.label_selector {
            url.push_str("?labelSelector=");
            url.push_str(selector);
        }

        info!(
            "Listing {:?} in namespace {:?} for cluster {}",
            req.kind, req.namespace, req.cluster_id
        );

        let json = client.get(&url).await?;
        let kind_str = format!("{:?}", req.kind);
        Ok(parse_resource_list(&json, &kind_str))
    }

    /// Get a single resource's detail from the K8s API.
    pub async fn get_resource(
        &self,
        cluster_id: &str,
        kind: K8sResourceKind,
        namespace: Option<&str>,
        name: &str,
    ) -> Result<K8sResource, String> {
        let client = self.build_client(cluster_id).await?;

        let url = kind.get_url(namespace, name);
        info!("Getting {kind:?}/{name} in ns {namespace:?} for cluster {cluster_id}");

        let json = client.get(&url).await?;
        let kind_str = format!("{kind:?}");
        parse_single_resource(&json, &kind_str)
    }

    // ------- internal helpers -------

    /// Load kubeconfig YAML from cluster's file path or inline data.
    async fn load_kubeconfig(&self, cluster: &K8sCluster) -> Result<String, String> {
        if let Some(ref path) = cluster.kubeconfig_path {
            tokio::fs::read_to_string(path)
                .await
                .map_err(|e| format!("Read kubeconfig {path}: {e}"))
        } else if let Some(ref inline) = cluster.kubeconfig_inline {
            Ok(inline.clone())
        } else {
            Err("No kubeconfig path or inline config provided".into())
        }
    }

    /// Build a K8sClient for a registered cluster.
    async fn build_client(&self, cluster_id: &str) -> Result<K8sClient, String> {
        let cluster = self
            .clusters
            .read()
            .await
            .get(cluster_id)
            .cloned()
            .ok_or("Cluster not found")?;

        let yaml = self.load_kubeconfig(&cluster).await?;
        let kc = Kubeconfig::parse(&yaml)?;
        K8sClient::from_kubeconfig(&kc, &cluster.context_name).await
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
        let yaml = r"
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
";
        let contexts = K8sManager::parse_kubeconfig_yaml(yaml).unwrap();
        assert_eq!(contexts.len(), 2);
        assert_eq!(contexts[0].name, "dev");
        assert_eq!(contexts[0].cluster, "dev-cluster");
        assert_eq!(contexts[0].user, "dev-user");
        assert_eq!(contexts[0].namespace, Some("development".into()));
        assert_eq!(contexts[1].name, "prod");
    }
}
