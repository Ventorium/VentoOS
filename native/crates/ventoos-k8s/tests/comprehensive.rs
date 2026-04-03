//! Comprehensive tests for `ventoos-k8s` crate.
//!
//! Covers: kubeconfig parsing, K8s manager CRUD, resource types,
//! port-forward manager, log stream types, exec types, and edge cases.

use ventoos_k8s::k8s_client::{Kubeconfig, KubeconfigCluster, KubeconfigContextEntry, KubeconfigUser};
use ventoos_k8s::*;

// ═══════════════════════════════════════════════════════════════════════════
// Helper: sample kubeconfig YAML snippets
// ═══════════════════════════════════════════════════════════════════════════

fn single_context_kubeconfig() -> &'static str {
    r#"apiVersion: v1
kind: Config
clusters:
- name: my-cluster
  cluster:
    server: https://10.0.0.1:6443
    certificate-authority-data: LS0tLS1CRUdJTi...
users:
- name: my-user
  user:
    token: my-secret-token
contexts:
- name: my-context
  context:
    cluster: my-cluster
    user: my-user
    namespace: default
current-context: my-context
"#
}

fn multi_context_kubeconfig() -> &'static str {
    r#"apiVersion: v1
kind: Config
clusters:
- name: dev-cluster
  cluster:
    server: https://dev.example.com:6443
- name: prod-cluster
  cluster:
    server: https://prod.example.com:6443
users:
- name: dev-user
  user:
    token: dev-token
- name: prod-user
  user:
    token: prod-token
contexts:
- name: dev
  context:
    cluster: dev-cluster
    user: dev-user
    namespace: dev-ns
- name: prod
  context:
    cluster: prod-cluster
    user: prod-user
    namespace: prod-ns
current-context: dev
"#
}

fn cert_auth_kubeconfig() -> &'static str {
    r#"apiVersion: v1
kind: Config
clusters:
- name: cert-cluster
  cluster:
    server: https://cert.example.com:6443
    certificate-authority-data: Y2EtZGF0YQ==
users:
- name: cert-user
  user:
    client-certificate-data: Y2xpZW50LWNlcnQ=
    client-key-data: Y2xpZW50LWtleQ==
contexts:
- name: cert-context
  context:
    cluster: cert-cluster
    user: cert-user
current-context: cert-context
"#
}

fn ca_file_kubeconfig() -> &'static str {
    r#"apiVersion: v1
kind: Config
clusters:
- name: file-cluster
  cluster:
    server: https://file.example.com:6443
    certificate-authority: /etc/kubernetes/pki/ca.crt
users:
- name: file-user
  user:
    client-certificate: /etc/kubernetes/pki/client.crt
    client-key: /etc/kubernetes/pki/client.key
contexts:
- name: file-context
  context:
    cluster: file-cluster
    user: file-user
"#
}

fn no_namespace_kubeconfig() -> &'static str {
    r#"apiVersion: v1
kind: Config
clusters:
- name: simple-cluster
  cluster:
    server: https://simple.example.com:6443
users:
- name: simple-user
  user:
    token: simple-token
contexts:
- name: simple-context
  context:
    cluster: simple-cluster
    user: simple-user
current-context: simple-context
"#
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. KUBECONFIG PARSER TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_01_parse_valid_single_context_kubeconfig() {
    let kc = Kubeconfig::parse(single_context_kubeconfig()).unwrap();
    assert_eq!(kc.clusters.len(), 1);
    assert_eq!(kc.users.len(), 1);
    assert_eq!(kc.contexts.len(), 1);

    assert_eq!(kc.clusters[0].name, "my-cluster");
    assert_eq!(kc.clusters[0].server, "https://10.0.0.1:6443");
    assert_eq!(kc.contexts[0].name, "my-context");
    assert_eq!(kc.contexts[0].cluster, "my-cluster");
    assert_eq!(kc.contexts[0].user, "my-user");
}

#[test]
fn test_02_parse_multi_context_kubeconfig() {
    let kc = Kubeconfig::parse(multi_context_kubeconfig()).unwrap();
    assert_eq!(kc.clusters.len(), 2);
    assert_eq!(kc.users.len(), 2);
    assert_eq!(kc.contexts.len(), 2);

    let names: Vec<&str> = kc.contexts.iter().map(|c| c.name.as_str()).collect();
    assert!(names.contains(&"dev"));
    assert!(names.contains(&"prod"));
}

#[test]
fn test_03_parse_kubeconfig_with_token_auth() {
    let kc = Kubeconfig::parse(single_context_kubeconfig()).unwrap();
    assert_eq!(kc.users.len(), 1);
    assert_eq!(kc.users[0].token.as_deref(), Some("my-secret-token"));
    assert!(kc.users[0].client_cert_data.is_none());
    assert!(kc.users[0].client_key_data.is_none());
}

#[test]
fn test_04_parse_kubeconfig_with_client_cert_auth() {
    let kc = Kubeconfig::parse(cert_auth_kubeconfig()).unwrap();
    assert_eq!(kc.users.len(), 1);
    let user = &kc.users[0];
    assert!(user.token.is_none());
    assert_eq!(user.client_cert_data.as_deref(), Some("Y2xpZW50LWNlcnQ="));
    assert_eq!(user.client_key_data.as_deref(), Some("Y2xpZW50LWtleQ=="));
}

#[test]
fn test_05_parse_kubeconfig_with_ca_data() {
    let kc = Kubeconfig::parse(cert_auth_kubeconfig()).unwrap();
    assert_eq!(kc.clusters[0].ca_data.as_deref(), Some("Y2EtZGF0YQ=="));
    assert!(kc.clusters[0].ca_file.is_none());
}

#[test]
fn test_06_parse_kubeconfig_with_ca_file_reference() {
    let kc = Kubeconfig::parse(ca_file_kubeconfig()).unwrap();
    assert_eq!(
        kc.clusters[0].ca_file.as_deref(),
        Some("/etc/kubernetes/pki/ca.crt")
    );
    assert!(kc.clusters[0].ca_data.is_none());
}

