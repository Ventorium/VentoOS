use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing::{error, info};
use ventoos_persist::{Database, K8sClusterStore, PersistedK8sCluster};
use ventoos_vfs::VfsManager;

use crate::k8s_client::{K8sClient, Kubeconfig, parse_resource_list, parse_single_resource};
use crate::types::{
    CreateK8sClusterReq, K8sCluster, K8sCondition, K8sEvent, K8sNamespace, K8sResource,
    K8sResourceDetail, K8sResourceKind, K8sResourceListReq, K8sTestResult, KubeconfigContext,
};

/// Kubernetes cluster manager.
/// Manages registered clusters, connects via kubeconfig, browses resources.
pub struct K8sManager {
    clusters: Arc<RwLock<HashMap<String, K8sCluster>>>,
    /// Optional VFS manager for resolving `vfs://<mount_id>/<path>` kubeconfig paths.
    vfs: Option<Arc<VfsManager>>,
    /// Optional persistence store for cluster configs.
    store: Option<K8sClusterStore>,
}

impl K8sManager {
    pub fn new() -> Self {
        Self {
            clusters: Arc::new(RwLock::new(HashMap::new())),
            vfs: None,
            store: None,
        }
    }

    pub fn new_with_vfs(vfs: Arc<VfsManager>) -> Self {
        Self {
            clusters: Arc::new(RwLock::new(HashMap::new())),
            vfs: Some(vfs),
            store: None,
        }
    }

    /// Create a manager with VFS support and DB persistence, loading existing clusters.
    pub async fn new_with_vfs_and_db(vfs: Arc<VfsManager>, db: Arc<Database>) -> Self {
        let store = K8sClusterStore::new(Arc::clone(&db));
        let mut clusters = HashMap::new();

        match store.load_all() {
            Ok(rows) => {
                for row in rows {
                    let cluster = K8sCluster {
                        id: row.id.clone(),
                        name: row.name,
                        context_name: row.context_name,
                        kubeconfig_path: row.kubeconfig_path,
                        kubeconfig_inline: row.kubeconfig_inline,
                        server_url: row.server_url,
                        namespace: row.namespace,
                        group: row.group_name,
                    };
                    clusters.insert(row.id, cluster);
                }
                info!("Loaded {} K8s clusters from DB", clusters.len());
            }
            Err(e) => {
                error!("Failed to load K8s clusters from DB: {e}");
            }
        }

        Self {
            clusters: Arc::new(RwLock::new(clusters)),
            vfs: Some(vfs),
            store: Some(store),
        }
    }

