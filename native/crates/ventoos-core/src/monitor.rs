use serde::{Deserialize, Serialize};

/// CPU information for a single core.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuCoreInfo {
    pub core_id: u32,
    /// Usage percentage 0.0 - 100.0
    pub usage_percent: f64,
}

/// Overall CPU metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    /// Total CPU usage percentage (average across all cores)
    pub total_usage_percent: f64,
    /// Number of logical cores
    pub core_count: u32,
    /// Per-core usage
    pub cores: Vec<CpuCoreInfo>,
    /// CPU model name
    pub model_name: String,
}

/// Memory metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    /// Total physical memory in bytes
    pub total_bytes: u64,
    /// Used memory in bytes
    pub used_bytes: u64,
    /// Available memory in bytes
    pub available_bytes: u64,
    /// Usage percentage 0.0 - 100.0
    pub usage_percent: f64,
    /// Swap total in bytes
    pub swap_total_bytes: u64,
    /// Swap used in bytes
    pub swap_used_bytes: u64,
}

/// Individual disk/partition info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    /// Mount point or drive letter
    pub mount_point: String,
    /// Device name
    pub device: String,
    /// Filesystem type (`ext4`, `apfs`, `ntfs`, etc.)
    pub fs_type: String,
    /// Total space in bytes
    pub total_bytes: u64,
    /// Used space in bytes
    pub used_bytes: u64,
    /// Available space in bytes
    pub available_bytes: u64,
    /// Usage percentage 0.0 - 100.0
    pub usage_percent: f64,
}

/// Process-level resource metrics (for `VentoOS` itself).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessMetrics {
    /// Process ID
    pub pid: u32,
    /// CPU usage percentage
    pub cpu_usage_percent: f64,
    /// Resident memory in bytes
    pub memory_bytes: u64,
    /// Virtual memory in bytes
    pub virtual_memory_bytes: u64,
    /// Number of threads
    pub thread_count: u32,
    /// Process uptime in seconds
    pub uptime_seconds: u64,
}

/// Combined system metrics snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub disks: Vec<DiskInfo>,
    /// Timestamp of the snapshot
    pub timestamp: String,
    /// OS type: "windows", "macos", "linux"
    pub os_type: String,
    /// Hostname
    pub hostname: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_system_metrics() -> SystemMetrics {
        SystemMetrics {
            cpu: CpuInfo {
                total_usage_percent: 25.5,
                core_count: 4,
                cores: vec![
                    CpuCoreInfo {
                        core_id: 0,
                        usage_percent: 30.0,
                    },
                    CpuCoreInfo {
                        core_id: 1,
                        usage_percent: 21.0,
                    },
                ],
                model_name: "Test CPU".to_string(),
            },
            memory: MemoryInfo {
                total_bytes: 16_000_000_000,
                used_bytes: 8_000_000_000,
                available_bytes: 8_000_000_000,
                usage_percent: 50.0,
                swap_total_bytes: 4_000_000_000,
                swap_used_bytes: 1_000_000_000,
            },
            disks: vec![DiskInfo {
                mount_point: "/".to_string(),
                device: "/dev/sda1".to_string(),
                fs_type: "ext4".to_string(),
                total_bytes: 500_000_000_000,
                used_bytes: 200_000_000_000,
                available_bytes: 300_000_000_000,
                usage_percent: 40.0,
            }],
            timestamp: "2026-04-07T00:00:00Z".to_string(),
            os_type: "linux".to_string(),
            hostname: "test-host".to_string(),
        }
    }

    #[test]
    fn test_system_metrics_serialization() {
        let metrics = sample_system_metrics();
        let json = serde_json::to_string(&metrics).expect("serialize");
        let deserialized: SystemMetrics = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.cpu.core_count, 4);
        assert_eq!(deserialized.memory.total_bytes, 16_000_000_000);
        assert_eq!(deserialized.disks.len(), 1);
        assert_eq!(deserialized.hostname, "test-host");
    }

    #[test]
    fn test_process_metrics_serialization() {
        let metrics = ProcessMetrics {
            pid: 1234,
            cpu_usage_percent: 5.5,
            memory_bytes: 100_000_000,
            virtual_memory_bytes: 500_000_000,
            thread_count: 8,
            uptime_seconds: 3600,
        };
        let json = serde_json::to_string(&metrics).expect("serialize");
        let deserialized: ProcessMetrics = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.pid, 1234);
        assert_eq!(deserialized.thread_count, 8);
    }

    #[test]
    fn test_cpu_info_serialization() {
        let cpu = CpuInfo {
            total_usage_percent: 45.0,
            core_count: 8,
            cores: (0..8)
                .map(|i| CpuCoreInfo {
                    core_id: i,
                    usage_percent: 40.0 + i as f64,
                })
                .collect(),
            model_name: "Apple M1".to_string(),
        };
        let json = serde_json::to_string(&cpu).expect("serialize");
        let deserialized: CpuInfo = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.cores.len(), 8);
        assert_eq!(deserialized.model_name, "Apple M1");
    }

    #[test]
    fn test_memory_info_serialization() {
        let mem = MemoryInfo {
            total_bytes: 32_000_000_000,
            used_bytes: 16_000_000_000,
            available_bytes: 16_000_000_000,
            usage_percent: 50.0,
            swap_total_bytes: 8_000_000_000,
            swap_used_bytes: 0,
        };
        let json = serde_json::to_string(&mem).expect("serialize");
        let deserialized: MemoryInfo = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.usage_percent, 50.0);
        assert_eq!(deserialized.swap_used_bytes, 0);
    }

    #[test]
    fn test_disk_info_serialization() {
        let disk = DiskInfo {
            mount_point: "/home".to_string(),
            device: "/dev/sdb1".to_string(),
            fs_type: "btrfs".to_string(),
            total_bytes: 1_000_000_000_000,
            used_bytes: 500_000_000_000,
            available_bytes: 500_000_000_000,
            usage_percent: 50.0,
        };
        let json = serde_json::to_string(&disk).expect("serialize");
        assert!(json.contains("btrfs"));
        let deserialized: DiskInfo = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.mount_point, "/home");
    }
}
