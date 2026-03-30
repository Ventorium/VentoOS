/**
 * API Type Definitions
 *
 * Type definitions for all backend API request/response shapes.
 * These mirror the Rust backend types (Serialize/Deserialize).
 */

// ─── Generic wrapper ───────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message?: string
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthStatusData {
  initialized: boolean
  locked: boolean
}

export interface AuthLoginData {
  token: string
}

// ─── Process (backend-owned virtual processes) ─────────────────────────────

export type ProcessStatus = 'running' | 'suspended' | 'terminated'

export interface VProcess {
  pid: number
  app_id: string
  window_id: string
  status: ProcessStatus
  created_at: string
  context: Record<string, unknown>
}

export interface CreateProcessReq {
  app_id: string
  window_id: string
}

// ─── SSH Servers ───────────────────────────────────────────────────────────

export interface SshServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_method:
    | { type: 'password'; credential_id: string }
    | { type: 'private_key'; key_path?: string }
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

// ─── Port Mappings ─────────────────────────────────────────────────────────

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

// ─── Service Exposures ─────────────────────────────────────────────────────

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
