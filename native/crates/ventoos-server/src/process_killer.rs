use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use tokio::process::Command;
use tracing::warn;

use ventoos_core::types::ApiResponse;

use crate::state::AppState;

// ─── Types ─────────────────────────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f64,
    pub mem_percent: f64,
    pub rss_bytes: u64,
    pub vsz_bytes: u64,
    pub args: String,
}

#[derive(serde::Serialize)]
pub struct PortProcessInfo {
    pub pid: u32,
    pub name: String,
    pub port: u16,
    pub protocol: String,
}

#[derive(Deserialize)]
pub struct PortQuery {
    pub port: u16,
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async fn run_cmd(program: &str, args: &[&str]) -> Result<String, std::io::Error> {
    let output = Command::new(program).args(args).output().await?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_u64(s: &str) -> u64 {
    s.trim().parse::<u64>().unwrap_or(0)
}

fn parse_f64(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(0.0)
}

fn parse_u32(s: &str) -> u32 {
    s.trim().parse::<u32>().unwrap_or(0)
}

// ─── List all system processes ─────────────────────────────────────────────

pub async fn list_processes(State(_state): State<AppState>) -> impl IntoResponse {
    let processes = collect_all_processes().await;
    Json(ApiResponse::ok(processes))
}

async fn collect_all_processes() -> Vec<ProcessInfo> {
    #[cfg(target_os = "macos")]
    let output = match run_cmd("ps", &["-ax", "-o", "pid,pcpu,pmem,rss,vsz,comm,args"]).await {
        Ok(o) => o,
        Err(e) => {
            warn!("failed to run ps: {e}");
            return vec![];
        }
    };

    #[cfg(target_os = "linux")]
    let output = match run_cmd("ps", &["-eo", "pid,pcpu,pmem,rss,vsz,comm,args"]).await {
        Ok(o) => o,
        Err(e) => {
            warn!("failed to run ps: {e}");
            return vec![];
        }
    };

    #[cfg(target_os = "windows")]
    let output = match run_cmd(
        "wmic",
        &["process", "get", "ProcessId,PercentProcessorTime,WorkingSetSize,VirtualSize,CommandLine", "/format:csv"],
    )
    .await
    {
        Ok(o) => o,
        Err(e) => {
            warn!("failed to run wmic: {e}");
            return vec![];
        }
    };

    parse_ps_output(&output)
}

fn parse_ps_output(output: &str) -> Vec<ProcessInfo> {
    let mut processes = Vec::new();

    #[cfg(not(target_os = "windows"))]
    {
        // ps output header: PID %CPU %MEM   RSS    VSZ COMM ARGS
        // We skip the first line (header) and parse the rest.
        for line in output.lines().skip(1) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Split by whitespace, but args (last column) may contain spaces.
            // Columns: pid, pcpu, pmem, rss, vsz, comm, args...
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() < 7 {
                continue;
            }

            let pid = parse_u32(parts[0]);
            let cpu_percent = parse_f64(parts[1]);
            let mem_percent = parse_f64(parts[2]);
            let rss = parse_u64(parts[3]) * 1024; // ps outputs KB
            let vsz = parse_u64(parts[4]) * 1024; // ps outputs KB
            let name = parts[5].to_string();
            let args = parts[6..].join(" ");

            processes.push(ProcessInfo {
                pid,
                name,
                cpu_percent,
                mem_percent,
                rss_bytes: rss,
                vsz_bytes: vsz,
                args,
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        // WMIC CSV format: Node,CommandLine,PercentProcessorTime,ProcessId,VirtualSize,WorkingSetSize
        for line in output.lines().skip(1) {
            let cols: Vec<&str> = line.split(',').collect();
            if cols.len() < 6 {
                continue;
            }
            let pid = parse_u32(cols[3]);
            let cpu_percent = parse_f64(cols[2]);
            let rss = parse_u64(cols[5]);
            let vsz = parse_u64(cols[4]);
            let args = cols[1].trim().to_string();
            let name = args.split_whitespace().next().unwrap_or("").to_string();

            processes.push(ProcessInfo {
                pid,
                name,
                cpu_percent,
                mem_percent: 0.0, // not available from wmic easily
                rss_bytes: rss,
                vsz_bytes: vsz,
                args,
            });
        }
    }

    processes
}

// ─── Find processes by port ────────────────────────────────────────────────

pub async fn find_processes_by_port(
    Query(query): Query<PortQuery>,
) -> impl IntoResponse {
    let port = query.port;
    let processes = collect_port_processes(port).await;
    Json(ApiResponse::ok(processes))
}

async fn collect_port_processes(port: u16) -> Vec<PortProcessInfo> {
    let mut results = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let output = match run_cmd("lsof", &["-i", &format!(":{port}"), "-P", "-n"]).await {
            Ok(o) => o,
            Err(e) => {
                warn!("failed to run lsof: {e}");
                return results;
            }
        };

        for line in output.lines().skip(1) {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() < 9 {
                continue;
            }
            let name = cols[0].to_string();
            let pid = parse_u32(cols[1]);
            let proto = cols[7].to_string();
            // cols[8] looks like "*:8080" or "127.0.0.1:8080"
            if pid == 0 {
                continue;
            }
            results.push(PortProcessInfo {
                pid,
                name,
                port,
                protocol: proto,
            });
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Try lsof first, fallback to ss
        let output = match run_cmd("lsof", &["-i", &format!(":{port}"), "-P", "-n"]).await {
            Ok(o) => o,
            Err(_) => match run_cmd("ss", &["-tlnp", &format!("sport = :{port}")]).await {
                Ok(o) => o,
                Err(e) => {
                    warn!("failed to run lsof and ss: {e}");
                    return results;
                }
            },
        };

        if output.contains("COMMAND") {
            // lsof format
            for line in output.lines().skip(1) {
                let cols: Vec<&str> = line.split_whitespace().collect();
                if cols.len() < 9 {
                    continue;
                }
                let name = cols[0].to_string();
                let pid = parse_u32(cols[1]);
                let proto = cols[7].to_string();
                if pid == 0 {
                    continue;
                }
                results.push(PortProcessInfo {
                    pid,
                    name,
                    port,
                    protocol: proto,
                });
            }
        } else {
            // ss format: State  Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
            // Process column looks like "users:((\"node\",pid=1234,fd=21))"
            for line in output.lines().skip(1) {
                let cols: Vec<&str> = line.split_whitespace().collect();
                if cols.len() < 6 {
                    continue;
                }
                // Try to parse pid from the last column
                let last = cols[cols.len() - 1];
                if let Some(pid_str) = last.split("pid=").nth(1) {
                    let pid_val = pid_str.split(',').next().unwrap_or("0");
                    let pid = parse_u32(pid_val);
                    let name = last.split('"').nth(1).unwrap_or("unknown").to_string();
                    if pid == 0 {
                        continue;
                    }
                    results.push(PortProcessInfo {
                        pid,
                        name,
                        port,
                        protocol: "TCP".to_string(),
                    });
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // netstat -ano | findstr :port
        let output = match run_cmd("cmd", &["/C", &format!("netstat -ano | findstr :{port}")]).await {
            Ok(o) => o,
            Err(e) => {
                warn!("failed to run netstat: {e}");
                return results;
            }
        };

        for line in output.lines() {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() < 5 {
                continue;
            }
            let proto = cols[0].to_string();
            let pid = parse_u32(cols[4]);
            if pid == 0 {
                continue;
            }
            // Look up process name via wmic
            let name = match run_cmd("wmic", &["process", "where", &format!("ProcessId={pid}"), "get", "Name", "/value"]).await {
                Ok(n) => n.lines().find_map(|l| l.strip_prefix("Name=")).unwrap_or("unknown").trim().to_string(),
                Err(_) => "unknown".to_string(),
            };
            results.push(PortProcessInfo {
                pid,
                name,
                port,
                protocol: proto,
            });
        }
    }

    // Deduplicate by pid
    let mut seen = std::collections::HashSet::new();
    results.retain(|p| seen.insert(p.pid));
    results
}

// ─── Kill a process ────────────────────────────────────────────────────────

pub async fn kill_process(Path(pid): Path<u32>) -> impl IntoResponse {
    #[cfg(unix)]
    {
        // Try graceful kill first, then force kill
        let _ = Command::new("kill").arg(pid.to_string()).output().await;
        // Give it a moment
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        // Force kill
        match Command::new("kill").arg("-9").arg(pid.to_string()).output().await {
            Ok(output) => {
                if output.status.success() {
                    Json(ApiResponse::ok(serde_json::json!({ "killed": true, "pid": pid }))).into_response()
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ApiResponse::<serde_json::Value>::err(format!(
                            "Failed to kill process {pid}: {stderr}"
                        ))),
                    )
                        .into_response()
                }
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<serde_json::Value>::err(format!(
                    "Failed to execute kill command: {e}"
                ))),
            )
                .into_response(),
        }
    }

    #[cfg(target_os = "windows")]
    {
        match Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).output().await {
            Ok(output) => {
                if output.status.success() {
                    Json(ApiResponse::ok(serde_json::json!({ "killed": true, "pid": pid })))
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ApiResponse::<serde_json::Value>::err(format!(
                            "Failed to kill process {pid}: {stderr}"
                        ))),
                    )
                        .into_response()
                }
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<serde_json::Value>::err(format!(
                    "Failed to execute taskkill: {e}"
                ))),
            )
                .into_response(),
        }
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ps_output_macos_sample() {
        let sample = r#"  PID  %CPU %MEM   RSS    VSZ COMM             ARGS
    1   0.0  0.1  2564  12345 launchd          /sbin/launchd
  123   5.5  2.3  45678 789012 node             node server.js --port 8080
"#;
        let processes = parse_ps_output(sample);
        assert_eq!(processes.len(), 2);
        assert_eq!(processes[0].pid, 1);
        assert_eq!(processes[0].name, "launchd");
        assert_eq!(processes[1].pid, 123);
        assert_eq!(processes[1].cpu_percent, 5.5);
        assert_eq!(processes[1].mem_percent, 2.3);
        assert_eq!(processes[1].rss_bytes, 45678 * 1024);
        assert_eq!(processes[1].args, "node server.js --port 8080");
    }

    #[test]
    fn test_parse_ps_output_empty() {
        let processes = parse_ps_output("");
        assert!(processes.is_empty());
    }

    #[test]
    fn test_parse_ps_output_header_only() {
        let processes = parse_ps_output("  PID  %CPU %MEM   RSS    VSZ COMM             ARGS");
        assert!(processes.is_empty());
    }
}
