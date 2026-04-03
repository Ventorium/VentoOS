//! Enhanced file search with glob pattern matching.

use crate::types::VfsNode;

/// Check if a filename matches a glob pattern.
///
/// Supports `*` (any sequence of chars), `?` (single char), and `[abc]` character classes.
pub fn matches_glob(name: &str, pattern: &str) -> bool {
    glob_match(name.as_bytes(), pattern.as_bytes())
}

fn glob_match(name: &[u8], pattern: &[u8]) -> bool {
    let mut ni = 0;
    let mut pi = 0;
    let mut star_pi = usize::MAX;
    let mut match_ni = 0;

    while ni < name.len() {
        if pi < pattern.len() && (pattern[pi] == b'?' || pattern[pi].to_ascii_lowercase() == name[ni].to_ascii_lowercase()) {
            ni += 1;
            pi += 1;
        } else if pi < pattern.len() && pattern[pi] == b'[' {
            // Character class
            if let Some((matched, new_pi)) = match_char_class(&pattern[pi..], name[ni]) {
                if matched {
                    ni += 1;
                    pi += new_pi;
                } else {
                    if star_pi == usize::MAX {
                        return false;
                    }
                    match_ni += 1;
                    ni = match_ni;
                    pi = star_pi + 1;
                }
            } else {
                return false;
            }
        } else if pi < pattern.len() && pattern[pi] == b'*' {
            star_pi = pi;
            match_ni = ni;
            pi += 1;
        } else if star_pi != usize::MAX {
            match_ni += 1;
            ni = match_ni;
            pi = star_pi + 1;
        } else {
            return false;
        }
    }

    while pi < pattern.len() && pattern[pi] == b'*' {
        pi += 1;
    }

    pi == pattern.len()
}

/// Try to match a character class like `[abc]` or `[a-z]`.
/// Returns (matched, bytes consumed from pattern) or None if malformed.
fn match_char_class(pattern: &[u8], ch: u8) -> Option<(bool, usize)> {
    if pattern.is_empty() || pattern[0] != b'[' {
        return None;
    }

    let mut i = 1;
    let negate = i < pattern.len() && pattern[i] == b'!';
    if negate {
        i += 1;
    }

    let mut matched = false;
    while i < pattern.len() && pattern[i] != b']' {
        if i + 2 < pattern.len() && pattern[i + 1] == b'-' {
            let lo = pattern[i].to_ascii_lowercase();
            let hi = pattern[i + 2].to_ascii_lowercase();
            let c = ch.to_ascii_lowercase();
            if c >= lo && c <= hi {
                matched = true;
            }
            i += 3;
        } else {
            if pattern[i].to_ascii_lowercase() == ch.to_ascii_lowercase() {
                matched = true;
            }
            i += 1;
        }
    }

    if i < pattern.len() && pattern[i] == b']' {
        if negate {
            matched = !matched;
        }
        Some((matched, i + 1))
    } else {
        None
    }
}

/// Determine if a query string is a glob pattern (contains *, ?, or [).
pub fn is_glob_pattern(query: &str) -> bool {
    query.contains('*') || query.contains('?') || query.contains('[')
}

/// Match a file name against a search query. Supports glob patterns and substring matching.
pub fn matches_query(name: &str, query: &str) -> bool {
    if is_glob_pattern(query) {
        matches_glob(name, query)
    } else {
        name.to_lowercase().contains(&query.to_lowercase())
    }
}

/// Recursively search local filesystem with glob support.
pub async fn search_local_recursive(
    dir: &std::path::Path,
    root: &std::path::Path,
    query: &str,
    limit: usize,
    results: &mut Vec<VfsNode>,
) -> Result<(), String> {
    if results.len() >= limit {
        return Ok(());
    }

    let mut read_dir = tokio::fs::read_dir(dir)
        .await
        .map_err(|e| format!("Read dir failed: {e}"))?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        if results.len() >= limit {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let metadata = entry.metadata().await.ok();
        let is_dir = metadata.as_ref().is_some_and(std::fs::Metadata::is_dir);

        if matches_query(&name, query) {
            let full = entry.path();
            let rel = full
                .strip_prefix(root)
                .unwrap_or(&full)
                .to_string_lossy()
                .to_string();
            let rel_path = format!("/{rel}");
            let size = metadata
                .as_ref()
                .and_then(|m| if m.is_file() { Some(m.len()) } else { None });
            let modified = metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.to_rfc3339()
            });
            results.push(VfsNode {
                name: name.clone(),
                path: rel_path,
                is_dir,
                size,
                modified,
                permissions: None,
            });
        }

        if is_dir {
            Box::pin(search_local_recursive(
                &entry.path(),
                root,
                query,
                limit,
                results,
            ))
            .await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_glob_star() {
        assert!(matches_glob("hello.txt", "*.txt"));
        assert!(matches_glob("README.md", "*.md"));
        assert!(!matches_glob("hello.txt", "*.md"));
    }

    #[test]
    fn test_glob_question() {
        assert!(matches_glob("a.txt", "?.txt"));
        assert!(!matches_glob("ab.txt", "?.txt"));
    }

    #[test]
    fn test_glob_char_class() {
        assert!(matches_glob("a.txt", "[abc].txt"));
        assert!(!matches_glob("d.txt", "[abc].txt"));
    }

    #[test]
    fn test_glob_range() {
        assert!(matches_glob("b.txt", "[a-c].txt"));
        assert!(!matches_glob("d.txt", "[a-c].txt"));
    }

    #[test]
    fn test_glob_mixed() {
        assert!(matches_glob("test_file.rs", "test_*.rs"));
        assert!(matches_glob("hello_world.txt", "*world*"));
    }

    #[test]
    fn test_is_glob() {
        assert!(is_glob_pattern("*.txt"));
        assert!(is_glob_pattern("test?.rs"));
        assert!(!is_glob_pattern("hello"));
    }

    #[test]
    fn test_matches_query_substring() {
        assert!(matches_query("Readme.md", "readme"));
        assert!(matches_query("CONFIG.toml", "config"));
    }

    #[test]
    fn test_matches_query_glob() {
        assert!(matches_query("main.rs", "*.rs"));
        assert!(!matches_query("main.rs", "*.txt"));
    }
}
