use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use tokio::process::Command;
use tracing::warn;

use ventoos_core::monitor::{
    CpuCoreInfo, CpuInfo, DiskInfo, MemoryInfo, ProcessMetrics, SystemMetrics,
};
use ventoos_core::types::ApiResponse;

use crate::state::AppState;

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

pub async fn get_system_metrics(
    State(_state): State<AppState>,
) -> impl IntoResponse {
    let metrics = collect_system_metrics().await;
    Json(ApiResponse::ok(metrics))
}

pub async fn get_process_metrics(
    State(_state): State<AppState>,
) -> impl IntoResponse {
    let metrics = collect_process_metrics().await;
    Json(ApiResponse::ok(metrics))
}

// ---------------------------------------------------------------------------
// Helpers – run a command and capture stdout
// ---------------------------------------------------------------------------

async fn run_cmd(program: &str, args: &[&str]) -> String {
    match Command::new(program).args(args).output().await {
        Ok(output) => String::from_utf8_lossy(&output.stdout).to_string(),
        Err(e) => {
            warn!("failed to run {program}: {e}");
            String::new()
        }
    }
}

fn parse_u64(s: &str) -> u64 {
    s.trim().parse::<u64>().unwrap_or(0)
}

fn parse_f64(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(0.0)
}

// ---------------------------------------------------------------------------
// Hostname
// ---------------------------------------------------------------------------

async fn get_hostname() -> String {
    #[cfg(target_os = "windows")]
    {
        run_cmd("hostname", &[]).await.trim().to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        run_cmd("hostname", &[]).await.trim().to_string()
    }
}

// ---------------------------------------------------------------------------
// CPU metrics
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
async fn collect_cpu() -> CpuInfo {
    let core_count_str = run_cmd("sysctl", &["-n", "hw.ncpu"]).await;
    let core_count = core_count_str.trim().parse::<u32>().unwrap_or(1);

    let model_name = run_cmd("sysctl", &["-n", "machdep.cpu.brand_string"])
        .await
        .trim()
        .to_string();

    // `top -l 2 -n 0 -s 0` prints two samples; we want the second for actual
    // delta-based usage. The CPU line looks like: "CPU usage: 5.0% user, 3.0% sys, 92.0% idle"
    let top_output = run_cmd("top", &["-l", "2", "-n", "0", "-s", "0"]).await;
    let mut total_usage = 0.0_f64;
    // Take the last matching line (second sample).
    for line in top_output.lines().rev() {
        if line.starts_with("CPU usage:") {
            if let Some(idle_part) = line.split(',').find(|p| p.contains("idle")) {
                let idle_str = idle_part.trim().split('%').next().unwrap_or("0");
                let idle: f64 = idle_str
                    .chars()
                    .filter(|c| c.is_ascii_digit() || *c == '.')
                    .collect::<String>()
                    .parse()
                    .unwrap_or(0.0);
                total_usage = 100.0 - idle;
            }
            break;
        }
    }

    let cores = (0..core_count)
        .map(|i| CpuCoreInfo {
            core_id: i,
            usage_percent: total_usage, // macOS `top` doesn't give per-core easily
        })
        .collect();

    CpuInfo {
        total_usage_percent: total_usage,
        core_count,
        cores,
        model_name,
    }
}

