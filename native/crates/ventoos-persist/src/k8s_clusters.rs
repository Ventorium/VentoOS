use std::sync::Arc;

use crate::Database;

/// A persisted K8s cluster record (plain strings, no dependency on ventoos-k8s types).
#[derive(Debug, Clone)]
pub struct PersistedK8sCluster {
    pub id: String,
    pub name: String,
    pub context_name: String,
    pub kubeconfig_path: Option<String>,
    pub kubeconfig_inline: Option<String>,
    pub server_url: Option<String>,
    pub namespace: Option<String>,
    pub group_name: Option<String>,
}

/// Persistence layer for K8s cluster configurations.
pub struct K8sClusterStore {
    db: Arc<Database>,
}

impl K8sClusterStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Load all persisted clusters, ordered by name.
    pub fn load_all(&self) -> Result<Vec<PersistedK8sCluster>, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, context_name, kubeconfig_path, kubeconfig_inline, \
                 server_url, namespace, group_name \
                 FROM k8s_clusters ORDER BY name",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(PersistedK8sCluster {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    context_name: row.get(2)?,
                    kubeconfig_path: row.get(3)?,
                    kubeconfig_inline: row.get(4)?,
                    server_url: row.get(5)?,
                    namespace: row.get(6)?,
                    group_name: row.get(7)?,
                })
            })?;
            rows.collect()
        })
    }

    /// Insert a new cluster record.
    pub fn insert(&self, cluster: &PersistedK8sCluster) -> Result<(), rusqlite::Error> {
        self.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO k8s_clusters \
                 (id, name, context_name, kubeconfig_path, kubeconfig_inline, server_url, namespace, group_name) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    cluster.id,
                    cluster.name,
                    cluster.context_name,
                    cluster.kubeconfig_path,
                    cluster.kubeconfig_inline,
                    cluster.server_url,
                    cluster.namespace,
                    cluster.group_name,
                ],
            )?;
            Ok(())
        })
    }

    /// Delete a cluster record by `id`.
    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.db.with_conn(|conn| {
            conn.execute("DELETE FROM k8s_clusters WHERE id=?1", [id])?;
            Ok(())
        })
    }
}
