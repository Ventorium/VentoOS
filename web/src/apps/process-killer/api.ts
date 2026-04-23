import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'

export interface ProcessInfo {
  pid: number
  name: string
  cpu_percent: number
  mem_percent: number
  rss_bytes: number
  vsz_bytes: number
  args: string
}

export interface PortProcessInfo {
  pid: number
  name: string
  port: number
  protocol: string
}

export const processKillerApi = {
  getProcesses: () =>
    request<ApiResponse<ProcessInfo[]>>('GET', '/api/process-killer/processes'),

  findByPort: (port: number) =>
    request<ApiResponse<PortProcessInfo[]>>(
      'GET',
      `/api/process-killer/processes/by-port?port=${port}`
    ),

  killProcess: (pid: number) =>
    request<ApiResponse<{ killed: boolean; pid: number }>>(
      'POST',
      `/api/process-killer/processes/${pid}/kill`
    )
}
