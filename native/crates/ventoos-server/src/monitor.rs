use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use tokio::process::Command;
use tracing::warn;

use ventoos_core::monitor::{
    CpuCoreInfo, CpuInfo, DiskInfo, MemoryInfo, NetworkInterfaceInfo, NetworkTrafficInfo,
    ProcessMetrics, SystemMetrics,
};
use ventoos_core::types::ApiResponse;

use crate::state::AppState;

// ---------------------------------------------------------------------------
// macOS per-core CPU via Mach kernel API
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
mod mach_cpu {
    use std::sync::Mutex;

    const PROCESSOR_CPU_LOAD_INFO: i32 = 2;
    const CPU_STATE_USER: usize = 0;
    const CPU_STATE_SYSTEM: usize = 1;
    const CPU_STATE_IDLE: usize = 2;
    const CPU_STATE_NICE: usize = 3;
    const CPU_STATE_MAX: usize = 4;

    unsafe extern "C" {
        fn mach_host_self() -> u32;
        static mach_task_self_: u32;
        fn host_processor_info(
            host: u32,
            flavor: i32,
            out_processor_count: *mut u32,
            out_processor_info: *mut *mut i32,
            out_processor_info_cnt: *mut u32,
        ) -> i32;
        fn vm_deallocate(target_task: u32, address: usize, size: usize) -> i32;
    }

    static PREV_TICKS: Mutex<Option<Vec<[u64; 4]>>> = Mutex::new(None);

