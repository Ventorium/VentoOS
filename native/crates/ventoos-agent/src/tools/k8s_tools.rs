//! Kubernetes tool definitions.

use crate::types::{RiskLevel, ToolDefinition};

#[allow(clippy::too_many_lines)]
pub fn definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "k8s_list_clusters".into(),
            description: "List all registered Kubernetes clusters.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "k8s_list_namespaces".into(),
            description: "List namespaces in a Kubernetes cluster.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cluster_id": { "type": "string", "description": "Cluster identifier" }
                },
                "required": ["cluster_id"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "k8s_list_resources".into(),
            description: "List resources of a given kind in a namespace.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cluster_id": { "type": "string", "description": "Cluster identifier" },
                    "namespace": { "type": "string", "description": "Kubernetes namespace" },
                    "kind": { "type": "string", "description": "Resource kind (e.g. Pod, Deployment, Service)" }
                },
                "required": ["cluster_id", "namespace", "kind"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "k8s_get_resource".into(),
            description: "Get a specific Kubernetes resource by name.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cluster_id": { "type": "string" },
                    "namespace": { "type": "string" },
                    "kind": { "type": "string" },
                    "name": { "type": "string", "description": "Resource name" }
                },
                "required": ["cluster_id", "namespace", "kind", "name"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "k8s_get_resource_yaml".into(),
            description: "Get the full YAML manifest of a Kubernetes resource.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cluster_id": { "type": "string" },
                    "namespace": { "type": "string" },
                    "kind": { "type": "string" },
                    "name": { "type": "string" }
                },
                "required": ["cluster_id", "namespace", "kind", "name"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "k8s_apply_yaml".into(),
            description: "Apply a YAML manifest to a Kubernetes cluster. This can create or update resources. HIGH RISK: may modify production workloads.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cluster_id": { "type": "string" },
                    "namespace": { "type": "string" },
                    "yaml": { "type": "string", "description": "YAML manifest content" }
                },
                "required": ["cluster_id", "yaml"]
            }),
            risk_level: RiskLevel::High,
        },
        ToolDefinition {
            name: "k8s_delete_resource".into(),
            description: "Delete a Kubernetes resource. HIGH RISK: permanently removes the resource.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cluster_id": { "type": "string" },
                    "namespace": { "type": "string" },
                    "kind": { "type": "string" },
                    "name": { "type": "string" }
                },
                "required": ["cluster_id", "namespace", "kind", "name"]
            }),
            risk_level: RiskLevel::High,
        },
        ToolDefinition {
            name: "k8s_get_pod_logs".into(),
            description: "Retrieve logs from a Kubernetes pod.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cluster_id": { "type": "string" },
                    "namespace": { "type": "string" },
                    "pod_name": { "type": "string", "description": "Pod name" },
                    "container": { "type": "string", "description": "Container name (optional)" },
                    "tail_lines": { "type": "integer", "description": "Number of tail lines (default: 100)", "default": 100 }
                },
                "required": ["cluster_id", "namespace", "pod_name"]
            }),
            risk_level: RiskLevel::Low,
        },
        ToolDefinition {
            name: "k8s_exec_command".into(),
            description: "Execute a command in a Kubernetes pod container. HIGH RISK: runs arbitrary commands inside a pod.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "cluster_id": { "type": "string" },
                    "namespace": { "type": "string" },
                    "pod_name": { "type": "string" },
                    "container": { "type": "string" },
                    "command": { "type": "array", "items": { "type": "string" }, "description": "Command and arguments" }
                },
                "required": ["cluster_id", "namespace", "pod_name", "command"]
            }),
            risk_level: RiskLevel::High,
        },
    ]
}
