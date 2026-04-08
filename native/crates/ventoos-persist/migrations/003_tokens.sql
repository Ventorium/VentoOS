-- Auth tokens persistence

CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