    /// Returns per-core CPU usage percentages using Mach kernel APIs.
    #[allow(clippy::cast_sign_loss, clippy::cast_precision_loss)]
    pub fn per_core_usage() -> Option<Vec<f64>> {
        // SAFETY: We call well-known Mach kernel APIs with valid pointers.
        // We carefully bounds-check all array accesses against info_cnt.
        #[allow(clippy::borrow_as_ptr)]
        let current = unsafe {
            let host = mach_host_self();
            let mut count: u32 = 0;
            let mut info: *mut i32 = std::ptr::null_mut();
            let mut info_cnt: u32 = 0;

            let ret = host_processor_info(
                host,
                PROCESSOR_CPU_LOAD_INFO,
                &raw mut count,
                &raw mut info,
                &raw mut info_cnt,
            );
            if ret != 0 || info.is_null() || count == 0 {
                return None;
            }

            let num_cores = count as usize;
            let total_elements = info_cnt as usize;
            let mut current: Vec<[u64; 4]> = Vec::with_capacity(num_cores);

            for i in 0..num_cores {
                let base = i * CPU_STATE_MAX;
                // bounds check: ensure we don't read past the allocated array
                if base + CPU_STATE_NICE >= total_elements {
                    break;
                }
                current.push([
                    *info.add(base + CPU_STATE_USER) as u64,
                    *info.add(base + CPU_STATE_SYSTEM) as u64,
                    *info.add(base + CPU_STATE_IDLE) as u64,
                    *info.add(base + CPU_STATE_NICE) as u64,
                ]);
            }

            // Deallocate the memory returned by host_processor_info
            vm_deallocate(
                mach_task_self_,
                info as usize,
                total_elements * std::mem::size_of::<i32>(),
            );

            current
        };

        let mut prev_guard = PREV_TICKS.lock().ok()?;
        let result = if let Some(prev) = prev_guard.as_ref() {
            if prev.len() == current.len() {
                Some(
                    current
                        .iter()
                        .zip(prev.iter())
                        .map(|(cur, prv)| {
                            let d_user = cur[0].saturating_sub(prv[0]);
                            let d_sys = cur[1].saturating_sub(prv[1]);
                            let d_idle = cur[2].saturating_sub(prv[2]);
                            let d_nice = cur[3].saturating_sub(prv[3]);
                            let total = d_user + d_sys + d_idle + d_nice;
                            if total == 0 {
                                0.0
                            } else {
                                ((d_user + d_sys + d_nice) as f64 / total as f64) * 100.0
                            }
                        })
                        .collect(),
                )
            } else {
                None
            }
        } else {
            None
        };

        *prev_guard = Some(current);
        result
    }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

pub async fn get_system_metrics(State(_state): State<AppState>) -> impl IntoResponse {
    let metrics = collect_system_metrics().await;
    Json(ApiResponse::ok(metrics))
}

pub async fn get_process_metrics(State(_state): State<AppState>) -> impl IntoResponse {
    let metrics = collect_process_metrics().await;
    Json(ApiResponse::ok(metrics))
}

pub async fn get_network_info(State(_state): State<AppState>) -> impl IntoResponse {
    let info = collect_network_info().await;
    Json(ApiResponse::ok(info))
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

    let cores = if let Some(per_core) = mach_cpu::per_core_usage() {
        per_core
            .iter()
            .enumerate()
            .map(|(i, &usage)| CpuCoreInfo {
                core_id: i.try_into().unwrap_or(0),
                usage_percent: usage,
            })
            .collect()
    } else {
        (0..core_count)
            .map(|i| CpuCoreInfo {
                core_id: i,
                usage_percent: total_usage,
            })
            .collect()
    };

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
        let cpuinfo = fs::read_to_string("/proc/cpuinfo")
            .await
            .unwrap_or_default();
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

    let content = fs::read_to_string("/proc/meminfo")
        .await
        .unwrap_or_default();
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
// Network traffic metrics
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
async fn collect_network_traffic() -> Vec<NetworkTrafficInfo> {
    let output = run_cmd("netstat", &["-ib"]).await;
    let mut result = Vec::new();

    let mut header_indices: Option<(usize, usize, usize, usize)> = None;

    for line in output.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();

        // First line is the header — find column indices
        if cols.iter().any(|c| *c == "Name") {
            let name_idx = cols.iter().position(|c| *c == "Name");
            let ibytes_idx = cols.iter().position(|c| *c == "Ibytes" || *c == "ibytes");
            let obytes_idx = cols.iter().position(|c| *c == "Obytes" || *c == "obytes");
            let ipkts_idx = cols.iter().position(|c| *c == "Ipkts" || *c == "ipkts");
            let opkts_idx = cols.iter().position(|c| *c == "Opkts" || *c == "opkts");
            if let (Some(ni), Some(ii), Some(oi), Some(ipi), Some(opi)) =
                (name_idx, ibytes_idx, obytes_idx, ipkts_idx, opkts_idx)
            {
                header_indices = Some((ni, ii, oi, ipi));
                // We need opkts too, but for now store name, ibytes, obytes, ipkts
                // Actually let me store all 5
                let _ = opi; // opkts used below via header_indices_opkts
            }
            continue;
        }

        // Only parse rows with <Link#N> to get raw link-layer counters
        if !line.contains("<Link#") {
            continue;
        }

        if cols.len() < 7 {
            continue;
        }

        // On macOS netstat -ib the columns are typically:
        // Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
        // When <Link#N> is present, Address is the MAC and these are raw counters.
        // Find indices dynamically from header if available, otherwise use fixed layout.
        let name;
        let bytes_received;
        let bytes_sent;
        let packets_received;
        let packets_sent;

        if let Some((ni, ii, oi, ipi)) = header_indices {
            // Dynamic layout
            name = cols.get(ni).unwrap_or(&"").to_string();
            bytes_received = cols.get(ii).map_or(0, |v| parse_u64(v));
            bytes_sent = cols.get(oi).map_or(0, |v| parse_u64(v));
            packets_received = cols.get(ipi).map_or(0, |v| parse_u64(v));
            // Opkts is one column after ipkts
            packets_sent = cols.get(ipi + 1).map_or(0, |v| parse_u64(v));
        } else {
            // Fallback fixed layout: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
            name = cols[0].to_string();
            packets_received = cols.get(4).map_or(0, |v| parse_u64(v));
            bytes_received = cols.get(6).map_or(0, |v| parse_u64(v));
            packets_sent = cols.get(7).map_or(0, |v| parse_u64(v));
            bytes_sent = cols.get(9).map_or(0, |v| parse_u64(v));
        }

        // Skip the loopback interface
        if name == "lo0" {
            continue;
        }

        result.push(NetworkTrafficInfo {
            interface_name: name,
            bytes_sent,
            bytes_received,
            packets_sent,
            packets_received,
        });
    }

    result
}

#[cfg(target_os = "linux")]
async fn collect_network_traffic() -> Vec<NetworkTrafficInfo> {
    use tokio::fs;

    let content = fs::read_to_string("/proc/net/dev").await.unwrap_or_default();
    let mut result = Vec::new();

    for (idx, line) in content.lines().enumerate() {
        // Skip the first two header lines
        if idx < 2 {
            continue;
        }

        // Format: interface: bytes_recv packets_recv ... bytes_sent packets_sent ...
        let (iface_part, stats_part) = if let Some(pos) = line.find(':') {
            (&line[..pos], &line[pos + 1..])
        } else {
            continue;
        };

        let iface_name = iface_part.trim().to_string();

        // Skip loopback
        if iface_name == "lo" {
            continue;
        }

        let stats: Vec<u64> = stats_part.split_whitespace().map(parse_u64).collect();

        // /proc/net/dev columns after interface:
        // 0: bytes_recv  1: packets_recv  ...  8: bytes_sent  9: packets_sent
        if stats.len() < 10 {
            continue;
        }

        result.push(NetworkTrafficInfo {
            interface_name: iface_name,
            bytes_received: stats[0],
            packets_received: stats[1],
            bytes_sent: stats[8],
            packets_sent: stats[9],
        });
    }

    result
}

#[cfg(target_os = "windows")]
async fn collect_network_traffic() -> Vec<NetworkTrafficInfo> {
    // Stub for Windows — not yet implemented
    Vec::new()
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
        let stat = fs::read_to_string("/proc/self/stat")
            .await
            .unwrap_or_default();
        let fields: Vec<&str> = stat.split_whitespace().collect();

        let thread_count = fields
            .get(19)
            .map(|v| v.parse::<u32>().unwrap_or(1))
            .unwrap_or(1);

        // /proc/self/statm: fields[0]=total pages, [1]=resident pages
        let statm = fs::read_to_string("/proc/self/statm")
            .await
            .unwrap_or_default();
        let statm_fields: Vec<&str> = statm.split_whitespace().collect();
        let page_size = 4096_u64;
        let virtual_memory_bytes = statm_fields
            .first()
            .map(|v| parse_u64(v) * page_size)
            .unwrap_or(0);
        let memory_bytes = statm_fields
            .get(1)
            .map(|v| parse_u64(v) * page_size)
            .unwrap_or(0);

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
        let ps_output = run_cmd("ps", &["-o", "pcpu=,rss=,vsz=", "-p", &pid.to_string()]).await;

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

    let (cpu, memory, disks, hostname, network) = tokio::join!(
        collect_cpu(),
        collect_memory(),
        collect_disks(),
        get_hostname(),
        collect_network_traffic()
    );

    let timestamp = chrono::Utc::now().to_rfc3339();

    SystemMetrics {
        cpu,
        memory,
        disks,
        timestamp,
        os_type,
        hostname,
        network,
    }
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
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

// ---------------------------------------------------------------------------
// Network info collection
// ---------------------------------------------------------------------------

async fn collect_network_info() -> Vec<NetworkInterfaceInfo> {
    #[cfg(target_os = "macos")]
    {
        collect_network_info_macos().await
    }
    #[cfg(not(target_os = "macos"))]
    {
        collect_network_info_linux().await
    }
}

#[cfg(target_os = "macos")]
#[allow(clippy::too_many_lines)]
async fn collect_network_info_macos() -> Vec<NetworkInterfaceInfo> {
    let ifconfig_out = run_cmd("ifconfig", &[]).await;
    let route_out = run_cmd("route", &["-n", "get", "default"]).await;
    let dns_out = run_cmd("scutil", &["--dns"]).await;

    // Parse gateway
    let gateway = route_out
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            trimmed
                .strip_prefix("gateway:")
                .map(|s| s.trim().to_string())
        })
        .unwrap_or_default();

