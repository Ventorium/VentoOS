/**
 * HTTP API Client
 *
 * Low-level HTTP client with no business logic.
 * Uses token provider and unauthorized callback injected at boot time,
 * so this layer has zero dependency on the auth service.
 */

import type {
  ApiResponse,
  AuthLoginData,
  AuthStatusData,
  CreatePortMappingReq,
  CreateProcessReq,
  CreateServiceExposureReq,
  CreateSshServerReq,
  PortMapping,
  ServiceExposure,
  SshServer,
  VProcess,
} from './types'

// ─── Token provider (set by services/auth at boot) ─────────────────────────

let _tokenProvider: () => string | null = () => null
let _onUnauthorized: () => void = () => {}

/**
 * Configure the API client with auth callbacks.
 * Call this once during app bootstrap before making any requests.
 */
export function configureApiClient(opts: {
  tokenProvider: () => string | null
  onUnauthorized: () => void
}): void {
  _tokenProvider = opts.tokenProvider
  _onUnauthorized = opts.onUnauthorized
}

// ─── Core request ──────────────────────────────────────────────────────────

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = _tokenProvider()
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    if (res.status === 401) {
      _onUnauthorized()
    }
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ─── API methods ───────────────────────────────────────────────────────────

export const apiClient = {
  /** GET */
  get: <T>(path: string) => request<T>('GET', path),
  /** POST */
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  /** PUT */
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  /** DELETE */
  delete: <T>(path: string) => request<T>('DELETE', path),

  // ── Health ──────────────────────────────────────────────────────────────

  health: () => request<{ status: string }>('GET', '/api/health'),

  // ── Auth ────────────────────────────────────────────────────────────────

  authStatus: () => request<ApiResponse<AuthStatusData>>('GET', '/api/auth/status'),
  authSetup: (password: string) => request<ApiResponse<null>>('POST', '/api/auth/setup', { password }),
  authLogin: (password: string) => request<ApiResponse<AuthLoginData>>('POST', '/api/auth/login', { password }),
  authLogout: () => request<ApiResponse<null>>('POST', '/api/auth/logout'),
  authChangePassword: (current_password: string, new_password: string) =>
    request<ApiResponse<null>>('POST', '/api/auth/change-password', { current_password, new_password }),

  // ── Processes ───────────────────────────────────────────────────────────

  getProcesses: () => request<ApiResponse<VProcess[]>>('GET', '/api/processes'),
  createProcess: (body: CreateProcessReq) => request<ApiResponse<VProcess>>('POST', '/api/processes', body),
  terminateProcess: (pid: number) => request<ApiResponse<null>>('DELETE', `/api/processes/${pid}`),
  suspendProcess: (pid: number) => request<ApiResponse<null>>('PUT', `/api/processes/${pid}/suspend`),
  resumeProcess: (pid: number) => request<ApiResponse<null>>('PUT', `/api/processes/${pid}/resume`),

  // ── Connections ─────────────────────────────────────────────────────────

  getConnections: () => request<ApiResponse<unknown[]>>('GET', '/api/connections'),
  createConnection: (body: unknown) => request<ApiResponse<unknown>>('POST', '/api/connections', body),

  // ── Tasks ────────────────────────────────────────────────────────────────

  getTasks: () => request<ApiResponse<unknown[]>>('GET', '/api/tasks'),
  createTask: (body: unknown) => request<ApiResponse<unknown>>('POST', '/api/tasks', body),

  // ── Notifications ────────────────────────────────────────────────────────

  getNotifications: () => request<ApiResponse<unknown[]>>('GET', '/api/notifications'),

  // ── Settings ─────────────────────────────────────────────────────────────

  getDesktopSettings: () => request<ApiResponse<unknown>>('GET', '/api/settings/desktop'),
  saveDesktopSettings: (body: unknown) => request<ApiResponse<unknown>>('PUT', '/api/settings/desktop', body),
  getWindowSettings: () => request<ApiResponse<unknown>>('GET', '/api/settings/windows'),
  saveWindowSettings: (body: unknown) => request<ApiResponse<unknown>>('PUT', '/api/settings/windows', body),

  // ── SSH Servers ──────────────────────────────────────────────────────────

  getSshServers: () => request<ApiResponse<SshServer[]>>('GET', '/api/ssh/servers'),
  createSshServer: (body: CreateSshServerReq) => request<ApiResponse<SshServer>>('POST', '/api/ssh/servers', body),
  updateSshServer: (id: string, body: Partial<CreateSshServerReq>) =>
    request<ApiResponse<SshServer>>('PUT', `/api/ssh/servers/${id}`, body),
  deleteSshServer: (id: string) => request<ApiResponse<null>>('DELETE', `/api/ssh/servers/${id}`),
  testSshServer: (id: string) =>
    request<ApiResponse<{ success: boolean; message: string; latency_ms?: number }>>('POST', `/api/ssh/servers/${id}/test`),

  // ── Port Mappings ─────────────────────────────────────────────────────────

  getPortMappings: () => request<ApiResponse<PortMapping[]>>('GET', '/api/port-mappings'),
  createPortMapping: (body: CreatePortMappingReq) => request<ApiResponse<PortMapping>>('POST', '/api/port-mappings', body),
  deletePortMapping: (id: string) => request<ApiResponse<null>>('DELETE', `/api/port-mappings/${id}`),
  startPortMapping: (id: string) => request<ApiResponse<PortMapping>>('POST', `/api/port-mappings/${id}/start`),
  stopPortMapping: (id: string) => request<ApiResponse<PortMapping>>('POST', `/api/port-mappings/${id}/stop`),

  // ── Service Exposures ─────────────────────────────────────────────────────

  getServiceExposures: () => request<ApiResponse<ServiceExposure[]>>('GET', '/api/service-exposures'),
  createServiceExposure: (body: CreateServiceExposureReq) =>
    request<ApiResponse<ServiceExposure>>('POST', '/api/service-exposures', body),
  deleteServiceExposure: (id: string) => request<ApiResponse<null>>('DELETE', `/api/service-exposures/${id}`),
  startServiceExposure: (id: string) => request<ApiResponse<ServiceExposure>>('POST', `/api/service-exposures/${id}/start`),
  stopServiceExposure: (id: string) => request<ApiResponse<ServiceExposure>>('POST', `/api/service-exposures/${id}/stop`),
}