    /// Register a new cluster.
    /// If `context_name` is not specified, the kubeconfig's `current-context` is used.
    pub async fn create_cluster(&self, req: CreateK8sClusterReq) -> K8sCluster {
        let id = uuid::Uuid::new_v4().to_string();

        // Resolve context: use explicit value, or read current-context from kubeconfig.
        let context_name = if let Some(ctx) = req.context_name.filter(|s| !s.is_empty()) {
            ctx
        } else {
            // Build a temporary cluster stub to reuse load_kubeconfig logic.
            let stub = K8sCluster {
                id: id.clone(),
                name: String::new(),
                context_name: String::new(),
                kubeconfig_path: req.kubeconfig_path.clone(),
                kubeconfig_inline: req.kubeconfig_inline.clone(),
                server_url: None,
                namespace: None,
                group: req.group.clone(),
            };
            match self.load_kubeconfig(&stub).await {
                Ok(yaml) => Kubeconfig::parse(&yaml)
                    .ok()
                    .and_then(|kc| kc.current_context)
                    .unwrap_or_else(|| "default".into()),
                Err(_) => "default".into(),
            }
        };

        let cluster = K8sCluster {
            id: id.clone(),
            name: req.name,
            context_name,
            kubeconfig_path: req.kubeconfig_path,
            kubeconfig_inline: req.kubeconfig_inline,
            server_url: None,
            namespace: req.default_namespace,
            group: req.group,
        };
        self.clusters.write().await.insert(id, cluster.clone());

        // Persist to DB if store is available.
        if let Some(ref store) = self.store {
            let record = PersistedK8sCluster {
                id: cluster.id.clone(),
                name: cluster.name.clone(),
                context_name: cluster.context_name.clone(),
                kubeconfig_path: cluster.kubeconfig_path.clone(),
                kubeconfig_inline: cluster.kubeconfig_inline.clone(),
                server_url: cluster.server_url.clone(),
                namespace: cluster.namespace.clone(),
                group_name: cluster.group.clone(),
            };
            if let Err(e) = store.insert(&record) {
                error!("Failed to persist K8s cluster '{}': {e}", cluster.name);
            }
        }

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
        let removed = self.clusters.write().await.remove(id).is_some();
        if removed {
            if let Some(ref store) = self.store {
                if let Err(e) = store.delete(id) {
                    error!("Failed to delete K8s cluster '{id}' from DB: {e}");
                }
            }
        }
        removed
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

    /// Get resource YAML as a JSON string (raw K8s API response).
    pub async fn get_resource_yaml(
        &self,
        cluster_id: &str,
        kind: K8sResourceKind,
        namespace: Option<&str>,
        name: &str,
    ) -> Result<String, String> {
        let client = self.build_client(cluster_id).await?;
        let url = kind.get_url(namespace, name);
        let json = client.get(&url).await?;
        serde_json::to_string_pretty(&json).map_err(|e| format!("JSON serialise: {e}"))
    }

    /// Update a resource by PUTing the full YAML/JSON body.
    pub async fn update_resource_yaml(
        &self,
        cluster_id: &str,
        kind: K8sResourceKind,
        namespace: Option<&str>,
        name: &str,
        body: &str,
    ) -> Result<serde_json::Value, String> {
        let client = self.build_client(cluster_id).await?;
        let url = kind.get_url(namespace, name);
        info!("Updating {kind:?}/{name} in ns {namespace:?}");
        client.put_json(&url, body).await
    }

    /// Get events associated with a resource.
    pub async fn get_resource_events(
        &self,
        cluster_id: &str,
        kind: K8sResourceKind,
        namespace: Option<&str>,
        name: &str,
    ) -> Result<Vec<K8sEvent>, String> {
        let client = self.build_client(cluster_id).await?;
        let kind_str = format!("{kind:?}");
        let ns = namespace.unwrap_or("default");
        let field_selector = format!("involvedObject.name={name},involvedObject.kind={kind_str}");
        let url = format!("/api/v1/namespaces/{ns}/events?fieldSelector={field_selector}");

        let json = client.get(&url).await?;
        let items = json
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        Ok(items
            .iter()
            .map(|item| K8sEvent {
                reason: item
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                message: item
                    .get("message")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                event_type: item.get("type").and_then(|v| v.as_str()).map(String::from),
                count: item.get("count").and_then(|v| v.as_u64()).map(|n| n as u32),
                first_timestamp: item
                    .get("firstTimestamp")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                last_timestamp: item
                    .get("lastTimestamp")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                source: item
                    .pointer("/source/component")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            })
            .collect())
    }

    /// Get full resource detail: resource data + events + conditions.
    pub async fn get_resource_detail(
        &self,
        cluster_id: &str,
        kind: K8sResourceKind,
        namespace: Option<&str>,
        name: &str,
    ) -> Result<K8sResourceDetail, String> {
        let resource = self.get_resource(cluster_id, kind, namespace, name).await?;
        let events = self
            .get_resource_events(cluster_id, kind, namespace, name)
            .await
            .unwrap_or_default();

        // Extract conditions from raw resource
        let conditions = resource
            .raw
            .as_ref()
            .and_then(|raw| raw.pointer("/status/conditions"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|c| K8sCondition {
                        condition_type: c
                            .get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        status: c
                            .get("status")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        reason: c.get("reason").and_then(|v| v.as_str()).map(String::from),
                        message: c.get("message").and_then(|v| v.as_str()).map(String::from),
                        last_transition_time: c
                            .get("lastTransitionTime")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(K8sResourceDetail {
            resource,
            events,
            conditions,
        })
    }

    /// Scale a Deployment to the desired number of replicas.
    pub async fn scale_deployment(
        &self,
        cluster_id: &str,
        namespace: &str,
        name: &str,
        replicas: i32,
    ) -> Result<serde_json::Value, String> {
        let client = self.build_client(cluster_id).await?;
        let url = format!("/apis/apps/v1/namespaces/{namespace}/deployments/{name}");
        let body = serde_json::json!({"spec": {"replicas": replicas}}).to_string();
        client.patch_json(&url, &body).await
    }

    /// Restart a Deployment by updating its pod-template annotation.
    pub async fn restart_deployment(
        &self,
        cluster_id: &str,
        namespace: &str,
        name: &str,
    ) -> Result<serde_json::Value, String> {
        let client = self.build_client(cluster_id).await?;
        let url = format!("/apis/apps/v1/namespaces/{namespace}/deployments/{name}");
        let now = chrono::Utc::now().to_rfc3339();
        let body = serde_json::json!({
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": now
                        }
                    }
                }
            }
        })
        .to_string();
        client.patch_json(&url, &body).await
    }