#[test]
fn test_07_parse_kubeconfig_with_current_context() {
    let kc = Kubeconfig::parse(single_context_kubeconfig()).unwrap();
    assert_eq!(kc.current_context.as_deref(), Some("my-context"));

    let kc2 = Kubeconfig::parse(multi_context_kubeconfig()).unwrap();
    assert_eq!(kc2.current_context.as_deref(), Some("dev"));
}

#[test]
fn test_08_parse_empty_kubeconfig_returns_empty() {
    // Minimal valid kubeconfig with no clusters/users/contexts
    let yaml = "apiVersion: v1\nkind: Config\n";
    let kc = Kubeconfig::parse(yaml).unwrap();
    assert!(kc.clusters.is_empty());
    assert!(kc.users.is_empty());
    assert!(kc.contexts.is_empty());
    assert!(kc.current_context.is_none());
}

#[test]
fn test_09_parse_completely_empty_string() {
    // Empty string should parse without panic
    let kc = Kubeconfig::parse("").unwrap();
    assert!(kc.clusters.is_empty());
    assert!(kc.users.is_empty());
    assert!(kc.contexts.is_empty());
}

#[test]
fn test_10_parse_kubeconfig_with_namespace_in_context() {
    let kc = Kubeconfig::parse(single_context_kubeconfig()).unwrap();
    assert_eq!(kc.contexts[0].namespace.as_deref(), Some("default"));

    // Without namespace
    let kc2 = Kubeconfig::parse(no_namespace_kubeconfig()).unwrap();
    assert!(kc2.contexts[0].namespace.is_none());
}

#[test]
fn test_11_parse_kubeconfig_with_all_optional_fields() {
    let yaml = r#"apiVersion: v1
kind: Config
clusters:
- name: full-cluster
  cluster:
    server: https://full.example.com:6443
    certificate-authority-data: Y2EtZnVsbA==
    certificate-authority: /path/to/ca.crt
users:
- name: full-user
  user:
    token: full-token
    client-certificate-data: Y2VydC1kYXRh
    client-key-data: a2V5LWRhdGE=
    client-certificate: /path/to/cert.crt
    client-key: /path/to/key.pem
contexts:
- name: full-context
  context:
    cluster: full-cluster
    user: full-user
    namespace: kube-system
current-context: full-context
"#;
    let kc = Kubeconfig::parse(yaml).unwrap();
    assert_eq!(kc.clusters.len(), 1);
    assert_eq!(kc.users.len(), 1);
    assert_eq!(kc.contexts.len(), 1);

    let cluster = &kc.clusters[0];
    assert_eq!(cluster.server, "https://full.example.com:6443");
    assert!(cluster.ca_data.is_some());
    // Note: the parser may overwrite ca_data with ca_file or keep both;
    // we just verify at least one is present.

    let user = &kc.users[0];
    assert_eq!(user.name, "full-user");
    // Token should be present
    assert_eq!(user.token.as_deref(), Some("full-token"));

    let ctx = &kc.contexts[0];
    assert_eq!(ctx.namespace.as_deref(), Some("kube-system"));
}

