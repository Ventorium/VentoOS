//! Sentinel mode support.
//!
//! Connects to Sentinel nodes to discover the current master,
//! then connects to the master for data operations.

use tokio::io::{AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tracing::{debug, warn};

use crate::resp;
use crate::types::SentinelConfig;

/// Result of master discovery from Sentinel.
pub struct SentinelMasterInfo {
    pub host: String,
    pub port: u16,
}

/// Query Sentinel nodes to find the current master.
///
/// Tries each sentinel in order until one responds with master info.
pub async fn discover_master(config: &SentinelConfig) -> Result<SentinelMasterInfo, String> {
    for sentinel in &config.sentinels {
        let addr = format!("{}:{}", sentinel.host, sentinel.port);
        debug!("Querying sentinel at {addr} for master '{}'", config.master_name);

        match try_sentinel(&addr, &config.master_name, config.sentinel_password.as_deref()).await {
            Ok(info) => return Ok(info),
            Err(e) => {
                warn!("Sentinel {addr} failed: {e}");
            }
        }
    }

    Err("All sentinel nodes unreachable or returned no master".into())
}

async fn try_sentinel(
    addr: &str,
    master_name: &str,
    password: Option<&str>,
) -> Result<SentinelMasterInfo, String> {
    let stream = TcpStream::connect(addr)
        .await
        .map_err(|e| format!("Sentinel connect failed: {e}"))?;
    let mut reader = BufReader::new(stream);

    // Authenticate if sentinel password is provided
    if let Some(pwd) = password {
        let cmd = resp::build_command(&["AUTH", pwd]);
        reader
            .get_mut()
            .write_all(&cmd)
            .await
            .map_err(|e| e.to_string())?;
        let r = resp::parse_resp(&mut reader).await?;
        if r.is_error() {
            return Err(format!("Sentinel auth failed: {}", r.to_string_lossy()));
        }
    }

    // SENTINEL GET-MASTER-ADDR-BY-NAME <master_name>
    let cmd = resp::build_command(&["SENTINEL", "GET-MASTER-ADDR-BY-NAME", master_name]);
    reader
        .get_mut()
        .write_all(&cmd)
        .await
        .map_err(|e| e.to_string())?;

    let resp = resp::parse_resp(&mut reader).await?;

    if resp.is_null() {
        return Err(format!("No master named '{master_name}' found"));
    }

    let arr = resp
        .into_array()
        .ok_or("Invalid sentinel response: expected array")?;

    if arr.len() < 2 {
        return Err("Sentinel response too short".into());
    }

    let host = arr[0].as_str().unwrap_or("").to_string();
    let port: u16 = arr[1]
        .as_str()
        .unwrap_or("0")
        .parse()
        .map_err(|_| "Invalid port from sentinel")?;

    if host.is_empty() || port == 0 {
        return Err("Invalid master address from sentinel".into());
    }

    debug!("Sentinel discovered master at {host}:{port}");
    Ok(SentinelMasterInfo { host, port })
}