#[cfg(target_os = "linux")]
async fn collect_cpu() -> CpuInfo {
    use tokio::fs;

    let model_name = {
        let cpuinfo = fs::read_to_string("/proc/cpuinfo").await.unwrap_or_default();
        cpuinfo
            .lines()
            .find(|l| l.starts_with("model name"))
            .and_then(|l| l.split(':').nth(1))
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    };

    // Read /proc/stat twice with a short delay to compute delta-based usage.
    let read_stat = || async {
        let content = fs::read_to_string("/proc/stat").await.unwrap_or_default();
        let mut cores: Vec<(u64, u64)> = Vec::new(); // (total, idle)
        for line in content.lines() {
            if line.starts_with("cpu") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    let values: Vec<u64> = parts[1..].iter().map(|v| parse_u64(v)).collect();
                    let total: u64 = values.iter().sum();
                    let idle = *values.get(3).unwrap_or(&0);
                    cores.push((total, idle));
                }
            }
        }
        cores
    };

    let first = read_stat().await;
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    let second = read_stat().await;

    let mut cpu_cores = Vec::new();
    let mut total_usage = 0.0_f64;

    // Index 0 is the aggregate "cpu" line; 1.. are per-core.
    for (i, ((t1, i1), (t2, i2))) in first.iter().zip(second.iter()).enumerate() {
        let dt = t2.saturating_sub(*t1);
        let di = i2.saturating_sub(*i1);
        let usage = if dt > 0 {
            (1.0 - di as f64 / dt as f64) * 100.0
        } else {
            0.0
        };
        if i == 0 {
            total_usage = usage;
        } else {
            cpu_cores.push(CpuCoreInfo {
                core_id: (i - 1) as u32,
                usage_percent: usage,
            });
        }
    }

    let core_count = cpu_cores.len() as u32;

    CpuInfo {
        total_usage_percent: total_usage,
        core_count,
        cores: cpu_cores,
        model_name,
    }
}

