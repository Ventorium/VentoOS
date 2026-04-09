use rusqlite::Connection;
use tracing::info;

/// Run all database migrations.
pub fn run(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );",
    )?;

    let current_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let migrations: Vec<(i64, &str)> = vec![
        (1, include_str!("../migrations/001_initial.sql")),
        (2, include_str!("../migrations/002_vfs_mounts.sql")),
        (3, include_str!("../migrations/003_tokens.sql")),
        (4, include_str!("../migrations/004_vfs_mount_config.sql")),
    ];

    for (version, sql) in migrations {
        if version > current_version {
            info!("Running migration v{version}");
            conn.execute_batch(sql)?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [version],
            )?;
        }
    }

    Ok(())
}
