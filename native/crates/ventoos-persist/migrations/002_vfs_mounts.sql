-- VFS mount sources

CREATE TABLE IF NOT EXISTS vfs_mounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    root TEXT NOT NULL,
    connection_id TEXT,
    group_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
