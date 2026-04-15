CREATE TABLE IF NOT EXISTS k8s_clusters (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    context_name    TEXT NOT NULL,
    kubeconfig_path TEXT,
    kubeconfig_inline TEXT,
    server_url      TEXT,
    namespace       TEXT,
    group_name      TEXT
);
