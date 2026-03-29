import { useAuthStore } from '@/store/auth'

const BASE = ''

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    if (res.status === 401) {
      useAuthStore.getState().lock()
    }
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  /** Check backend health */
  health: () => request<{ status: string }>('GET', '/api/health'),

  /** Auth */
  authStatus: () => request<{ success: boolean; data: { initialized: boolean; locked: boolean } }>('GET', '/api/auth/status'),
  authSetup: (password: string) => request<{ success: boolean }>('POST', '/api/auth/setup', { password }),
  authLogin: (password: string) => request<{ success: boolean; data: { token: string } }>('POST', '/api/auth/login', { password }),
  authLogout: () => request<{ success: boolean }>('POST', '/api/auth/logout'),
  authChangePassword: (current_password: string, new_password: string) =>
    request<{ success: boolean }>('POST', '/api/auth/change-password', { current_password, new_password }),

  /** Connections */
  getConnections: () => request<{ data: unknown[] }>('GET', '/api/connections'),
  createConnection: (body: unknown) => request<{ data: unknown }>('POST', '/api/connections', body),

  /** Tasks */
  getTasks: () => request<{ data: unknown[] }>('GET', '/api/tasks'),
  createTask: (body: unknown) => request<{ data: unknown }>('POST', '/api/tasks', body),

  /** Notifications */
  getNotifications: () => request<{ data: unknown[] }>('GET', '/api/notifications'),

  /** Settings */
  getDesktopSettings: () => request<{ data: unknown }>('GET', '/api/settings/desktop'),
  saveDesktopSettings: (body: unknown) => request<{ data: unknown }>('PUT', '/api/settings/desktop', body),
  getWindowSettings: () => request<{ data: unknown }>('GET', '/api/settings/windows'),
  saveWindowSettings: (body: unknown) => request<{ data: unknown }>('PUT', '/api/settings/windows', body),

  /** SSH Servers */
  getSshServers: () => request<{ success: boolean; data: SshServer[] }>('GET', '/api/ssh/servers'),
  createSshServer: (body: CreateSshServerReq) => request<{ success: boolean; data: SshServer }>('POST', '/api/ssh/servers', body),
  updateSshServer: (id: string, body: Partial<CreateSshServerReq>) => request<{ success: boolean; data: SshServer }>('PUT', `/api/ssh/servers/${id}`, body),
  deleteSshServer: (id: string) => request<{ success: boolean }>('DELETE', `/api/ssh/servers/${id}`),
  testSshServer: (id: string) => request<{ success: boolean; data: { success: boolean; message: string; latency_ms?: number } }>('POST', `/api/ssh/servers/${id}/test`),

  /** Port Mappings */
  getPortMappings: () => request<{ success: boolean; data: PortMapping[] }>('GET', '/api/port-mappings'),
  createPortMapping: (body: CreatePortMappingReq) => request<{ success: boolean; data: PortMapping }>('POST', '/api/port-mappings', body),
  deletePortMapping: (id: string) => request<{ success: boolean }>('DELETE', `/api/port-mappings/${id}`),
  startPortMapping: (id: string) => request<{ success: boolean; data: PortMapping }>('POST', `/api/port-mappings/${id}/start`),
  stopPortMapping: (id: string) => request<{ success: boolean; data: PortMapping }>('POST', `/api/port-mappings/${id}/stop`),

  /** Service Exposures */
  getServiceExposures: () => request<{ success: boolean; data: ServiceExposure[] }>('GET', '/api/service-exposures'),
  createServiceExposure: (body: CreateServiceExposureReq) => request<{ success: boolean; data: ServiceExposure }>('POST', '/api/service-exposures', body),
  deleteServiceExposure: (id: string) => request<{ success: boolean }>('DELETE', `/api/service-exposures/${id}`),
  startServiceExposure: (id: string) => request<{ success: boolean; data: ServiceExposure }>('POST', `/api/service-exposures/${id}/start`),
  stopServiceExposure: (id: string) => request<{ success: boolean; data: ServiceExposure }>('POST', `/api/service-exposures/${id}/stop`)
}

export interface SshServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_method: { type: 'password'; credential_id: string } | { type: 'private_key'; key_path?: string } | { type: 'agent' }
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

