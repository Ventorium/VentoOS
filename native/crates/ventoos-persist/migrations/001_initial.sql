-- Initial VentoOS schema

CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    connection_type TEXT NOT NULL,
    group_name TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    favorite INTEGER NOT NULL DEFAULT 0,
    host TEXT,
    port INTEGER,
    username TEXT,
    credential_id TEXT,
    database_name TEXT,
    tunnel TEXT NOT NULL DEFAULT '{"none":null}',
    status TEXT NOT NULL DEFAULT 'draft',
    is_temporary INTEGER NOT NULL DEFAULT 0,
    source_resource_id TEXT,
    extra TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    priority TEXT NOT NULL DEFAULT 'normal',
    risk_level TEXT NOT NULL DEFAULT 'none',
    source TEXT NOT NULL DEFAULT 'user',
    progress REAL,
    parent_task_id TEXT REFERENCES tasks(id),
    connection_id TEXT REFERENCES connections(id),
    resource_id TEXT,
    result TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    source TEXT NOT NULL DEFAULT 'system',
    read INTEGER NOT NULL DEFAULT 0,
    action_url TEXT,
    task_id TEXT REFERENCES tasks(id),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS window_states (
    id TEXT PRIMARY KEY NOT NULL,
    app_id TEXT NOT NULL,
    title TEXT NOT NULL,
    x REAL NOT NULL DEFAULT 100,
    y REAL NOT NULL DEFAULT 100,
    width REAL NOT NULL DEFAULT 800,
    height REAL NOT NULL DEFAULT 600,
    z_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    is_maximized INTEGER NOT NULL DEFAULT 0,
    tab_states TEXT,
    app_state TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(connection_type);
CREATE INDEX IF NOT EXISTS idx_connections_group ON connections(group_name);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
