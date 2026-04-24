//! Real-time file tail streaming, similar to `tail -f`.
//!
//! Reads the last N lines of a file and then monitors for new content,
//! streaming new lines as they appear.

use tokio::io::AsyncReadExt;
use tokio::sync::mpsc;

/// Handle to cancel a tail session.
pub struct TailHandle {
    cancel: tokio::sync::oneshot::Sender<()>,
}

impl TailHandle {
    pub fn cancel(self) {
        let _ = self.cancel.send(());
    }
}

/// Read the last `n` lines from a file.
async fn read_last_lines(path: &std::path::Path, n: usize) -> Result<Vec<String>, String> {
    let content = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| format!("Read error: {e}"))?;

    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(n);
    Ok(lines[start..].iter().map(|s| (*s).to_string()).collect())
}

/// Start tailing a local file. Sends initial lines then watches for new content.
/// Returns a handle to cancel and a receiver for new lines.
pub fn tail_local_file(
    root: &str,
    rel_path: &str,
    initial_lines: usize,
    poll_interval: std::time::Duration,
) -> Result<(TailHandle, mpsc::Receiver<String>), String> {
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

    let (tx, rx) = mpsc::channel(256);
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();
    let file_path = canonical.clone();

    tokio::spawn(async move {
        // Send initial lines
        match read_last_lines(&file_path, initial_lines).await {
            Ok(lines) => {
                for line in &lines {
                    if tx.send(line.clone()).await.is_err() {
                        return;
                    }
                }
            }
            Err(e) => {
                let _ = tx.send(format!("[Error: {e}]")).await;
                return;
            }
        }

        // Get initial file size
        let mut offset = match tokio::fs::metadata(&file_path).await {
            Ok(m) => m.len(),
            Err(_) => return,
        };

        let mut interval = tokio::time::interval(poll_interval);
        loop {
            tokio::select! {
                _ = &mut cancel_rx => break,
                _ = interval.tick() => {
                    let Ok(metadata) = tokio::fs::metadata(&file_path).await else {
                        continue;
                    };
                    let current_size = metadata.len();

                    if current_size > offset {
                        // File grew, read new content
                        let Ok(mut file) = tokio::fs::File::open(&file_path).await else {
                            continue;
                        };
                        if tokio::io::AsyncSeekExt::seek(
                            &mut file,
                            std::io::SeekFrom::Start(offset),
                        )
                        .await
                        .is_err()
                        {
                            continue;
                        }

                        let mut new_content = String::new();
                        if file.read_to_string(&mut new_content).await.is_err() {
                            continue;
                        }

                        for line in new_content.lines() {
                            if tx.send(line.to_string()).await.is_err() {
                                return;
                            }
                        }
                        offset = current_size;
                    } else if current_size < offset {
                        // File was truncated, reset
                        offset = current_size;
                    }
                }
            }
        }
    });

    Ok((TailHandle { cancel: cancel_tx }, rx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[tokio::test]
    async fn test_read_last_lines() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.log");
        std::fs::write(&file_path, "line1\nline2\nline3\nline4\nline5\n").unwrap();

        let lines = read_last_lines(&file_path, 3).await.unwrap();
        // Last 3 lines of "line1\nline2\nline3\nline4\nline5" (split by \n with trailing newline -> 5 lines + empty)
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0], "line3");
        assert_eq!(lines[1], "line4");
        assert_eq!(lines[2], "line5");
    }

    #[tokio::test]
    async fn test_tail_detects_growth() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let file_path = root.join("growing.log");
        std::fs::write(&file_path, "initial line\n").unwrap();

        let (handle, mut rx) = tail_local_file(
            root.to_str().unwrap(),
            "/growing.log",
            10,
            std::time::Duration::from_millis(50),
        )
        .unwrap();

        // Receive initial line
        let first = tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv()).await;
        assert!(first.is_ok());

        // Append new content
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&file_path)
            .unwrap();
        writeln!(f, "new line").unwrap();

        // Should receive new line
        let new = tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv()).await;
        assert!(new.is_ok());

        handle.cancel();
    }
}