#[cfg(target_os = "windows")]
async fn collect_cpu() -> CpuInfo {
    let core_count_str = run_cmd(
        "wmic",
        &["cpu", "get", "NumberOfLogicalProcessors", "/value"],
    )
    .await;
    let core_count = core_count_str
        .lines()
        .find_map(|l| l.strip_prefix("NumberOfLogicalProcessors="))
        .map(|v| v.trim().parse::<u32>().unwrap_or(1))
        .unwrap_or(1);

    let model_str = run_cmd("wmic", &["cpu", "get", "Name", "/value"]).await;
    let model_name = model_str
        .lines()
        .find_map(|l| l.strip_prefix("Name="))
        .map(|v| v.trim().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let load_str = run_cmd("wmic", &["cpu", "get", "LoadPercentage", "/value"]).await;
    let total_usage = load_str
        .lines()
        .find_map(|l| l.strip_prefix("LoadPercentage="))
        .map(|v| parse_f64(v))
        .unwrap_or(0.0);

    let cores = (0..core_count)
        .map(|i| CpuCoreInfo {
            core_id: i,
            usage_percent: total_usage,
        })
        .collect();

    CpuInfo {
        total_usage_percent: total_usage,
        core_count,
        cores,
        model_name,
    }
}

// ---------------------------------------------------------------------------
// Memory metrics
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
async fn collect_memory() -> MemoryInfo {
    let total_str = run_cmd("sysctl", &["-n", "hw.memsize"]).await;
    let total_bytes = parse_u64(&total_str);

    // vm_stat outputs pages; page size is typically 16384 on Apple Silicon, 4096 on Intel.
    let page_size_str = run_cmd("sysctl", &["-n", "hw.pagesize"]).await;
    let page_size = parse_u64(&page_size_str).max(4096);

    let vm_stat = run_cmd("vm_stat", &[]).await;
    let page_val = |key: &str| -> u64 {
        vm_stat
            .lines()
            .find(|l| l.contains(key))
            .and_then(|l| {
                l.split(':')
                    .nth(1)
                    .map(|v| parse_u64(v.trim().trim_end_matches('.')))
            })
            .unwrap_or(0)
    };

    let free = page_val("Pages free") * page_size;
    let inactive = page_val("Pages inactive") * page_size;
    let speculative = page_val("Pages speculative") * page_size;
    let available_bytes = free + inactive + speculative;
    let used_bytes = total_bytes.saturating_sub(available_bytes);

    #[allow(clippy::cast_precision_loss)]
    let usage_percent = if total_bytes > 0 {
        (used_bytes as f64 / total_bytes as f64) * 100.0
    } else {
        0.0
    };

    // Swap from sysctl
    let swap_output = run_cmd("sysctl", &["-n", "vm.swapusage"]).await;
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let parse_swap_bytes = |key: &str| -> u64 {
        swap_output
            .split_whitespace()
            .collect::<Vec<_>>()
            .windows(3)
            .find(|w| w[0] == key && w[1] == "=")
            .map_or(0, |w| {
                let val_str = w[2].trim_end_matches('M').trim_end_matches('G');
                let val = parse_f64(val_str);
                if w[2].contains('G') {
                    (val * 1024.0 * 1024.0 * 1024.0) as u64
                } else {
                    (val * 1024.0 * 1024.0) as u64
                }
            })
    };

    let swap_total_bytes = parse_swap_bytes("total");
    let swap_used_bytes = parse_swap_bytes("used");

    MemoryInfo {
        total_bytes,
        used_bytes,
        available_bytes,
        usage_percent,
        swap_total_bytes,
        swap_used_bytes,
    }
}

#[cfg(target_os = "linux")]
async fn collect_memory() -> MemoryInfo {
    use tokio::fs;

    let content = fs::read_to_string("/proc/meminfo").await.unwrap_or_default();
    let val = |key: &str| -> u64 {
        content
            .lines()
            .find(|l| l.starts_with(key))
            .and_then(|l| l.split_whitespace().nth(1))
            .map(|v| parse_u64(v) * 1024) // meminfo uses kB
            .unwrap_or(0)
    };

    let total_bytes = val("MemTotal:");
    let available_bytes = val("MemAvailable:");
    let used_bytes = total_bytes.saturating_sub(available_bytes);
    let usage_percent = if total_bytes > 0 {
        (used_bytes as f64 / total_bytes as f64) * 100.0
    } else {
        0.0
    };
    let swap_total_bytes = val("SwapTotal:");
    let swap_used_bytes = swap_total_bytes.saturating_sub(val("SwapFree:"));

    MemoryInfo {
        total_bytes,
        used_bytes,
        available_bytes,
        usage_percent,
        swap_total_bytes,
        swap_used_bytes,
    }
}

#[cfg(target_os = "windows")]
async fn collect_memory() -> MemoryInfo {
    let output = run_cmd(
        "wmic",
        &[
            "OS",
            "get",
            "TotalVisibleMemorySize,FreePhysicalMemory",
            "/value",
        ],
    )
    .await;

    let kv = |key: &str| -> u64 {
        output
            .lines()
            .find_map(|l| l.strip_prefix(key))
            .map(|v| parse_u64(v.trim_start_matches('=')) * 1024)
            .unwrap_or(0)
    };

    let total_bytes = kv("TotalVisibleMemorySize");
    let free_bytes = kv("FreePhysicalMemory");
    let used_bytes = total_bytes.saturating_sub(free_bytes);
    let available_bytes = free_bytes;
    let usage_percent = if total_bytes > 0 {
        (used_bytes as f64 / total_bytes as f64) * 100.0
    } else {
        0.0
    };

    MemoryInfo {
        total_bytes,
        used_bytes,
        available_bytes,
        usage_percent,
        swap_total_bytes: 0,
        swap_used_bytes: 0,
    }
}

// ---------------------------------------------------------------------------
// Disk metrics
// ---------------------------------------------------------------------------

#[cfg(not(target_os = "windows"))]
async fn collect_disks() -> Vec<DiskInfo> {
    // df -kT on Linux, df -k on macOS (no -T support).
    #[cfg(target_os = "linux")]
    let output = run_cmd("df", &["-kT"]).await;
    #[cfg(target_os = "macos")]
    let output = run_cmd("df", &["-k"]).await;

    let mut disks = Vec::new();
    for line in output.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        // Linux df -kT: device fstype 1K-blocks used avail use% mount
        // macOS df -k:  device 1K-blocks used avail capacity mount
        #[cfg(target_os = "linux")]
        {
            if cols.len() >= 7 {
                let device = cols[0].to_string();
                let fs_type = cols[1].to_string();
                let total = parse_u64(cols[2]) * 1024;
                let used = parse_u64(cols[3]) * 1024;
                let avail = parse_u64(cols[4]) * 1024;
                let mount = cols[6].to_string();
                // Skip pseudo filesystems
                if device.starts_with("/dev/") || mount == "/" {
                    let usage = if total > 0 {
                        (used as f64 / total as f64) * 100.0
                    } else {
                        0.0
                    };
                    disks.push(DiskInfo {
                        mount_point: mount,
                        device,
                        fs_type,
                        total_bytes: total,
                        used_bytes: used,
                        available_bytes: avail,
                        usage_percent: usage,
                    });
                }
            }
        }
        #[cfg(target_os = "macos")]
        {
            if cols.len() >= 6 {
                let device = cols[0].to_string();
                let total = parse_u64(cols[1]) * 1024;
                let used = parse_u64(cols[2]) * 1024;
                let avail = parse_u64(cols[3]) * 1024;
                // Last column is the mount point (may contain spaces but typically doesn't
                // for real volumes starting with /dev/).
                let mount = cols[cols.len() - 1].to_string();
                if device.starts_with("/dev/") {
                    #[allow(clippy::cast_precision_loss)]
                    let usage = if total > 0 {
                        (used as f64 / total as f64) * 100.0
                    } else {
                        0.0
                    };
                    disks.push(DiskInfo {
                        mount_point: mount,
                        device,
                        fs_type: String::new(), // macOS df -k doesn't show fstype
                        total_bytes: total,
                        used_bytes: used,
                        available_bytes: avail,
                        usage_percent: usage,
                    });
                }
            }
        }
    }
    disks
}

