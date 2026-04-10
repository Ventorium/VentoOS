/**
 * Super Terminal — API client
 */
import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'
import type {
  CreatePortMappingReq,
  CreateServiceExposureReq,
  CreateSshServerReq,
  DetectedShell,
  PortMapping,
  ServiceExposure,
  SshConfigHost,
  SshKeyFile,
  SshServer
} from './types'

export const superTerminalApi = {
  // ── SSH Servers ────────────────────────────────────────────────────────
  getSshServers: () => request<ApiResponse<SshServer[]>>('GET', '/api/ssh/servers'),
  createSshServer: (body: CreateSshServerReq) => request<ApiResponse<SshServer>>('POST', '/api/ssh/servers', body),
  updateSshServer: (id: string, body: Partial<CreateSshServerReq>) =>
    request<ApiResponse<SshServer>>('PUT', `/api/ssh/servers/${id}`, body),
  deleteSshServer: (id: string) => request<ApiResponse<null>>('DELETE', `/api/ssh/servers/${id}`),
  testSshServer: (id: string) =>
    request<ApiResponse<{ success: boolean; message: string; latency_ms?: number }>>(
      'POST',
      `/api/ssh/servers/${id}/test`
    ),
  getServerMetrics: (id: string) =>
    request<ApiResponse<Record<string, unknown>>>('GET', `/api/ssh/servers/${id}/metrics`),

  // ── Port Mappings ─────────────────────────────────────────────────────
  getPortMappings: () => request<ApiResponse<PortMapping[]>>('GET', '/api/port-mappings'),
  createPortMapping: (body: CreatePortMappingReq) =>
    request<ApiResponse<PortMapping>>('POST', '/api/port-mappings', body),
  deletePortMapping: (id: string) => request<ApiResponse<null>>('DELETE', `/api/port-mappings/${id}`),
  startPortMapping: (id: string) => request<ApiResponse<PortMapping>>('POST', `/api/port-mappings/${id}/start`),
  stopPortMapping: (id: string) => request<ApiResponse<PortMapping>>('POST', `/api/port-mappings/${id}/stop`),

  // ── Service Exposures ─────────────────────────────────────────────────
  getServiceExposures: () => request<ApiResponse<ServiceExposure[]>>('GET', '/api/service-exposures'),
  createServiceExposure: (body: CreateServiceExposureReq) =>
    request<ApiResponse<ServiceExposure>>('POST', '/api/service-exposures', body),
  deleteServiceExposure: (id: string) => request<ApiResponse<null>>('DELETE', `/api/service-exposures/${id}`),
  startServiceExposure: (id: string) =>
    request<ApiResponse<ServiceExposure>>('POST', `/api/service-exposures/${id}/start`),
  stopServiceExposure: (id: string) =>
    request<ApiResponse<ServiceExposure>>('POST', `/api/service-exposures/${id}/stop`),

  // ── Config & Keys ─────────────────────────────────────────────────────
  getSshConfigHosts: () => request<ApiResponse<SshConfigHost[]>>('GET', '/api/ssh/config-hosts'),
  getSshKeyFiles: () => request<ApiResponse<SshKeyFile[]>>('GET', '/api/ssh/key-files'),
  detectShells: () => request<ApiResponse<DetectedShell[]>>('GET', '/api/ssh/detect-shells')
}
