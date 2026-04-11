-- SSH management tables (servers, port mappings, service exposures, credentials)

CREATE TABLE IF NOT EXISTS ssh_servers (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ssh_credentials (
    server_id TEXT PRIMARY KEY NOT NULL,
    credential_type TEXT NOT NULL,
    credential_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS port_mappings (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_exposures (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
