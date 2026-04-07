/**
 * SSH App — API client & types
 */

import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SshServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_method:
    | { type: 'password'; credential_id?: string | null }
    | {
        type: 'private_key'
        key_path?: string | null
        credential_id?: string | null
        passphrase_credential_id?: string | null
      }
    | { type: 'agent' }
  group?: string
  tags: string[]
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  created_at: string
  updated_at: string
  last_connected_at?: string
}

export interface CreateSshServerReq {
  name: string
  host: string
  port?: number
  username: string
  auth_method: SshServer['auth_method']
  group?: string
  tags?: string[]
  password?: string
  private_key?: string
}

export interface PortMapping {
  id: string
  name: string
  ssh_server_id: string
  remote_host: string
  remote_port: number
  local_port: number
  status: 'stopped' | 'starting' | 'active' | 'error'
  created_at: string
}

export interface CreatePortMappingReq {
  name: string
  ssh_server_id: string
  remote_host: string
  remote_port: number
  local_port: number
}

export interface ServiceExposure {
  id: string
  name: string
  source_type: 'local' | 'ssh'
  ssh_server_id?: string
  source_host: string
  source_port: number
  public_port: number
  basic_auth_enabled: boolean
  basic_auth_username?: string
  status: 'stopped' | 'starting' | 'active' | 'error'
  created_at: string
}

export interface CreateServiceExposureReq {
  name: string
  source_type: 'local' | 'ssh'
  ssh_server_id?: string
  source_host: string
  source_port: number
  public_port: number
  basic_auth_enabled: boolean
  basic_auth_username?: string
  basic_auth_password?: string
}

export interface SshConfigHost {
  alias: string
  hostname: string | null
  user: string | null
  port: number | null
  identity_file: string | null
}

export interface SshKeyFile {
  name: string
  path: string
  is_public: boolean
}

// ── API ─────────────────────────────────────────────────────────────────────

export const sshApi = {
  // Servers
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

  // Port Mappings
  getPortMappings: () => request<ApiResponse<PortMapping[]>>('GET', '/api/port-mappings'),
  createPortMapping: (body: CreatePortMappingReq) =>
    request<ApiResponse<PortMapping>>('POST', '/api/port-mappings', body),
  deletePortMapping: (id: string) => request<ApiResponse<null>>('DELETE', `/api/port-mappings/${id}`),
  startPortMapping: (id: string) => request<ApiResponse<PortMapping>>('POST', `/api/port-mappings/${id}/start`),
  stopPortMapping: (id: string) => request<ApiResponse<PortMapping>>('POST', `/api/port-mappings/${id}/stop`),

  // Service Exposures
  getServiceExposures: () => request<ApiResponse<ServiceExposure[]>>('GET', '/api/service-exposures'),
  createServiceExposure: (body: CreateServiceExposureReq) =>
    request<ApiResponse<ServiceExposure>>('POST', '/api/service-exposures', body),
  deleteServiceExposure: (id: string) => request<ApiResponse<null>>('DELETE', `/api/service-exposures/${id}`),
  startServiceExposure: (id: string) =>
    request<ApiResponse<ServiceExposure>>('POST', `/api/service-exposures/${id}/start`),
  stopServiceExposure: (id: string) =>
    request<ApiResponse<ServiceExposure>>('POST', `/api/service-exposures/${id}/stop`),

  // Metrics
  getServerMetrics: (id: string) =>
    request<ApiResponse<Record<string, unknown>>>('GET', `/api/ssh/servers/${id}/metrics`),

  // Config & keys
  getSshConfigHosts: () => request<ApiResponse<SshConfigHost[]>>('GET', '/api/ssh/config-hosts'),
  getSshKeyFiles: () => request<ApiResponse<SshKeyFile[]>>('GET', '/api/ssh/key-files'),
  getSshConfigAliases: () => request<ApiResponse<string[]>>('GET', '/api/ssh/config-aliases')
}