#[test]
fn test_11b_parse_kubeconfig_with_cert_file_refs() {
    let kc = Kubeconfig::parse(ca_file_kubeconfig()).unwrap();
    let user = &kc.users[0];
    assert_eq!(
        user.client_cert_file.as_deref(),
        Some("/etc/kubernetes/pki/client.crt")
    );
    assert_eq!(
        user.client_key_file.as_deref(),
        Some("/etc/kubernetes/pki/client.key")
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. K8S MANAGER TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_12_create_cluster_minimal() {
    let mgr = K8sManager::new();
    let cluster = mgr
        .create_cluster(CreateK8sClusterReq {
            name: "test-cluster".into(),
            kubeconfig_path: None,
            kubeconfig_inline: None,
            context_name: None,
            default_namespace: None,
            group: None,
        })
        .await;

    assert_eq!(cluster.name, "test-cluster");
    assert!(!cluster.id.is_empty());
    // Default context name should be "default"
    assert_eq!(cluster.context_name, "default");
    assert!(cluster.kubeconfig_path.is_none());
    assert!(cluster.kubeconfig_inline.is_none());
    assert!(cluster.namespace.is_none());
    assert!(cluster.group.is_none());
}

#[tokio::test]
async fn test_13_create_cluster_all_fields() {
    let mgr = K8sManager::new();
    let cluster = mgr
        .create_cluster(CreateK8sClusterReq {
            name: "prod-cluster".into(),
            kubeconfig_path: Some("/home/user/.kube/config".into()),
            kubeconfig_inline: None,
            context_name: Some("prod-context".into()),
            default_namespace: Some("production".into()),
            group: Some("infrastructure".into()),
        })
        .await;

    assert_eq!(cluster.name, "prod-cluster");
    assert_eq!(cluster.context_name, "prod-context");
    assert_eq!(
        cluster.kubeconfig_path.as_deref(),
        Some("/home/user/.kube/config")
    );
    assert_eq!(cluster.namespace.as_deref(), Some("production"));
    assert_eq!(cluster.group.as_deref(), Some("infrastructure"));
}

#[tokio::test]
async fn test_14_get_existing_cluster() {
    let mgr = K8sManager::new();
    let created = mgr
        .create_cluster(CreateK8sClusterReq {
            name: "get-test".into(),
            kubeconfig_path: None,
            kubeconfig_inline: None,
            context_name: None,
            default_namespace: None,
            group: None,
        })
        .await;

    let fetched = mgr.get_cluster(&created.id).await;
    assert!(fetched.is_some());
    let fetched = fetched.unwrap();
    assert_eq!(fetched.id, created.id);
    assert_eq!(fetched.name, "get-test");
}

#[tokio::test]
async fn test_15_get_nonexisting_cluster_returns_none() {
    let mgr = K8sManager::new();
    let result = mgr.get_cluster("nonexistent-id-12345").await;
    assert!(result.is_none());
}

#[tokio::test]
async fn test_16_list_clusters() {
    let mgr = K8sManager::new();

    // Initially empty
    assert!(mgr.list_clusters().await.is_empty());

    mgr.create_cluster(CreateK8sClusterReq {
        name: "alpha".into(),
        kubeconfig_path: None,
        kubeconfig_inline: None,
        context_name: None,
        default_namespace: None,
        group: None,
    })
    .await;
    mgr.create_cluster(CreateK8sClusterReq {
        name: "beta".into(),
        kubeconfig_path: None,
        kubeconfig_inline: None,
        context_name: None,
        default_namespace: None,
        group: None,
    })
    .await;

    let list = mgr.list_clusters().await;
    assert_eq!(list.len(), 2);
    // list_clusters sorts by name
    assert_eq!(list[0].name, "alpha");
    assert_eq!(list[1].name, "beta");
}

#[tokio::test]
async fn test_17_delete_existing_cluster() {
    let mgr = K8sManager::new();
    let cluster = mgr
        .create_cluster(CreateK8sClusterReq {
            name: "to-delete".into(),
            kubeconfig_path: None,
            kubeconfig_inline: None,
            context_name: None,
            default_namespace: None,
            group: None,
        })
        .await;

    assert!(mgr.delete_cluster(&cluster.id).await);
    // After deletion, get should return None
    assert!(mgr.get_cluster(&cluster.id).await.is_none());
}

#[tokio::test]
async fn test_18_delete_nonexisting_cluster_returns_false() {
    let mgr = K8sManager::new();
    assert!(!mgr.delete_cluster("nonexistent").await);
}

#[tokio::test]
async fn test_19_default_trait() {
    let mgr = K8sManager::default();
    assert!(mgr.list_clusters().await.is_empty());
}

#[tokio::test]
async fn test_20_create_cluster_with_inline_kubeconfig() {
    let mgr = K8sManager::new();
    let cluster = mgr
        .create_cluster(CreateK8sClusterReq {
            name: "inline-cluster".into(),
            kubeconfig_path: None,
            kubeconfig_inline: Some(single_context_kubeconfig().into()),
            context_name: Some("my-context".into()),
            default_namespace: Some("default".into()),
            group: None,
        })
        .await;

    assert_eq!(cluster.name, "inline-cluster");
    assert!(cluster.kubeconfig_inline.is_some());
    assert!(cluster.kubeconfig_path.is_none());
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. K8S RESOURCE TYPE TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_21_all_resource_kind_variants_serialization() {
    let kinds = [
        K8sResourceKind::Pod,
        K8sResourceKind::Deployment,
        K8sResourceKind::Service,
        K8sResourceKind::ConfigMap,
        K8sResourceKind::Secret,
        K8sResourceKind::Ingress,
        K8sResourceKind::StatefulSet,
        K8sResourceKind::DaemonSet,
        K8sResourceKind::Job,
        K8sResourceKind::CronJob,
        K8sResourceKind::ReplicaSet,
        K8sResourceKind::PersistentVolumeClaim,
        K8sResourceKind::PersistentVolume,
        K8sResourceKind::StorageClass,
        K8sResourceKind::Namespace,
        K8sResourceKind::Node,
        K8sResourceKind::ServiceAccount,
        K8sResourceKind::NetworkPolicy,
        K8sResourceKind::Role,
        K8sResourceKind::ClusterRole,
        K8sResourceKind::RoleBinding,
        K8sResourceKind::ClusterRoleBinding,
    ];

    for kind in &kinds {
        let json = serde_json::to_string(kind).unwrap();
        assert!(!json.is_empty(), "Serialized {kind:?} should not be empty");

        // Roundtrip
        let deserialized: K8sResourceKind = serde_json::from_str(&json).unwrap();
        assert_eq!(*kind, deserialized);
    }
}

#[test]
fn test_21b_resource_kind_serde_lowercase() {
    // serde(rename_all = "lowercase")
    let json = serde_json::to_string(&K8sResourceKind::Pod).unwrap();
    assert_eq!(json, "\"pod\"");

    let json = serde_json::to_string(&K8sResourceKind::Deployment).unwrap();
    assert_eq!(json, "\"deployment\"");

    let json = serde_json::to_string(&K8sResourceKind::ConfigMap).unwrap();
    assert_eq!(json, "\"configmap\"");

    let json = serde_json::to_string(&K8sResourceKind::PersistentVolumeClaim).unwrap();
    assert_eq!(json, "\"persistentvolumeclaim\"");
}

#[test]
fn test_22_k8s_resource_all_fields() {
    let resource = K8sResource {
        name: "my-pod".into(),
        namespace: Some("default".into()),
        kind: "Pod".into(),
        status: Some("Running".into()),
        age: Some("5d".into()),
        labels: Some(serde_json::json!({"app": "web"})),
        annotations: Some(serde_json::json!({"note": "test"})),
        raw: Some(serde_json::json!({"spec": {}})),
    };

    let json = serde_json::to_string(&resource).unwrap();
    let roundtrip: K8sResource = serde_json::from_str(&json).unwrap();
    assert_eq!(roundtrip.name, "my-pod");
    assert_eq!(roundtrip.namespace.as_deref(), Some("default"));
    assert_eq!(roundtrip.status.as_deref(), Some("Running"));
    assert!(roundtrip.labels.is_some());
    assert!(roundtrip.annotations.is_some());
    assert!(roundtrip.raw.is_some());
}

#[test]
fn test_23_k8s_resource_minimal() {
    let resource = K8sResource {
        name: "minimal".into(),
        namespace: None,
        kind: "Node".into(),
        status: None,
        age: None,
        labels: None,
        annotations: None,
        raw: None,
    };

    let json = serde_json::to_string(&resource).unwrap();
    let roundtrip: K8sResource = serde_json::from_str(&json).unwrap();
    assert_eq!(roundtrip.name, "minimal");
    assert!(roundtrip.namespace.is_none());
    assert!(roundtrip.status.is_none());
}

#[test]
fn test_24_resource_list_req_with_label_selector() {
    let req = K8sResourceListReq {
        cluster_id: "cluster-1".into(),
        namespace: Some("default".into()),
        kind: K8sResourceKind::Pod,
        label_selector: Some("app=web,tier=frontend".into()),
    };

    let json = serde_json::to_string(&req).unwrap();
    let roundtrip: K8sResourceListReq = serde_json::from_str(&json).unwrap();
    assert_eq!(roundtrip.cluster_id, "cluster-1");
    assert_eq!(roundtrip.kind, K8sResourceKind::Pod);
    assert_eq!(
        roundtrip.label_selector.as_deref(),
        Some("app=web,tier=frontend")
    );
}

#[test]
fn test_25_test_result_success_and_failure() {
    let success = K8sTestResult {
        success: true,
        message: "Connected".into(),
        server_version: Some("v1.28.0".into()),
    };
    let json = serde_json::to_string(&success).unwrap();
    let rt: K8sTestResult = serde_json::from_str(&json).unwrap();
    assert!(rt.success);
    assert_eq!(rt.server_version.as_deref(), Some("v1.28.0"));

    let failure = K8sTestResult {
        success: false,
        message: "Connection refused".into(),
        server_version: None,
    };
    let json = serde_json::to_string(&failure).unwrap();
    let rt: K8sTestResult = serde_json::from_str(&json).unwrap();
    assert!(!rt.success);
    assert!(rt.server_version.is_none());
}

#[test]
fn test_26_k8s_namespace_serialization() {
    let ns = K8sNamespace {
        name: "kube-system".into(),
        status: "Active".into(),
    };
    let json = serde_json::to_string(&ns).unwrap();
    let rt: K8sNamespace = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.name, "kube-system");
    assert_eq!(rt.status, "Active");
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PORT-FORWARD MANAGER TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_27_create_port_forward_entry() {
    let mgr = PortForwardManager::new();
    let result = mgr
        .create(
            "cluster-1",
            &CreatePortForwardReq {
                pod_name: "my-pod".into(),
                namespace: "default".into(),
                remote_port: 8080,
                local_port: None, // random port
            },
        )
        .await;

    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.cluster_id, "cluster-1");
    assert_eq!(info.pod_name, "my-pod");
    assert_eq!(info.namespace, "default");
    assert_eq!(info.remote_port, 8080);
    assert!(info.local_port > 0);
    assert_eq!(info.status, PortForwardStatus::Active);
    assert!(!info.id.is_empty());

    // Cleanup
    mgr.stop(&info.id).await;
}

#[tokio::test]
async fn test_28_list_port_forwards() {
    let mgr = PortForwardManager::new();

    // Initially empty
    assert!(mgr.list("cluster-1").await.is_empty());

    let info = mgr
        .create(
            "cluster-1",
            &CreatePortForwardReq {
                pod_name: "pod-a".into(),
                namespace: "ns1".into(),
                remote_port: 3000,
                local_port: None,
            },
        )
        .await
        .unwrap();

    let list = mgr.list("cluster-1").await;
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].pod_name, "pod-a");

    // Different cluster should be empty
    assert!(mgr.list("cluster-2").await.is_empty());

    mgr.stop(&info.id).await;
}

