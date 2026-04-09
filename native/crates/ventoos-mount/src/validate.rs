//! Mount path validation shared between frontend (via API) and backend.
//!
//! Rules:
//! - Not empty, not longer than 512 chars.
//! - Each path segment not longer than 255 chars.
//! - No `.` or `..` path segments (prevent directory traversal).
//! - No NUL, `*`, `?`, `"`, `<`, `>`, `|` characters in path segments.
//! - A leading `~` is allowed (expanded by the server at mount time).

/// Validate a local mount path for use as a FUSE mount point.
///
/// Returns `Ok(())` if valid, or `Err(message)` describing the violation.
pub fn validate_mount_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("挂载路径不能为空".to_string());
    }
    if path.len() > 512 {
        return Err("挂载路径不能超过 512 字符".to_string());
    }
    // Strip leading ~ for validation purposes; it will be expanded at runtime.
    let stripped = if path == "~" || path.starts_with("~/") || path.starts_with("~\\") {
        &path[1..]
    } else {
        path
    };

    // Normalise separators for cross-platform segment checking.
    let normalized = stripped.replace('\\', "/");

    for segment in normalized.split('/').filter(|s| !s.is_empty()) {
        if segment == "." || segment == ".." {
            return Err("挂载路径不能包含 . 或 .. 路径段".to_string());
        }
        if segment.len() > 255 {
            return Err(format!("路径段 '{segment}' 超过 255 字符限制"));
        }
        let forbidden: &[char] = &['\0', '*', '?', '"', '<', '>', '|'];
        if let Some(c) = segment.chars().find(|c| forbidden.contains(c)) {
            return Err(format!("路径段不能包含字符 '{c}'"));
        }
    }
    Ok(())
}

/// Expand a leading `~` to the current user's home directory.
/// Falls back to `/` if `HOME` env is not set.
pub fn expand_home(path: &str) -> String {
    if path == "~" || path.starts_with("~/") {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| "/".to_string());
        if path == "~" {
            home
        } else {
            format!("{}/{}", home.trim_end_matches('/'), &path[2..])
        }
    } else {
        path.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_paths() {
        assert!(validate_mount_path("~/mnt/my-s3").is_ok());
        assert!(validate_mount_path("/home/user/mnt/s3").is_ok());
        assert!(validate_mount_path("~").is_ok());
        assert!(validate_mount_path("/mnt/test-123").is_ok());
    }

    #[test]
    fn rejects_empty() {
        assert!(validate_mount_path("").is_err());
    }

    #[test]
    fn rejects_dotdot() {
        assert!(validate_mount_path("../../../etc").is_err());
        assert!(validate_mount_path("/mnt/../etc").is_err());
        assert!(validate_mount_path("/mnt/./test").is_err());
    }

    #[test]
    fn rejects_forbidden_chars() {
        assert!(validate_mount_path("/mnt/my*folder").is_err());
        assert!(validate_mount_path("/mnt/test?path").is_err());
        assert!(validate_mount_path("/mnt/test|path").is_err());
    }

    #[test]
    fn expand_home_basic() {
        std::env::set_var("HOME", "/home/testuser");
        assert_eq!(expand_home("~/mnt/test"), "/home/testuser/mnt/test");
        assert_eq!(expand_home("~"), "/home/testuser");
        assert_eq!(expand_home("/absolute/path"), "/absolute/path");
    }
}
