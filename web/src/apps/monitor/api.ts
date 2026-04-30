import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'

export interface CpuCoreInfo {
  core_id: number
  usage_percent: number
}

export interface CpuInfo {
  total_usage_percent: number
  core_count: number
  cores: CpuCoreInfo[]
  model_name: string
}

export interface MemoryInfo {
  total_bytes: number
  used_bytes: number
  available_bytes: number
  usage_percent: number
  swap_total_bytes: number
  swap_used_bytes: number
}

export interface DiskInfo {
  mount_point: string
  device: string
  fs_type: string
  total_bytes: number
  used_bytes: number
  available_bytes: number
  usage_percent: number
}

export interface ProcessMetrics {
  pid: number
  cpu_usage_percent: number
  memory_bytes: number
  virtual_memory_bytes: number
  thread_count: number
  uptime_seconds: number
}

export interface NetworkTrafficInfo {
  interface_name: string
  bytes_sent: number
  bytes_received: number
  packets_sent: number
  packets_received: number
}

export interface SystemMetrics {
  cpu: CpuInfo
  memory: MemoryInfo
  disks: DiskInfo[]
  network: NetworkTrafficInfo[]
  timestamp: string
  os_type: string
  hostname: string
}

export const monitorApi = {
  getSystemMetrics: () => request<ApiResponse<SystemMetrics>>('GET', '/api/monitor/system'),
  getProcessMetrics: () => request<ApiResponse<ProcessMetrics>>('GET', '/api/monitor/process')
}
