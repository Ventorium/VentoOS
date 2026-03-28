const BASE = ''

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
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
  saveWindowSettings: (body: unknown) => request<{ data: unknown }>('PUT', '/api/settings/windows', body)
}
