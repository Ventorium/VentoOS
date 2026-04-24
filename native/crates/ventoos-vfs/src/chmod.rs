//! File permission modification.
//!
//! - Local: uses `std::fs::set_permissions`
//! - SFTP: uses SFTP chmod command
//! - Others: returns "not supported"

use serde::{Deserialize, Serialize};

/// Request to change file permissions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChmodRequest {
    pub path: String,
    pub mode: u32,
}

/// Set file permissions on a local file.
pub async fn chmod_local(root: &str, rel_path: &str, mode: u32) -> Result<(), String> {
    let root_path = std::path::Path::new(root);
    let clean = rel_path.trim_start_matches('/');
    let candidate = root_path.join(clean);

    // Validate path is under root
    let canonical_root = root_path
        .canonicalize()
        .map_err(|e| format!("Root path error: {e}"))?;
    let canonical = candidate
        .canonicalize()
        .map_err(|e| format!("Path error: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Path traversal denied".into());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(mode);
        tokio::fs::set_permissions(&canonical, perms)
            .await
            .map_err(|e| format!("chmod failed: {e}"))
    }

    #[cfg(not(unix))]
    {
        let _ = (canonical, mode);
        Err("chmod not supported on this platform".into())
    }
}

/// Set file permissions via SFTP.
pub async fn chmod_sftp(
    sftp: &russh_sftp::client::SftpSession,
    root: &str,
    rel_path: &str,
    mode: u32,
) -> Result<(), String> {
    let full_path = if rel_path.is_empty() || rel_path == "/" {
        root.to_string()
    } else {
        let clean = rel_path.trim_start_matches('/');
        format!("{}/{}", root.trim_end_matches('/'), clean)
    };

    // Read current attrs, modify permissions, write back
    let mut attrs = sftp
        .metadata(&full_path)
        .await
        .map_err(|e| format!("SFTP stat failed: {e}"))?;

    attrs.permissions = Some(mode);

    sftp.set_metadata(&full_path, attrs)
        .await
        .map_err(|e| format!("SFTP chmod failed: {e}"))?;

    Ok(())
}

/// Format a Unix permission mode as rwx string.
pub fn mode_to_string(mode: u32) -> String {
    let flags = [
        (0o400, 'r'),
        (0o200, 'w'),
        (0o100, 'x'),
        (0o040, 'r'),
        (0o020, 'w'),
        (0o010, 'x'),
        (0o004, 'r'),
        (0o002, 'w'),
        (0o001, 'x'),
    ];
    flags
        .iter()
        .map(|(bit, ch)| if mode & bit != 0 { *ch } else { '-' })
        .collect()
}

/// Parse an octal permission string (e.g., "755") to a mode number.
pub fn parse_mode(s: &str) -> Result<u32, String> {
    u32::from_str_radix(s, 8).map_err(|e| format!("Invalid permission mode: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn test_mode_to_string() {
        assert_eq!(mode_to_string(0o755), "rwxr-xr-x");
        assert_eq!(mode_to_string(0o644), "rw-r--r--");
        assert_eq!(mode_to_string(0o000), "---------");
        assert_eq!(mode_to_string(0o777), "rwxrwxrwx");
    }

    #[test]
    fn test_parse_mode() {
        assert_eq!(parse_mode("755").unwrap(), 0o755);
        assert_eq!(parse_mode("644").unwrap(), 0o644);
        assert!(parse_mode("xyz").is_err());
    }

    #[tokio::test]
    async fn test_chmod_local() {
        #[cfg(unix)]
        {
            let tmp = tempfile::tempdir().unwrap();
            let root = tmp.path();
            let file_path = root.join("test.txt");
            std::fs::write(&file_path, "test").unwrap();

            let result = chmod_local(root.to_str().unwrap(), "/test.txt", 0o644).await;
            assert!(result.is_ok());

            let perms = std::fs::metadata(&file_path).unwrap().permissions();
            assert_eq!(perms.mode() & 0o777, 0o644);
        }
    }
}