#[tokio::test]
async fn test_29_get_port_forward_after_create() {
    let mgr = PortForwardManager::new();
    let info = mgr
        .create(
            "cluster-1",
            &CreatePortForwardReq {
                pod_name: "pod-x".into(),
                namespace: "ns".into(),
                remote_port: 5432,
                local_port: None,
            },
        )
        .await
        .unwrap();

    // list should contain the forward
    let list = mgr.list("cluster-1").await;
    assert!(!list.is_empty());
    let found = list.iter().find(|f| f.id == info.id);
    assert!(found.is_some());

    mgr.stop(&info.id).await;
}

#[tokio::test]
async fn test_30_list_nonexisting_cluster_returns_empty() {
    let mgr = PortForwardManager::new();
    let list = mgr.list("nonexistent-cluster").await;
    assert!(list.is_empty());
}

#[tokio::test]
async fn test_31_stop_port_forward() {
    let mgr = PortForwardManager::new();
    let info = mgr
        .create(
            "cluster-1",
            &CreatePortForwardReq {
                pod_name: "stoppable".into(),
                namespace: "default".into(),
                remote_port: 9090,
                local_port: None,
            },
        )
        .await
        .unwrap();

    assert!(mgr.stop(&info.id).await);
    // After stop, list should be empty for that cluster
    assert!(mgr.list("cluster-1").await.is_empty());
}

#[tokio::test]
async fn test_32_stop_nonexisting_returns_false() {
    let mgr = PortForwardManager::new();
    assert!(!mgr.stop("nonexistent-forward").await);
}

#[tokio::test]
async fn test_33_create_multiple_forwards_different_ports() {
    let mgr = PortForwardManager::new();

    let fwd1 = mgr
        .create(
            "cluster-1",
            &CreatePortForwardReq {
                pod_name: "pod-1".into(),
                namespace: "ns".into(),
                remote_port: 8080,
                local_port: None,
            },
        )
        .await
        .unwrap();

    let fwd2 = mgr
        .create(
            "cluster-1",
            &CreatePortForwardReq {
                pod_name: "pod-2".into(),
                namespace: "ns".into(),
                remote_port: 9090,
                local_port: None,
            },
        )
        .await
        .unwrap();

    assert_ne!(fwd1.id, fwd2.id);
    assert_ne!(fwd1.local_port, fwd2.local_port);

    let list = mgr.list("cluster-1").await;
    assert_eq!(list.len(), 2);

    mgr.stop(&fwd1.id).await;
    mgr.stop(&fwd2.id).await;
}

#[test]
fn test_34_port_forward_status_all_variants() {
    let variants = [
        PortForwardStatus::Active,
        PortForwardStatus::Closing,
        PortForwardStatus::Closed,
    ];

    for status in &variants {
        let json = serde_json::to_string(status).unwrap();
        assert!(!json.is_empty());
        let rt: PortForwardStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(*status, rt);
    }
}