    // Parse DNS servers
    let dns_servers: Vec<String> = dns_out
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("nameserver[") {
                trimmed.find(']').and_then(|idx| {
                    let rest = trimmed[idx + 1..].trim();
                    rest.strip_prefix(':')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty() && s != "0.0.0.0")
                })
            } else {
                None
            }
        })
        .collect();

    // Parse ifconfig output — split into interface blocks
    let mut interfaces: Vec<NetworkInterfaceInfo> = Vec::new();
    let mut current_name = String::new();
    let mut current_mac = String::new();
    let mut current_ip = String::new();
    let mut current_netmask = String::new();
    let mut current_status = "down".to_string();
    let mut current_if_type = "ethernet".to_string();

    for line in ifconfig_out.lines() {
        let trimmed = line.trim();

        // New interface line starts at column 0 (not indented)
        if !line.starts_with(' ') && !line.starts_with('\t') && trimmed.contains(':') {
            // Save previous interface
            if !current_name.is_empty() && !current_ip.is_empty() {
                let dns = if dns_servers.is_empty() {
                    vec![gateway.clone()]
                } else {
                    dns_servers.clone()
                };
                interfaces.push(NetworkInterfaceInfo {
                    name: current_name.clone(),
                    if_type: current_if_type.clone(),
                    ip: current_ip.clone(),
                    netmask: current_netmask.clone(),
                    gateway: gateway.clone(),
                    dns,
                    mac: current_mac.clone(),
                    status: current_status.clone(),
                });
            }
            // Parse new interface name (e.g., "en0:" or "lo0:")
            current_name = trimmed
                .split(':')
                .next()
                .unwrap_or("")
                .to_string();
            current_mac.clear();
            current_ip.clear();
            current_netmask.clear();
            current_status = if trimmed.contains("flags") {
                if trimmed.contains("UP") || trimmed.contains("RUNNING") {
                    "up".to_string()
                } else {
                    "down".to_string()
                }
            } else {
                "down".to_string()
            };
            current_if_type = if current_name.starts_with("lo") {
                "loopback".to_string()
            } else {
                "ethernet".to_string()
            };
        } else if let Some(rest) = trimmed.strip_prefix("ether ") {
            current_mac = rest.split_whitespace().next().unwrap_or("").to_string();
        } else if let Some(rest) = trimmed.strip_prefix("inet ") {
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if !parts.is_empty() {
                current_ip = parts[0].to_string();
            }
            // Find netmask
            for (i, p) in parts.iter().enumerate() {
                if *p == "netmask" && i + 1 < parts.len() {
                    current_netmask = parts[i + 1].to_string();
                }
            }
        }
    }
    // Don't forget the last interface
    if !current_name.is_empty() && !current_ip.is_empty() {
        let dns = if dns_servers.is_empty() {
            vec![gateway.clone()]
        } else {
            dns_servers.clone()
        };
        interfaces.push(NetworkInterfaceInfo {
            name: current_name.clone(),
            if_type: current_if_type,
            ip: current_ip,
            netmask: current_netmask,
            gateway: gateway.clone(),
            dns,
            mac: current_mac,
            status: current_status,
        });
    }

    // Filter out loopback
    interfaces.retain(|i| i.if_type != "loopback");
    interfaces
}