#[cfg(target_os = "windows")]
async fn collect_disks() -> Vec<DiskInfo> {
    let output = run_cmd(
        "wmic",
        &[
            "logicaldisk",
            "get",
            "DeviceID,FileSystem,Size,FreeSpace",
            "/format:csv",
        ],
    )
    .await;

    let mut disks = Vec::new();
    for line in output.lines().skip(1) {
        let cols: Vec<&str> = line.split(',').collect();
        if cols.len() >= 5 {
            let device = cols[1].trim().to_string();
            let fs_type = cols[2].trim().to_string();
            let free = parse_u64(cols[3].trim());
            let total = parse_u64(cols[4].trim());
            let used = total.saturating_sub(free);
            let usage = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            if !device.is_empty() {
                disks.push(DiskInfo {
                    mount_point: device.clone(),
                    device,
                    fs_type,
                    total_bytes: total,
                    used_bytes: used,
                    available_bytes: free,
                    usage_percent: usage,
                });
            }
        }
    }
    disks
}

// ---------------------------------------------------------------------------
// Process metrics (for the VentoOS server process itself)
// ---------------------------------------------------------------------------

async fn collect_process_metrics() -> ProcessMetrics {
    let pid = std::process::id();

    #[cfg(target_os = "linux")]
    {
        use tokio::fs;

        // /proc/self/stat: fields[13]=utime, [14]=stime (in clock ticks)
        let stat = fs::read_to_string("/proc/self/stat").await.unwrap_or_default();
        let fields: Vec<&str> = stat.split_whitespace().collect();

        let thread_count = fields.get(19).map(|v| v.parse::<u32>().unwrap_or(1)).unwrap_or(1);

        // /proc/self/statm: fields[0]=total pages, [1]=resident pages
        let statm = fs::read_to_string("/proc/self/statm").await.unwrap_or_default();
        let statm_fields: Vec<&str> = statm.split_whitespace().collect();
        let page_size = 4096_u64;
        let virtual_memory_bytes = statm_fields.first().map(|v| parse_u64(v) * page_size).unwrap_or(0);
        let memory_bytes = statm_fields.get(1).map(|v| parse_u64(v) * page_size).unwrap_or(0);

        // uptime from /proc/self/stat field[21] (starttime in jiffies) vs /proc/uptime
        let uptime_str = fs::read_to_string("/proc/uptime").await.unwrap_or_default();
        let system_uptime_secs = parse_f64(uptime_str.split_whitespace().next().unwrap_or("0"));
        let clk_tck = 100_u64; // sysconf(_SC_CLK_TCK) is almost always 100 on Linux
        let start_time_ticks = fields.get(21).copied().map(parse_u64).unwrap_or(0);
        let process_start_secs = start_time_ticks / clk_tck;
        let uptime_seconds = (system_uptime_secs as u64).saturating_sub(process_start_secs);

        ProcessMetrics {
            pid,
            cpu_usage_percent: 0.0, // snapshot; would need two samples
            memory_bytes,
            virtual_memory_bytes,
            thread_count,
            uptime_seconds,
        }
    }

    #[cfg(target_os = "macos")]
    {
        let ps_output = run_cmd(
            "ps",
            &["-o", "pcpu=,rss=,vsz=", "-p", &pid.to_string()],
        )
        .await;

        let cols: Vec<&str> = ps_output.split_whitespace().collect();
        let cpu_usage_percent = cols.first().copied().map_or(0.0, parse_f64);
        let memory_bytes = cols.get(1).map_or(0, |v| parse_u64(v) * 1024); // rss in KB
        let virtual_memory_bytes = cols.get(2).map_or(0, |v| parse_u64(v) * 1024); // vsz in KB

        // Thread count via ps
        let threads_output = run_cmd("ps", &["-M", "-p", &pid.to_string()]).await;
        #[allow(clippy::cast_possible_truncation)]
        let thread_count = threads_output.lines().count().saturating_sub(1).max(1) as u32;

        // Uptime: ps etime
        let etime_output = run_cmd("ps", &["-o", "etime=", "-p", &pid.to_string()]).await;
        let uptime_seconds = parse_etime(etime_output.trim());

        ProcessMetrics {
            pid,
            cpu_usage_percent,
            memory_bytes,
            virtual_memory_bytes,
            thread_count,
            uptime_seconds,
        }
    }

    #[cfg(target_os = "windows")]
    {
        let output = run_cmd(
            "wmic",
            &[
                "process",
                "where",
                &format!("ProcessId={pid}"),
                "get",
                "WorkingSetSize,VirtualSize,ThreadCount",
                "/value",
            ],
        )
        .await;

        let kv = |key: &str| -> u64 {
            output
                .lines()
                .find_map(|l| l.strip_prefix(key))
                .map(|v| parse_u64(v.trim_start_matches('=')))
                .unwrap_or(0)
        };

        ProcessMetrics {
            pid,
            cpu_usage_percent: 0.0,
            memory_bytes: kv("WorkingSetSize"),
            virtual_memory_bytes: kv("VirtualSize"),
            thread_count: kv("ThreadCount") as u32,
            uptime_seconds: 0,
        }
    }
}