#[test]
fn test_34b_port_forward_status_serde_lowercase() {
    assert_eq!(
        serde_json::to_string(&PortForwardStatus::Active).unwrap(),
        "\"active\""
    );
    assert_eq!(
        serde_json::to_string(&PortForwardStatus::Closing).unwrap(),
        "\"closing\""
    );
    assert_eq!(
        serde_json::to_string(&PortForwardStatus::Closed).unwrap(),
        "\"closed\""
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LOG STREAM TYPES TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_35_pod_log_stream_req_with_defaults() {
    let json_str = r#"{}"#;
    let req: PodLogStreamReq = serde_json::from_str(json_str).unwrap();
    assert!(req.container.is_none());
    assert!(req.tail_lines.is_none());
    assert!(req.follow.is_none());
    assert!(req.filter.is_none());
    assert!(req.label_selector.is_none());
}

#[test]
fn test_36_pod_log_stream_req_with_all_options() {
    let json_str = r#"{
        "container": "nginx",
        "tail_lines": 500,
        "follow": true,
        "filter": "ERROR|WARN",
        "label_selector": "app=web"
    }"#;
    let req: PodLogStreamReq = serde_json::from_str(json_str).unwrap();
    assert_eq!(req.container.as_deref(), Some("nginx"));
    assert_eq!(req.tail_lines, Some(500));
    assert_eq!(req.follow, Some(true));
    assert_eq!(req.filter.as_deref(), Some("ERROR|WARN"));
    assert_eq!(req.label_selector.as_deref(), Some("app=web"));
}

#[test]
fn test_37_log_entry_serialization() {
    let entry = LogEntry {
        pod: "web-pod-1".into(),
        container: "nginx".into(),
        timestamp: Some("2024-01-15T10:30:00Z".into()),
        message: "GET / 200 OK".into(),
    };

    let json = serde_json::to_string(&entry).unwrap();
    assert!(json.contains("web-pod-1"));
    assert!(json.contains("nginx"));
    assert!(json.contains("GET / 200 OK"));

    // LogEntry only derives Serialize, so verify the JSON structure
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(value["pod"], "web-pod-1");
    assert_eq!(value["container"], "nginx");
    assert_eq!(value["message"], "GET / 200 OK");
}

#[test]
fn test_37b_log_entry_without_timestamp() {
    let entry = LogEntry {
        pod: "test-pod".into(),
        container: "app".into(),
        timestamp: None,
        message: "Starting...".into(),
    };

    let json = serde_json::to_string(&entry).unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert!(value["timestamp"].is_null());
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. EXEC TYPES TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_38_pod_exec_req_construction() {
    let json_str = r#"{
        "container": "app",
        "command": ["bash", "-c", "echo hello"],
        "cols": 120,
        "rows": 40
    }"#;
    let req: PodExecReq = serde_json::from_str(json_str).unwrap();
    assert_eq!(req.container.as_deref(), Some("app"));
    assert_eq!(
        req.command.as_deref(),
        Some(vec!["bash".into(), "-c".into(), "echo hello".into()].as_slice())
    );
    assert_eq!(req.cols, Some(120));
    assert_eq!(req.rows, Some(40));
}

#[test]
fn test_38b_pod_exec_req_minimal() {
    let json_str = r#"{}"#;
    let req: PodExecReq = serde_json::from_str(json_str).unwrap();
    assert!(req.container.is_none());
    assert!(req.command.is_none());
    assert!(req.cols.is_none());
    assert!(req.rows.is_none());
}

#[test]
fn test_39_exec_message_all_variants() {
    let msgs = vec![
        ExecMessage::Stdin("input data".into()),
        ExecMessage::Stdout("output data".into()),
        ExecMessage::Resize { cols: 80, rows: 24 },
        ExecMessage::Error("something went wrong".into()),
        ExecMessage::Close,
    ];

    for msg in &msgs {
        let json = serde_json::to_string(msg).unwrap();
        assert!(!json.is_empty(), "Serialized {msg:?} should not be empty");
    }
}

#[test]
fn test_40_exec_message_serialization_roundtrip() {
    // Stdin
    let stdin = ExecMessage::Stdin("hello\n".into());
    let json = serde_json::to_string(&stdin).unwrap();
    let rt: ExecMessage = serde_json::from_str(&json).unwrap();
    match rt {
        ExecMessage::Stdin(s) => assert_eq!(s, "hello\n"),
        other => panic!("Expected Stdin, got {other:?}"),
    }

    // Stdout
    let stdout = ExecMessage::Stdout("world".into());
    let json = serde_json::to_string(&stdout).unwrap();
    let rt: ExecMessage = serde_json::from_str(&json).unwrap();
    match rt {
        ExecMessage::Stdout(s) => assert_eq!(s, "world"),
        other => panic!("Expected Stdout, got {other:?}"),
    }

    // Resize
    let resize = ExecMessage::Resize {
        cols: 120,
        rows: 40,
    };
    let json = serde_json::to_string(&resize).unwrap();
    let rt: ExecMessage = serde_json::from_str(&json).unwrap();
    match rt {
        ExecMessage::Resize { cols, rows } => {
            assert_eq!(cols, 120);
            assert_eq!(rows, 40);
        }
        other => panic!("Expected Resize, got {other:?}"),
    }

    // Error
    let error = ExecMessage::Error("fail".into());
    let json = serde_json::to_string(&error).unwrap();
    let rt: ExecMessage = serde_json::from_str(&json).unwrap();
    match rt {
        ExecMessage::Error(s) => assert_eq!(s, "fail"),
        other => panic!("Expected Error, got {other:?}"),
    }

    // Close
    let close = ExecMessage::Close;
    let json = serde_json::to_string(&close).unwrap();
    let rt: ExecMessage = serde_json::from_str(&json).unwrap();
    assert!(matches!(rt, ExecMessage::Close));
}

#[test]
fn test_40b_exec_message_tagged_format() {
    // ExecMessage uses #[serde(tag = "type", content = "data")]
    let stdin = ExecMessage::Stdin("test".into());
    let json = serde_json::to_string(&stdin).unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(value["type"], "stdin");
    assert_eq!(value["data"], "test");

    let close = ExecMessage::Close;
    let json = serde_json::to_string(&close).unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(value["type"], "close");
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. K8S RESOURCE KIND API INFO TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_resource_kind_api_info_core_v1() {
    let (base, plural) = K8sResourceKind::Pod.api_info();
    assert_eq!(base, "/api/v1");
    assert_eq!(plural, "pods");

    let (base, plural) = K8sResourceKind::Service.api_info();
    assert_eq!(base, "/api/v1");
    assert_eq!(plural, "services");

    let (base, plural) = K8sResourceKind::ConfigMap.api_info();
    assert_eq!(base, "/api/v1");
    assert_eq!(plural, "configmaps");

    let (base, plural) = K8sResourceKind::Namespace.api_info();
    assert_eq!(base, "/api/v1");
    assert_eq!(plural, "namespaces");
}

#[test]
fn test_resource_kind_api_info_apps_v1() {
    let (base, plural) = K8sResourceKind::Deployment.api_info();
    assert_eq!(base, "/apis/apps/v1");
    assert_eq!(plural, "deployments");

    let (base, plural) = K8sResourceKind::StatefulSet.api_info();
    assert_eq!(base, "/apis/apps/v1");
    assert_eq!(plural, "statefulsets");
}

#[test]
fn test_resource_kind_cluster_scoped() {
    assert!(K8sResourceKind::Namespace.is_cluster_scoped());
    assert!(K8sResourceKind::Node.is_cluster_scoped());
    assert!(K8sResourceKind::PersistentVolume.is_cluster_scoped());
    assert!(K8sResourceKind::StorageClass.is_cluster_scoped());
    assert!(K8sResourceKind::ClusterRole.is_cluster_scoped());
    assert!(K8sResourceKind::ClusterRoleBinding.is_cluster_scoped());

    assert!(!K8sResourceKind::Pod.is_cluster_scoped());
    assert!(!K8sResourceKind::Deployment.is_cluster_scoped());
    assert!(!K8sResourceKind::Service.is_cluster_scoped());
}

#[test]
fn test_resource_kind_list_url_namespaced() {
    let url = K8sResourceKind::Pod.list_url(Some("default"));
    assert_eq!(url, "/api/v1/namespaces/default/pods");

    let url = K8sResourceKind::Deployment.list_url(Some("production"));
    assert_eq!(url, "/apis/apps/v1/namespaces/production/deployments");
}

#[test]
fn test_resource_kind_list_url_cluster_scoped_ignores_namespace() {
    let url = K8sResourceKind::Namespace.list_url(Some("ignored"));
    assert_eq!(url, "/api/v1/namespaces");

    let url = K8sResourceKind::Node.list_url(Some("ignored"));
    assert_eq!(url, "/api/v1/nodes");
}

#[test]
fn test_resource_kind_list_url_no_namespace() {
    let url = K8sResourceKind::Pod.list_url(None);
    assert_eq!(url, "/api/v1/pods");
}

#[test]
fn test_resource_kind_get_url() {
    let url = K8sResourceKind::Pod.get_url(Some("default"), "my-pod");
    assert_eq!(url, "/api/v1/namespaces/default/pods/my-pod");

    let url = K8sResourceKind::Node.get_url(Some("ignored"), "node-1");
    assert_eq!(url, "/api/v1/nodes/node-1");
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. SERVICE BRIDGE TYPES TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_detected_service_type_variants() {
    let types = [
        DetectedServiceType::PostgreSQL,
        DetectedServiceType::MySQL,
        DetectedServiceType::Redis,
        DetectedServiceType::Unknown,
    ];

    for st in &types {
        let json = serde_json::to_string(st).unwrap();
        assert!(!json.is_empty());
        let rt: DetectedServiceType = serde_json::from_str(&json).unwrap();
        assert_eq!(*st, rt);
    }
}

#[test]
fn test_service_detect_result_serialization() {
    let result = ServiceDetectResult {
        service_type: DetectedServiceType::PostgreSQL,
        port: 5432,
        target_port: 5432,
        annotations: Some(serde_json::json!({"app.kubernetes.io/component": "postgresql"})),
    };

    let json = serde_json::to_string(&result).unwrap();
    let rt: ServiceDetectResult = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.service_type, DetectedServiceType::PostgreSQL);
    assert_eq!(rt.port, 5432);
    assert_eq!(rt.target_port, 5432);
}

#[test]
fn test_service_bridge_result_serialization() {
    let result = ServiceBridgeResult {
        service_type: DetectedServiceType::Redis,
        local_port: 16379,
        remote_port: 6379,
        forward_id: "fwd-123".into(),
    };

    let json = serde_json::to_string(&result).unwrap();
    let rt: ServiceBridgeResult = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.service_type, DetectedServiceType::Redis);
    assert_eq!(rt.local_port, 16379);
    assert_eq!(rt.remote_port, 6379);
    assert_eq!(rt.forward_id, "fwd-123");
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. K8S EVENT & CONDITION TYPES
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_k8s_event_serialization() {
    let event = K8sEvent {
        reason: Some("Scheduled".into()),
        message: Some("Successfully assigned to node-1".into()),
        event_type: Some("Normal".into()),
        count: Some(1),
        first_timestamp: Some("2024-01-15T10:00:00Z".into()),
        last_timestamp: Some("2024-01-15T10:00:00Z".into()),
        source: Some("default-scheduler".into()),
    };

    let json = serde_json::to_string(&event).unwrap();
    let rt: K8sEvent = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.reason.as_deref(), Some("Scheduled"));
    assert_eq!(rt.count, Some(1));
}

#[test]
fn test_k8s_condition_serialization() {
    let condition = K8sCondition {
        condition_type: "Ready".into(),
        status: "True".into(),
        reason: Some("PodReady".into()),
        message: Some("Pod has been ready".into()),
        last_transition_time: Some("2024-01-15T10:00:00Z".into()),
    };

    let json = serde_json::to_string(&condition).unwrap();
    let rt: K8sCondition = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.condition_type, "Ready");
    assert_eq!(rt.status, "True");
}

