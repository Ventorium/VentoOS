use serde::{Deserialize, Serialize};

use crate::types::Id;

/// Resource type enumeration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResourceType {
    // Kubernetes
    KubernetesCluster,
    KubernetesNamespace,
    KubernetesPod,
    KubernetesService,
    KubernetesDeployment,
    KubernetesNode,
    // Database
    DatabaseInstance,
    DatabaseSchema,
    DatabaseTable,
    // Redis
    RedisInstance,
    RedisKey,
    // VFS
    File,
    Directory,
    MountPoint,
}

/// A generic resource reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resource {
    pub id: Id,
    pub name: String,
    pub resource_type: ResourceType,
    pub connection_id: Option<Id>,
    pub parent_id: Option<Id>,
    pub metadata: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::new_id;

    #[test]
    fn test_resource_serialization() {
        let r = Resource {
            id: new_id(),
            name: "my-pod".to_string(),
            resource_type: ResourceType::KubernetesPod,
            connection_id: Some(new_id()),
            parent_id: None,
            metadata: serde_json::json!({"namespace": "default"}),
        };
        let json = serde_json::to_string(&r).unwrap();
        let deserialized: Resource = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "my-pod");
        assert_eq!(deserialized.resource_type, ResourceType::KubernetesPod);
    }
}
