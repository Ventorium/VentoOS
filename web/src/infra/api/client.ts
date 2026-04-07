/**
 * HTTP API Client — System-level APIs only
 *
 * Low-level HTTP client with no business logic.
 * App-specific APIs live in their own app directories (e.g. apps/ssh/api.ts).
 */

import type {
  ApiResponse,
  AuthLoginData,
  AuthStatusData,
  CreateProcessReq,
  DesktopSettings,
  LocalFsNode,
  VProcess,
  WindowStateDTO
} from './types'

// ─── Token provider (set by services/auth at boot) ─────────────────────────

let _tokenProvider: () => string | null = () => null
let _onUnauthorized: () => void = () => {}

/**
 * Configure the API client with auth callbacks.
 * Call this once during app bootstrap before making any requests.
 */
export function configureApiClient(opts: { tokenProvider: () => string | null; onUnauthorized: () => void }): void {
  _tokenProvider = opts.tokenProvider
  _onUnauthorized = opts.onUnauthorized
}

/** Get auth headers for custom fetch calls (file uploads, SSE, etc.) */
export function getAuthHeaders(): Record<string, string> {
  const token = _tokenProvider()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/** Handle 401 unauthorized response */
export function handleUnauthorized(res: Response): void {
  if (res.status === 401) _onUnauthorized()
}

/** Core HTTP request — used by both system apiClient and per-app API modules */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = _tokenProvider()
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
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

// ─── System API methods ────────────────────────────────────────────────────

export const apiClient = {
  // Health
  health: () => request<{ status: string }>('GET', '/api/health'),

  // Auth
  authStatus: () => request<ApiResponse<AuthStatusData>>('GET', '/api/auth/status'),
  authSetup: (password: string) => request<ApiResponse<null>>('POST', '/api/auth/setup', { password }),
  authLogin: (password: string) => request<ApiResponse<AuthLoginData>>('POST', '/api/auth/login', { password }),
  authLogout: () => request<ApiResponse<null>>('POST', '/api/auth/logout'),
  authChangePassword: (current_password: string, new_password: string) =>
    request<ApiResponse<null>>('POST', '/api/auth/change-password', { current_password, new_password }),

  // Processes
  getProcesses: () => request<ApiResponse<VProcess[]>>('GET', '/api/processes'),
  createProcess: (body: CreateProcessReq) => request<ApiResponse<VProcess>>('POST', '/api/processes', body),
  terminateProcess: (pid: number) => request<ApiResponse<null>>('DELETE', `/api/processes/${pid}`),
  suspendProcess: (pid: number) => request<ApiResponse<null>>('PUT', `/api/processes/${pid}/suspend`),
  resumeProcess: (pid: number) => request<ApiResponse<null>>('PUT', `/api/processes/${pid}/resume`),

  // Connections
  getConnections: () => request<ApiResponse<unknown[]>>('GET', '/api/connections'),
  createConnection: (body: unknown) => request<ApiResponse<unknown>>('POST', '/api/connections', body),

  // Tasks
  getTasks: () => request<ApiResponse<unknown[]>>('GET', '/api/tasks'),
  createTask: (body: unknown) => request<ApiResponse<unknown>>('POST', '/api/tasks', body),

  // Notifications
  getNotifications: () => request<ApiResponse<unknown[]>>('GET', '/api/notifications'),

  // Desktop & Window Settings
  getDesktopSettings: () => request<ApiResponse<DesktopSettings>>('GET', '/api/settings/desktop'),
  saveDesktopSettings: (body: Partial<DesktopSettings>) =>
    request<ApiResponse<unknown>>('PUT', '/api/settings/desktop', body),
  getWindowSettings: () => request<ApiResponse<WindowStateDTO[]>>('GET', '/api/settings/windows'),
  saveWindowSettings: (body: WindowStateDTO[]) => request<ApiResponse<unknown>>('PUT', '/api/settings/windows', body),

  // Per-App Storage
  listStorageKeys: (appId: string) =>
    request<ApiResponse<string[]>>('GET', `/api/storage/${encodeURIComponent(appId)}`),
  getStorageValue: (appId: string, key: string) =>
    request<ApiResponse<{ key: string; value: string }>>(
      'GET',
      `/api/storage/${encodeURIComponent(appId)}/${encodeURIComponent(key)}`
    ),
  setStorageValue: (appId: string, key: string, value: string) =>
    request<ApiResponse<unknown>>('PUT', `/api/storage/${encodeURIComponent(appId)}/${encodeURIComponent(key)}`, {
      value
    }),
  deleteStorageValue: (appId: string, key: string) =>
    request<ApiResponse<unknown>>('DELETE', `/api/storage/${encodeURIComponent(appId)}/${encodeURIComponent(key)}`),

  // Local Filesystem Browse
  browseLocalFs: (path?: string, dirsOnly?: boolean) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    if (dirsOnly) params.set('dirs_only', 'true')
    return request<ApiResponse<LocalFsNode[]>>('GET', `/api/fs/browse?${params}`)
  }
}