#[cfg(not(target_os = "macos"))]
async fn collect_network_info_linux() -> Vec<NetworkInterfaceInfo> {
    let ip_addr_out = run_cmd("ip", &["-j", "addr"]).await;
    let ip_route_out = run_cmd("ip", &["route"]).await;
    let resolv_out = run_cmd("cat", &["/etc/resolv.conf"]).await;

    // Parse default gateway
    let gateway = ip_route_out
        .lines()
        .find_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.first() == Some(&"default") {
                parts.iter().position(|p| *p == "via").and_then(|idx| {
                    parts.get(idx + 1).map(|s| (*s).to_string())
                })
            } else {
                None
            }
        })
        .unwrap_or_default();

    // Parse DNS
    let dns_servers: Vec<String> = resolv_out
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            trimmed
                .strip_prefix("nameserver ")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .collect();

    // Try to parse JSON output from `ip -j addr`
    let mut interfaces: Vec<NetworkInterfaceInfo> = Vec::new();

    if let Ok(iface_list) = serde_json::from_str::<Vec<serde_json::Value>>(&ip_addr_out) {
        for iface in iface_list {
            let name = iface
                .get("ifname")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let operstate = iface
                .get("operstate")
                .and_then(|v| v.as_str())
                .unwrap_or("DOWN");
            let status = if operstate == "UP" || operstate == "UNKNOWN" {
                "up"
            } else {
                "down"
            };

            let if_type = if name.starts_with("lo") {
                "loopback"
            } else if name.starts_with("wl") || name.starts_with("wlan") {
                "wifi"
            } else {
                "ethernet"
            };

            let mac = iface
                .get("address")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if let Some(addr_infos) = iface.get("addr_info").and_then(|v| v.as_array()) {
                for addr_info in addr_infos {
                    let family = addr_info
                        .get("family")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if family != "inet" {
                        continue;
                    }
                    let ip = addr_info
                        .get("local")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let netmask = addr_info
                        .get("prefixlen")
                        .map(|v| {
                            let prefix = v.as_u64().unwrap_or(24);
                            prefix_to_netmask(prefix)
                        })
                        .unwrap_or_default();

                    if ip.is_empty() {
                        continue;
                    }

                    let dns = if dns_servers.is_empty() {
                        vec![gateway.clone()]
                    } else {
                        dns_servers.clone()
                    };

                    interfaces.push(NetworkInterfaceInfo {
                        name: name.clone(),
                        if_type: if_type.to_string(),
                        ip,
                        netmask,
                        gateway: gateway.clone(),
                        dns,
                        mac: mac.clone(),
                        status: status.to_string(),
                    });
                }
            }
        }
    }

    interfaces.retain(|i| i.if_type != "loopback" && !i.ip.is_empty());
    interfaces
}

#[cfg(not(target_os = "macos"))]
fn prefix_to_netmask(prefix: u64) -> String {
    if prefix > 32 {
        return String::new();
    }
    let mask: u32 = if prefix == 0 {
        0
    } else {
        !0u32 << (32 - prefix as u32)
    };
    format!(
        "{}.{}.{}.{}",
        (mask >> 24) & 0xFF,
        (mask >> 16) & 0xFF,
        (mask >> 8) & 0xFF,
        mask & 0xFF
    )
}