#[test]
fn test_k8s_resource_detail() {
    let detail = K8sResourceDetail {
        resource: K8sResource {
            name: "my-pod".into(),
            namespace: Some("default".into()),
            kind: "Pod".into(),
            status: Some("Running".into()),
            age: None,
            labels: None,
            annotations: None,
            raw: None,
        },
        events: vec![K8sEvent {
            reason: Some("Started".into()),
            message: None,
            event_type: None,
            count: None,
            first_timestamp: None,
            last_timestamp: None,
            source: None,
        }],
        conditions: vec![K8sCondition {
            condition_type: "Ready".into(),
            status: "True".into(),
            reason: None,
            message: None,
            last_transition_time: None,
        }],
    };

    let json = serde_json::to_string(&detail).unwrap();
    let rt: K8sResourceDetail = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.resource.name, "my-pod");
    assert_eq!(rt.events.len(), 1);
    assert_eq!(rt.conditions.len(), 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. PORT-FORWARD INFO TYPES
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_port_forward_info_serialization() {
    let info = PortForwardInfo {
        id: "fwd-abc".into(),
        cluster_id: "cluster-1".into(),
        pod_name: "web-pod".into(),
        namespace: "default".into(),
        local_port: 18080,
        remote_port: 8080,
        status: PortForwardStatus::Active,
    };

    let json = serde_json::to_string(&info).unwrap();
    let rt: PortForwardInfo = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.id, "fwd-abc");
    assert_eq!(rt.local_port, 18080);
    assert_eq!(rt.remote_port, 8080);
    assert_eq!(rt.status, PortForwardStatus::Active);
}

