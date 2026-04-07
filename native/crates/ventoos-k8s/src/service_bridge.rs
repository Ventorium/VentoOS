//! Service → DB/Redis bridge detection and auto-connect.
//!
//! Detects Service types by analysing port numbers and annotations,
//! then creates a port-forward so Database / Redis Apps can connect
//! via `127.0.0.1:<local_port>`.

use serde_json::Value;
use tracing::info;

use crate::k8s_client::K8sClient;
use crate::port_forward::PortForwardManager;
use crate::types::{
    CreatePortForwardReq, DetectedServiceType, ServiceBridgeResult, ServiceDetectResult,
};

/// Detect what type of backing service a K8s Service represents.
///
/// Heuristics:
/// 1. Well-known port numbers: 5432→PostgreSQL, 3306→MySQL, 6379→Redis
/// 2. Annotations: `app.kubernetes.io/component`, `app.kubernetes.io/name`
/// 3. Label hints
pub async fn detect_service(
    client: &K8sClient,
    namespace: &str,
    service_name: &str,
) -> Result<ServiceDetectResult, String> {
    let url = format!("/api/v1/namespaces/{namespace}/services/{service_name}");
    let json = client.get(&url).await?;

    let annotations = json.pointer("/metadata/annotations").cloned();
    let spec_ports = json
        .pointer("/spec/ports")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    // Check annotations for component hints
    let annotation_hint = annotations.as_ref().and_then(|a| {
        let component = a
            .get("app.kubernetes.io/component")
            .or_else(|| a.get("app.kubernetes.io/name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase();
        detect_from_component_name(&component)
    });

    if let Some(detected) = annotation_hint {
        let (port, target_port) = extract_first_port(&spec_ports);
        return Ok(ServiceDetectResult {
            service_type: detected,
            port,
            target_port,
            annotations,
        });
    }

    // Check port numbers
    for port_entry in &spec_ports {
        let port_num = port_entry.get("port").and_then(Value::as_u64).unwrap_or(0) as u16;
        let target = port_entry
            .get("targetPort")
            .and_then(|v| {
                v.as_u64()
                    .map(|n| n as u16)
                    .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
            })
            .unwrap_or(port_num);

        let detected = match port_num {
            5432 => DetectedServiceType::PostgreSQL,
            3306 => DetectedServiceType::MySQL,
            6379 => DetectedServiceType::Redis,
            _ => continue,
        };

        return Ok(ServiceDetectResult {
            service_type: detected,
            port: port_num,
            target_port: target,
            annotations,
        });
    }

    // Check service name for hints
    let name_lower = service_name.to_lowercase();
    let name_hint = detect_from_component_name(&name_lower);

    let (port, target_port) = extract_first_port(&spec_ports);

    Ok(ServiceDetectResult {
        service_type: name_hint.unwrap_or(DetectedServiceType::Unknown),
        port,
        target_port,
        annotations,
    })
}

/// Create a port-forward bridge to the service's backing pods.
pub async fn bridge_service(
    client: &K8sClient,
    pf_manager: &PortForwardManager,
    cluster_id: &str,
    namespace: &str,
    service_name: &str,
) -> Result<ServiceBridgeResult, String> {
    // First detect the service type
    let detection = detect_service(client, namespace, service_name).await?;

    // Find target pods via the Service's selector
    let svc_json = client
        .get(&format!(
            "/api/v1/namespaces/{namespace}/services/{service_name}"
        ))
        .await?;

    let selector = svc_json
        .pointer("/spec/selector")
        .and_then(Value::as_object)
        .ok_or("Service has no selector")?;

    // Build label selector string
    let label_selector: String = selector
        .iter()
        .map(|(k, v)| format!("{k}={}", v.as_str().unwrap_or("")))
        .collect::<Vec<_>>()
        .join(",");

    // Find a pod matching the selector
    let pods_url = format!("/api/v1/namespaces/{namespace}/pods?labelSelector={label_selector}");
    let pods_json = client.get(&pods_url).await?;
    let pod_name = pods_json
        .pointer("/items/0/metadata/name")
        .and_then(Value::as_str)
        .ok_or("No pods found matching service selector")?;

    info!(
        "Bridging service {service_name} ({:?}) via pod {pod_name}:{}",
        detection.service_type, detection.target_port
    );

    // Create port-forward
    let pf_info = pf_manager
        .create(
            cluster_id,
            &CreatePortForwardReq {
                pod_name: pod_name.to_string(),
                namespace: namespace.to_string(),
                remote_port: detection.target_port,
                local_port: None,
            },
        )
        .await?;

    Ok(ServiceBridgeResult {
        service_type: detection.service_type,
        local_port: pf_info.local_port,
        remote_port: detection.target_port,
        forward_id: pf_info.id,
    })
}

fn detect_from_component_name(name: &str) -> Option<DetectedServiceType> {
    if name.contains("postgres") || name.contains("postgresql") || name.contains("pgsql") {
        Some(DetectedServiceType::PostgreSQL)
    } else if name.contains("mysql") || name.contains("mariadb") {
        Some(DetectedServiceType::MySQL)
    } else if name.contains("redis") {
        Some(DetectedServiceType::Redis)
    } else {
        None
    }
}

fn extract_first_port(ports: &[Value]) -> (u16, u16) {
    ports
        .first()
        .map(|p| {
            let port = p.get("port").and_then(Value::as_u64).unwrap_or(0) as u16;
            let target = p
                .get("targetPort")
                .and_then(|v| {
                    v.as_u64()
                        .map(|n| n as u16)
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                })
                .unwrap_or(port);
            (port, target)
        })
        .unwrap_or((0, 0))
}
