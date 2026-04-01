//! SMB/CIFS mount manager using OS-native mount commands.
//!
//! Mounts SMB shares to a temporary directory via `mount_smbfs` (macOS) or
//! `mount -t cifs` (Linux) and exposes them as a local path, which the
//! VfsManager then treats identically to a local file system.
//!
//! URI format: `smb://[user[:pass]@]host[:port]/share[/path]`

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing::{debug, warn};

/// Manages OS-level SMB mounts keyed by VFS mount ID.
pub(crate) struct SmbMountManager {
    mounts: Arc<RwLock<HashMap<String, PathBuf>>>,
}

impl SmbMountManager {
    pub fn new() -> Self {
        Self {
            mounts: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Return the local path for the given SMB mount, creating the OS-level
    /// mount if it does not already exist.
    pub async fn get_or_mount(
        &self,
        mount_id: &str,
        smb_uri: &str,
    ) -> Result<PathBuf, String> {
        // Fast path: already mounted
        {
            let guard = self.mounts.read().await;
            if let Some(p) = guard.get(mount_id) {
                // Verify the mount point is still accessible
                if p.exists() {
                    return Ok(p.clone());
                }
            }
        }

        // Create a stable temp directory for this mount
        let mount_point = std::env::temp_dir().join(format!("vos_smb_{mount_id}"));
        tokio::fs::create_dir_all(&mount_point)
            .await
            .map_err(|e| format!("Failed to create SMB mount point: {e}"))?;

        // Execute the OS mount command
        do_mount(smb_uri, &mount_point).await?;

        debug!(
            "Mounted SMB {} at {}",
            smb_uri,
            mount_point.display()
        );

        self.mounts
            .write()
            .await
            .insert(mount_id.to_string(), mount_point.clone());
        Ok(mount_point)
    }

    /// Unmount a previously mounted SMB share.
    #[allow(dead_code)]
    pub async fn unmount(&self, mount_id: &str) {
        let path = self.mounts.write().await.remove(mount_id);
        if let Some(p) = path {
            let _ = do_unmount(&p).await;
        }
    }
}

/// Parse `smb://[user[:pass]@]host[:port]/share` into the tuple
/// `(user, pass, host, port, share_path)`.
fn parse_smb_uri(uri: &str) -> Result<(String, String, String, u16, String), String> {
    let stripped = uri
        .strip_prefix("smb://")
        .ok_or_else(|| format!("Not an smb:// URI: {uri}"))?;

    let (authority, share_path) = match stripped.find('/') {
        Some(idx) => (&stripped[..idx], stripped[idx..].to_string()),
        None => (stripped, "/".to_string()),
    };

    let (userinfo, hostport) = match authority.rfind('@') {
        Some(idx) => (Some(&authority[..idx]), &authority[idx + 1..]),
        None => (None, authority),
    };

    let (host, port) = match hostport.rfind(':') {
        Some(idx) => {
            let p = hostport[idx + 1..]
                .parse::<u16>()
                .map_err(|_| "Invalid SMB port".to_string())?;
            (&hostport[..idx], p)
        }
        None => (hostport, 445u16),
    };

    let (user, pass) = match userinfo {
        None => (String::new(), String::new()),
        Some(ui) => match ui.find(':') {
            Some(idx) => (ui[..idx].to_string(), ui[idx + 1..].to_string()),
            None => (ui.to_string(), String::new()),
        },
    };

    Ok((user, pass, host.to_string(), port, share_path))
}

/// Build the platform-specific mount URI/options.
///
/// On macOS we call `mount_smbfs smb://user:pass@host/share /mount_point`.
/// On Linux we call `mount -t cifs //host/share /mount_point -o user=…,pass=…`.
async fn do_mount(smb_uri: &str, mount_point: &PathBuf) -> Result<(), String> {
    let (user, pass, host, port, share_path) = parse_smb_uri(smb_uri)?;

    #[cfg(target_os = "macos")]
    {
        // macOS: mount_smbfs smb://user:pass@host:port/share /mnt
        let port_suffix = if port == 445 {
            String::new()
        } else {
            format!(":{port}")
        };
        let cred = if user.is_empty() {
            String::new()
        } else if pass.is_empty() {
            format!("{user}@")
        } else {
            format!("{user}:{pass}@")
        };
        let mount_uri = format!("smb://{cred}{host}{port_suffix}{share_path}");
        let output = tokio::process::Command::new("mount_smbfs")
            .arg(&mount_uri)
            .arg(mount_point)
            .output()
            .await
            .map_err(|e| format!("Failed to run mount_smbfs: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("mount_smbfs failed: {stderr}"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: mount -t cifs //host/share /mnt -o user=…,password=…,port=…
        let unc = format!("//{host}{share_path}");
        let mut opts = Vec::new();
        if !user.is_empty() {
            opts.push(format!("username={user}"));
        }
        if !pass.is_empty() {
            opts.push(format!("password={pass}"));
        }
        if port != 445 {
            opts.push(format!("port={port}"));
        }
        let opts_str = if opts.is_empty() {
            "guest".to_string()
        } else {
            opts.join(",")
        };
        let output = tokio::process::Command::new("mount")
            .args(["-t", "cifs", &unc])
            .arg(mount_point)
            .args(["-o", &opts_str])
            .output()
            .await
            .map_err(|e| format!("Failed to run mount: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("mount -t cifs failed: {stderr}"));
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (user, pass, host, port, share_path);
        return Err("SMB mounts are not supported on this platform".to_string());
    }

    Ok(())
}

#[allow(dead_code)]
async fn do_unmount(mount_point: &PathBuf) -> Result<(), String> {
    let output = tokio::process::Command::new("umount")
        .arg(mount_point)
        .output()
        .await
        .map_err(|e| format!("Failed to run umount: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("umount failed: {stderr}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_smb_uri_full() {
        let (user, pass, host, port, path) =
            parse_smb_uri("smb://alice:secret@fileserver.local:445/share/docs").unwrap();
        assert_eq!(user, "alice");
        assert_eq!(pass, "secret");
        assert_eq!(host, "fileserver.local");
        assert_eq!(port, 445);
        assert_eq!(path, "/share/docs");
    }

    #[test]
    fn test_parse_smb_uri_no_creds() {
        let (user, pass, host, port, path) =
            parse_smb_uri("smb://nas.home/backup").unwrap();
        assert_eq!(user, "");
        assert_eq!(pass, "");
        assert_eq!(host, "nas.home");
        assert_eq!(port, 445);
        assert_eq!(path, "/backup");
    }

    #[test]
    fn test_parse_smb_uri_custom_port() {
        let (user, _pass, host, port, _path) =
            parse_smb_uri("smb://admin@server:4445/share").unwrap();
        assert_eq!(user, "admin");
        assert_eq!(host, "server");
        assert_eq!(port, 4445);
    }
}
