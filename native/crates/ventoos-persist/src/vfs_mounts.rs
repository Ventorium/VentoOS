use std::sync::Arc;

use crate::Database;

/// A persisted VFS mount record (plain strings, no dependency on ventoos-vfs types).
#[derive(Debug, Clone)]
pub struct PersistedVfsMount {
    pub id: String,
    pub name: String,
    /// Serialized `VfsSourceKind` (e.g. "local", "sftp", "s3", …).
    pub kind: String,
    pub root: String,
    pub connection_id: Option<String>,
    pub group_name: Option<String>,
    /// JSON-serialized `LocalMountConfig`, or `None` if not configured.
    pub mount_config: Option<String>,
}

/// Persistence layer for VFS mount configurations.
pub struct VfsMountStore {
    db: Arc<Database>,
}

impl VfsMountStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Load all persisted mounts, ordered by name.
    pub fn load_all(&self) -> Result<Vec<PersistedVfsMount>, rusqlite::Error> {
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, kind, root, connection_id, group_name, mount_config \
                 FROM vfs_mounts ORDER BY name",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(PersistedVfsMount {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    kind: row.get(2)?,
                    root: row.get(3)?,
                    connection_id: row.get(4)?,
                    group_name: row.get(5)?,
                    mount_config: row.get(6)?,
                })
            })?;
            rows.collect()
        })
    }

    /// Insert a new mount record.
    pub fn insert(&self, mount: &PersistedVfsMount) -> Result<(), rusqlite::Error> {
        self.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO vfs_mounts (id, name, kind, root, connection_id, group_name, mount_config) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    mount.id,
                    mount.name,
                    mount.kind,
                    mount.root,
                    mount.connection_id,
                    mount.group_name,
                    mount.mount_config,
                ],
            )?;
            Ok(())
        })
    }

    /// Update an existing mount record identified by `id`.
    pub fn update(&self, mount: &PersistedVfsMount) -> Result<(), rusqlite::Error> {
        self.db.with_conn(|conn| {
            conn.execute(
                "UPDATE vfs_mounts SET name=?1, kind=?2, root=?3, connection_id=?4, group_name=?5, mount_config=?6 \
                 WHERE id=?7",
                rusqlite::params![
                    mount.name,
                    mount.kind,
                    mount.root,
                    mount.connection_id,
                    mount.group_name,
                    mount.mount_config,
                    mount.id,
                ],
            )?;
            Ok(())
        })
    }

    /// Delete a mount record by `id`.
    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.db.with_conn(|conn| {
            conn.execute("DELETE FROM vfs_mounts WHERE id=?1", [id])?;
            Ok(())
        })
    }
}