/// Parse `ps -o etime` format: `[[dd-]hh:]mm:ss`
#[cfg(target_os = "macos")]
fn parse_etime(s: &str) -> u64 {
    let mut total = 0_u64;
    let (days, rest) = if let Some((d, r)) = s.split_once('-') {
        (parse_u64(d), r)
    } else {
        (0, s)
    };
    total += days * 86400;

    let parts: Vec<&str> = rest.split(':').collect();
    match parts.len() {
        3 => {
            total += parse_u64(parts[0]) * 3600;
            total += parse_u64(parts[1]) * 60;
            total += parse_u64(parts[2]);
        }
        2 => {
            total += parse_u64(parts[0]) * 60;
            total += parse_u64(parts[1]);
        }
        1 => {
            total += parse_u64(parts[0]);
        }
        _ => {}
    }
    total
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

async fn collect_system_metrics() -> SystemMetrics {
    let os_type = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "unknown"
    }
    .to_string();

    let (cpu, memory, disks, hostname) =
        tokio::join!(collect_cpu(), collect_memory(), collect_disks(), get_hostname());

    let timestamp = chrono::Utc::now().to_rfc3339();

    SystemMetrics {
        cpu,
        memory,
        disks,
        timestamp,
        os_type,
        hostname,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_collect_system_metrics_no_panic() {
        let metrics = collect_system_metrics().await;
        assert!(!metrics.os_type.is_empty());
        assert!(!metrics.timestamp.is_empty());
        // core_count should be at least 1
        assert!(metrics.cpu.core_count >= 1);
        // total memory should be > 0 on any real machine
        assert!(metrics.memory.total_bytes > 0);
    }

    #[tokio::test]
    async fn test_collect_process_metrics_no_panic() {
        let metrics = collect_process_metrics().await;
        assert!(metrics.pid > 0);
    }

    #[tokio::test]
    async fn test_get_hostname_no_panic() {
        let hostname = get_hostname().await;
        // hostname may be empty in some CI, but should not panic
        let _ = hostname;
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_parse_etime() {
        assert_eq!(parse_etime("01:30"), 90);
        assert_eq!(parse_etime("1:02:03"), 3723);
        assert_eq!(parse_etime("2-01:00:00"), 2 * 86400 + 3600);
        assert_eq!(parse_etime("45"), 45);
    }
}