#[test]
fn test_create_port_forward_req_deserialization() {
    let json_str = r#"{
        "pod_name": "db-pod",
        "namespace": "production",
        "remote_port": 5432,
        "local_port": 15432
    }"#;
    let req: CreatePortForwardReq = serde_json::from_str(json_str).unwrap();
    assert_eq!(req.pod_name, "db-pod");
    assert_eq!(req.namespace, "production");
    assert_eq!(req.remote_port, 5432);
    assert_eq!(req.local_port, Some(15432));
}

#[test]
fn test_create_port_forward_req_without_local_port() {
    let json_str = r#"{
        "pod_name": "redis-pod",
        "namespace": "cache",
        "remote_port": 6379
    }"#;
    let req: CreatePortForwardReq = serde_json::from_str(json_str).unwrap();
    assert!(req.local_port.is_none());
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_41_cluster_with_very_long_name() {
    let mgr = K8sManager::new();
    let long_name = "a".repeat(1000);
    let cluster = mgr
        .create_cluster(CreateK8sClusterReq {
            name: long_name.clone(),
            kubeconfig_path: None,
            kubeconfig_inline: None,
            context_name: None,
            default_namespace: None,
            group: None,
        })
        .await;

    assert_eq!(cluster.name, long_name);
    assert_eq!(cluster.name.len(), 1000);

    let fetched = mgr.get_cluster(&cluster.id).await.unwrap();
    assert_eq!(fetched.name, long_name);
}

#[tokio::test]
async fn test_42_concurrent_cluster_operations() {
    use std::sync::Arc;

    let mgr = Arc::new(K8sManager::new());
    let mut handles = Vec::new();

    // Spawn 20 concurrent create operations
    for i in 0..20 {
        let mgr = Arc::clone(&mgr);
        handles.push(tokio::spawn(async move {
            mgr.create_cluster(CreateK8sClusterReq {
                name: format!("concurrent-{i}"),
                kubeconfig_path: None,
                kubeconfig_inline: None,
                context_name: None,
                default_namespace: None,
                group: None,
            })
            .await
        }));
    }

    for handle in handles {
        handle.await.unwrap();
    }

    let list = mgr.list_clusters().await;
    assert_eq!(list.len(), 20);

    // All names should be unique
    let mut names: Vec<_> = list.iter().map(|c| c.name.clone()).collect();
    names.sort();
    names.dedup();
    assert_eq!(names.len(), 20);
}

#[test]
fn test_43_kubeconfig_with_extra_unknown_fields() {
    // Parser should gracefully skip unknown fields
    let yaml = r#"apiVersion: v1
kind: Config
preferences:
  colors: true
clusters:
- name: extra-cluster
  cluster:
    server: https://extra.example.com:6443
    unknown-field: some-value
    extensions:
      - name: client.authentication.k8s.io/exec
users:
- name: extra-user
  user:
    token: extra-token
    unknown-auth: ignored
contexts:
- name: extra-context
  context:
    cluster: extra-cluster
    user: extra-user
    namespace: extra-ns
current-context: extra-context
"#;
    let kc = Kubeconfig::parse(yaml).unwrap();
    assert_eq!(kc.clusters.len(), 1);
    assert_eq!(kc.clusters[0].name, "extra-cluster");
    assert_eq!(kc.contexts.len(), 1);
    assert_eq!(kc.contexts[0].namespace.as_deref(), Some("extra-ns"));
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. KUBECONFIG RESOLVE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_kubeconfig_resolve_context_success() {
    let kc = Kubeconfig::parse(single_context_kubeconfig()).unwrap();
    let (cluster, user, ns) = kc.resolve_context("my-context").unwrap();
    assert_eq!(cluster.name, "my-cluster");
    assert_eq!(cluster.server, "https://10.0.0.1:6443");
    assert_eq!(user.name, "my-user");
    assert_eq!(user.token.as_deref(), Some("my-secret-token"));
    assert_eq!(ns, Some("default"));
}

#[test]
fn test_kubeconfig_resolve_context_not_found() {
    let kc = Kubeconfig::parse(single_context_kubeconfig()).unwrap();
    let result = kc.resolve_context("nonexistent-context");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("not found"));
}