    /// Cordon or uncordon a node.
    pub async fn cordon_node(
        &self,
        cluster_id: &str,
        name: &str,
        cordon: bool,
    ) -> Result<serde_json::Value, String> {
        let client = self.build_client(cluster_id).await?;
        let url = format!("/api/v1/nodes/{name}");
        let body = serde_json::json!({"spec": {"unschedulable": cordon}}).to_string();
        client.patch_json(&url, &body).await
    }

    /// Drain a node by cordoning it and evicting all pods.
    pub async fn drain_node(
        &self,
        cluster_id: &str,
        name: &str,
        force: bool,
        ignore_daemonsets: bool,
    ) -> Result<serde_json::Value, String> {
        let client = self.build_client(cluster_id).await?;

        // 1. Cordon
        self.cordon_node(cluster_id, name, true).await?;

        // 2. List pods on this node
        let url = format!("/api/v1/pods?fieldSelector=spec.nodeName={name}");
        let pod_list = client.get(&url).await?;
        let items = pod_list
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut evicted = 0;
        let mut skipped = 0;

        for item in items {
            let pod_name = item
                .pointer("/metadata/name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let pod_ns = item
                .pointer("/metadata/namespace")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string();
            let owner_kinds: Vec<String> = item
                .pointer("/metadata/ownerReferences")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|o| o.get("kind").and_then(|v| v.as_str()).map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            if pod_name.is_empty() {
                continue;
            }

            // Skip mirror pods (static pods)
            if owner_kinds.iter().any(|k| k == "Node") {
                skipped += 1;
                continue;
            }

            // Skip DaemonSet pods unless ignored
            if owner_kinds.iter().any(|k| k == "DaemonSet") && !ignore_daemonsets {
                skipped += 1;
                continue;
            }

            // Evict via policy/v1 Eviction
            let eviction_url = format!(
                "/api/v1/namespaces/{pod_ns}/pods/{pod_name}/eviction"
            );
            let eviction_body = serde_json::json!({
                "apiVersion": "policy/v1",
                "kind": "Eviction",
                "metadata": {
                    "name": pod_name,
                    "namespace": pod_ns
                },
                "deleteOptions": {
                    "gracePeriodSeconds": if force { Some(0i64) } else { None }
                }
            });
            match client
                .post_json(&eviction_url, &eviction_body.to_string())
                .await
            {
                Ok(_) => evicted += 1,
                Err(e) => {
                    if !force {
                        return Err(format!("Failed to evict {pod_ns}/{pod_name}: {e}"));
                    }
                    skipped += 1;
                }
            }
        }

        Ok(serde_json::json!({
            "cordoned": true,
            "evicted": evicted,
            "skipped": skipped
        }))
    }

    /// Build a shareable client Arc for WebSocket handlers.
    pub async fn build_shared_client(
        &self,
        cluster_id: &str,
    ) -> Result<std::sync::Arc<K8sClient>, String> {
        let client = self.build_client(cluster_id).await?;
        Ok(std::sync::Arc::new(client))
    }

    // ------- internal helpers -------

    /// Load kubeconfig YAML from cluster's file path or inline data.
    /// Supports `vfs://<mount_id>/<path>` URIs for VFS-mounted files.
    async fn load_kubeconfig(&self, cluster: &K8sCluster) -> Result<String, String> {
        if let Some(ref path) = cluster.kubeconfig_path {
            if let Some(rest) = path.strip_prefix("vfs://") {
                // Parse vfs://<mount_id>/<vfs_path>
                let (mount_id, vfs_path) = rest
                    .split_once('/')
                    .map(|(m, p)| (m, format!("/{p}")))
                    .ok_or_else(|| format!("Invalid VFS path: {path}"))?;
                let vfs = self
                    .vfs
                    .as_ref()
                    .ok_or("VFS manager not available for VFS kubeconfig path")?;
                let bytes = vfs.read_file_raw(mount_id, &vfs_path).await?;
                String::from_utf8(bytes)
                    .map_err(|e| format!("Kubeconfig is not valid UTF-8: {e}"))
            } else {
                tokio::fs::read_to_string(path)
                    .await
                    .map_err(|e| format!("Read kubeconfig {path}: {e}"))
            }
        } else if let Some(ref inline) = cluster.kubeconfig_inline {
            Ok(inline.clone())
        } else {
            Err("No kubeconfig path or inline config provided".into())
        }
    }

    /// Build a [`K8sClient`] for a registered cluster.
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