#[test]
fn test_kubeconfig_resolve_multi_context() {
    let kc = Kubeconfig::parse(multi_context_kubeconfig()).unwrap();

    let (cluster, user, ns) = kc.resolve_context("dev").unwrap();
    assert_eq!(cluster.name, "dev-cluster");
    assert_eq!(user.name, "dev-user");
    assert_eq!(ns, Some("dev-ns"));

    let (cluster, user, ns) = kc.resolve_context("prod").unwrap();
    assert_eq!(cluster.name, "prod-cluster");
    assert_eq!(user.name, "prod-user");
    assert_eq!(ns, Some("prod-ns"));
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. K8S MANAGER parse_kubeconfig_yaml
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_manager_parse_kubeconfig_yaml() {
    let contexts = K8sManager::parse_kubeconfig_yaml(single_context_kubeconfig()).unwrap();
    assert_eq!(contexts.len(), 1);
    assert_eq!(contexts[0].name, "my-context");
    assert_eq!(contexts[0].cluster, "my-cluster");
    assert_eq!(contexts[0].user, "my-user");
    assert_eq!(contexts[0].namespace.as_deref(), Some("default"));
}

#[test]
fn test_manager_parse_kubeconfig_yaml_multi() {
    let contexts = K8sManager::parse_kubeconfig_yaml(multi_context_kubeconfig()).unwrap();
    assert_eq!(contexts.len(), 2);
}

#[test]
fn test_manager_parse_kubeconfig_yaml_empty() {
    let contexts = K8sManager::parse_kubeconfig_yaml("apiVersion: v1\nkind: Config\n").unwrap();
    assert!(contexts.is_empty());
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. PORT-FORWARD MANAGER stop_all
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_stop_all_for_cluster() {
    let mgr = PortForwardManager::new();

    // Create forwards for two different clusters
    mgr.create(
        "cluster-a",
        &CreatePortForwardReq {
            pod_name: "pod1".into(),
            namespace: "ns".into(),
            remote_port: 8080,
            local_port: None,
        },
    )
    .await
    .unwrap();

    mgr.create(
        "cluster-a",
        &CreatePortForwardReq {
            pod_name: "pod2".into(),
            namespace: "ns".into(),
            remote_port: 9090,
            local_port: None,
        },
    )
    .await
    .unwrap();

    let fwd_b = mgr
        .create(
            "cluster-b",
            &CreatePortForwardReq {
                pod_name: "pod3".into(),
                namespace: "ns".into(),
                remote_port: 3000,
                local_port: None,
            },
        )
        .await
        .unwrap();

    assert_eq!(mgr.list("cluster-a").await.len(), 2);
    assert_eq!(mgr.list("cluster-b").await.len(), 1);

    // Stop all for cluster-a
    mgr.stop_all("cluster-a").await;

    assert!(mgr.list("cluster-a").await.is_empty());
    assert_eq!(mgr.list("cluster-b").await.len(), 1);

    mgr.stop(&fwd_b.id).await;
}

#[tokio::test]
async fn test_port_forward_manager_default_trait() {
    let mgr = PortForwardManager::default();
    assert!(mgr.list("any").await.is_empty());
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. ADDITIONAL EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_create_and_delete_many_clusters() {
    let mgr = K8sManager::new();
    let mut ids = Vec::new();

    for i in 0..50 {
        let cluster = mgr
            .create_cluster(CreateK8sClusterReq {
                name: format!("batch-{i:03}"),
                kubeconfig_path: None,
                kubeconfig_inline: None,
                context_name: None,
                default_namespace: None,
                group: None,
            })
            .await;
        ids.push(cluster.id);
    }

    assert_eq!(mgr.list_clusters().await.len(), 50);

    // Delete half
    for id in &ids[..25] {
        assert!(mgr.delete_cluster(id).await);
    }

    assert_eq!(mgr.list_clusters().await.len(), 25);

    // Deleting again should return false
    for id in &ids[..25] {
        assert!(!mgr.delete_cluster(id).await);
    }
}

#[test]
fn test_k8s_cluster_serde_roundtrip() {
    let cluster = K8sCluster {
        id: "test-id".into(),
        name: "test-cluster".into(),
        context_name: "ctx".into(),
        kubeconfig_path: Some("/path".into()),
        kubeconfig_inline: Some("yaml content".into()),
        server_url: Some("https://10.0.0.1:6443".into()),
        namespace: Some("default".into()),
        group: Some("infra".into()),
    };

    let json = serde_json::to_string(&cluster).unwrap();
    let rt: K8sCluster = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.id, "test-id");
    assert_eq!(rt.name, "test-cluster");
    assert_eq!(rt.context_name, "ctx");
    assert_eq!(rt.kubeconfig_path.as_deref(), Some("/path"));
    assert_eq!(rt.server_url.as_deref(), Some("https://10.0.0.1:6443"));
    assert_eq!(rt.namespace.as_deref(), Some("default"));
    assert_eq!(rt.group.as_deref(), Some("infra"));
}

#[test]
fn test_create_cluster_req_serde() {
    let req = CreateK8sClusterReq {
        name: "new-cluster".into(),
        kubeconfig_path: None,
        kubeconfig_inline: Some("inline yaml".into()),
        context_name: Some("ctx-name".into()),
        default_namespace: Some("ns".into()),
        group: Some("group-a".into()),
    };

    let json = serde_json::to_string(&req).unwrap();
    let rt: CreateK8sClusterReq = serde_json::from_str(&json).unwrap();
    assert_eq!(rt.name, "new-cluster");
    assert_eq!(rt.context_name.as_deref(), Some("ctx-name"));
}

#[test]
fn test_kubeconfig_with_quoted_values() {
    let yaml = r#"apiVersion: v1
kind: Config
clusters:
- name: "quoted-cluster"
  cluster:
    server: "https://quoted.example.com:6443"
users:
- name: "quoted-user"
  user:
    token: "quoted-token"
contexts:
- name: "quoted-context"
  context:
    cluster: "quoted-cluster"
    user: "quoted-user"
current-context: "quoted-context"
"#;
    let kc = Kubeconfig::parse(yaml).unwrap();
    assert_eq!(kc.clusters[0].name, "quoted-cluster");
    assert_eq!(kc.clusters[0].server, "https://quoted.example.com:6443");
    assert_eq!(kc.users[0].token.as_deref(), Some("quoted-token"));
    assert_eq!(kc.current_context.as_deref(), Some("quoted-context"));
}

#[test]
fn test_kubeconfig_with_comments() {
    let yaml = r#"# This is a kubeconfig file
apiVersion: v1
kind: Config
# Cluster definitions
clusters:
- name: comment-cluster
  cluster:
    # Server URL
    server: https://comment.example.com:6443
users:
- name: comment-user
  user:
    token: comment-token
contexts:
- name: comment-context
  context:
    cluster: comment-cluster
    user: comment-user
"#;
    let kc = Kubeconfig::parse(yaml).unwrap();
    assert_eq!(kc.clusters.len(), 1);
    assert_eq!(kc.clusters[0].name, "comment-cluster");
}

#[tokio::test]
async fn test_cluster_ids_are_unique() {
    let mgr = K8sManager::new();
    let c1 = mgr
        .create_cluster(CreateK8sClusterReq {
            name: "same-name".into(),
            kubeconfig_path: None,
            kubeconfig_inline: None,
            context_name: None,
            default_namespace: None,
            group: None,
        })
        .await;
    let c2 = mgr
        .create_cluster(CreateK8sClusterReq {
            name: "same-name".into(),
            kubeconfig_path: None,
            kubeconfig_inline: None,
            context_name: None,
            default_namespace: None,
            group: None,
        })
        .await;

    assert_ne!(c1.id, c2.id);
    // Both should exist
    assert_eq!(mgr.list_clusters().await.len(), 2);
}
