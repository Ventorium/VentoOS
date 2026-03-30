/**
 * HTTP API Client
 *
 * Low-level HTTP client with no business logic.
 * Uses token provider and unauthorized callback injected at boot time,
 * so this layer has zero dependency on the auth service.
 */

import type {
  AgentConfig,
  ApiResponse,
  AuthLoginData,
  AuthStatusData,
  ChatRequest,
  ChatResponse,
  ChatSession,
  CreateDbConnectionReq,
  CreateK8sClusterReq,
  CreatePortMappingReq,
  CreateProcessReq,
  CreateRedisConnectionReq,
  CreateServiceExposureReq,
  CreateSshServerReq,
  CreateVfsMountReq,
  DbConnectionConfig,
  DbTestResult,
  K8sCluster,
  K8sNamespace,
  K8sResource,
  K8sResourceKind,
  K8sTestResult,
  KubeconfigContext,
  PortMapping,
  QueryResult,
  RedisCommandResult,
  RedisConnectionConfig,
  RedisKeyValue,
  RedisScanResult,
  RedisServerInfo,
  RedisTestResult,
  SchemaInfo,
  ServiceExposure,
  SshServer,
  TableStructure,
  VfsFileContent,
  VfsMount,
  VfsNode,
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

  // ── Database ──────────────────────────────────────────────────────────────

  getDbConnections: () => request<ApiResponse<DbConnectionConfig[]>>('GET', '/api/db/connections'),
  createDbConnection: (body: CreateDbConnectionReq) =>
    request<ApiResponse<DbConnectionConfig>>('POST', '/api/db/connections', body),
  getDbConnection: (id: string) => request<ApiResponse<DbConnectionConfig>>('GET', `/api/db/connections/${id}`),
  deleteDbConnection: (id: string) => request<ApiResponse<null>>('DELETE', `/api/db/connections/${id}`),
  testDbConnection: (id: string) => request<ApiResponse<DbTestResult>>('POST', `/api/db/connections/${id}/test`),
  connectDb: (id: string) => request<ApiResponse<unknown>>('POST', `/api/db/connections/${id}/connect`),
  disconnectDb: (id: string) => request<ApiResponse<unknown>>('POST', `/api/db/connections/${id}/disconnect`),
  getDbSchemas: (id: string) => request<ApiResponse<SchemaInfo[]>>('GET', `/api/db/connections/${id}/schemas`),
  getDbTableStructure: (id: string, table: string) =>
    request<ApiResponse<TableStructure>>('GET', `/api/db/connections/${id}/tables/${table}/structure`),
  getDbTableData: (id: string, table: string, page?: number, pageSize?: number) =>
    request<ApiResponse<QueryResult>>(
      'GET',
      `/api/db/connections/${id}/tables/${table}/data?page=${page ?? 1}&page_size=${pageSize ?? 50}`,
    ),
  executeDbSql: (id: string, sql: string) =>
    request<ApiResponse<QueryResult>>('POST', `/api/db/connections/${id}/query`, { sql }),

  // ── Redis ─────────────────────────────────────────────────────────────────

  getRedisConnections: () => request<ApiResponse<RedisConnectionConfig[]>>('GET', '/api/redis/connections'),
  createRedisConnection: (body: CreateRedisConnectionReq) =>
    request<ApiResponse<RedisConnectionConfig>>('POST', '/api/redis/connections', body),
  getRedisConnection: (id: string) =>
    request<ApiResponse<RedisConnectionConfig>>('GET', `/api/redis/connections/${id}`),
  deleteRedisConnection: (id: string) => request<ApiResponse<null>>('DELETE', `/api/redis/connections/${id}`),
  testRedisConnection: (id: string) =>
    request<ApiResponse<RedisTestResult>>('POST', `/api/redis/connections/${id}/test`),
  connectRedis: (id: string) => request<ApiResponse<unknown>>('POST', `/api/redis/connections/${id}/connect`),
  disconnectRedis: (id: string) => request<ApiResponse<unknown>>('POST', `/api/redis/connections/${id}/disconnect`),
  scanRedisKeys: (id: string, cursor?: string, pattern?: string, count?: number) => {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (pattern) params.set('pattern', pattern)
    if (count) params.set('count', String(count))
    return request<ApiResponse<RedisScanResult>>('GET', `/api/redis/connections/${id}/scan?${params}`)
  },
  getRedisKey: (id: string, key: string) =>
    request<ApiResponse<RedisKeyValue>>('GET', `/api/redis/connections/${id}/keys/${encodeURIComponent(key)}`),
  setRedisKey: (id: string, key: string, value: string, ttl?: number) =>
    request<ApiResponse<unknown>>('POST', `/api/redis/connections/${id}/keys`, { key, value, ttl }),
  deleteRedisKey: (id: string, key: string) =>
    request<ApiResponse<unknown>>('DELETE', `/api/redis/connections/${id}/keys/${encodeURIComponent(key)}`),
  executeRedisCommand: (id: string, command: string) =>
    request<ApiResponse<RedisCommandResult>>('POST', `/api/redis/connections/${id}/command`, { command }),
  getRedisServerInfo: (id: string) =>
    request<ApiResponse<RedisServerInfo>>('GET', `/api/redis/connections/${id}/info`),

  // ── Kubernetes ────────────────────────────────────────────────────────────

  getK8sClusters: () => request<ApiResponse<K8sCluster[]>>('GET', '/api/k8s/clusters'),
  createK8sCluster: (body: CreateK8sClusterReq) =>
    request<ApiResponse<K8sCluster>>('POST', '/api/k8s/clusters', body),
  getK8sCluster: (id: string) => request<ApiResponse<K8sCluster>>('GET', `/api/k8s/clusters/${id}`),
  deleteK8sCluster: (id: string) => request<ApiResponse<null>>('DELETE', `/api/k8s/clusters/${id}`),
  testK8sCluster: (id: string) => request<ApiResponse<K8sTestResult>>('POST', `/api/k8s/clusters/${id}/test`),
  getK8sNamespaces: (id: string) =>
    request<ApiResponse<K8sNamespace[]>>('GET', `/api/k8s/clusters/${id}/namespaces`),
  getK8sResources: (id: string, kind: K8sResourceKind, namespace?: string) => {
    const params = new URLSearchParams({ kind })
    if (namespace) params.set('namespace', namespace)
    return request<ApiResponse<K8sResource[]>>('GET', `/api/k8s/clusters/${id}/resources?${params}`)
  },
  parseKubeconfig: (body: { path?: string; content?: string }) =>
    request<ApiResponse<KubeconfigContext[]>>('POST', '/api/k8s/kubeconfig/parse', body),

  // ── VFS ───────────────────────────────────────────────────────────────────

  getVfsMounts: () => request<ApiResponse<VfsMount[]>>('GET', '/api/vfs/mounts'),
  createVfsMount: (body: CreateVfsMountReq) =>
    request<ApiResponse<VfsMount>>('POST', '/api/vfs/mounts', body),
  getVfsMount: (id: string) => request<ApiResponse<VfsMount>>('GET', `/api/vfs/mounts/${id}`),
  deleteVfsMount: (id: string) => request<ApiResponse<null>>('DELETE', `/api/vfs/mounts/${id}`),
  listVfsDir: (id: string, path?: string) =>
    request<ApiResponse<VfsNode[]>>('GET', `/api/vfs/mounts/${id}/ls?path=${encodeURIComponent(path ?? '/')}`),
  readVfsFile: (id: string, path: string, maxBytes?: number) => {
    const params = new URLSearchParams({ path })
    if (maxBytes) params.set('max_bytes', String(maxBytes))
    return request<ApiResponse<VfsFileContent>>('GET', `/api/vfs/mounts/${id}/read?${params}`)
  },

  // ── AI Agent ──────────────────────────────────────────────────────────────

  getAgentSessions: () => request<ApiResponse<ChatSession[]>>('GET', '/api/agent/sessions'),
  getAgentSession: (id: string) => request<ApiResponse<ChatSession>>('GET', `/api/agent/sessions/${id}`),
  deleteAgentSession: (id: string) => request<ApiResponse<null>>('DELETE', `/api/agent/sessions/${id}`),
  agentChat: (body: ChatRequest) => request<ApiResponse<ChatResponse>>('POST', '/api/agent/chat', body),
  getAgentConfig: () => request<ApiResponse<AgentConfig>>('GET', '/api/agent/config'),
  updateAgentConfig: (body: AgentConfig) => request<ApiResponse<unknown>>('PUT', '/api/agent/config', body),

  // ── SSH Config ────────────────────────────────────────────────────────────

  getSshConfigAliases: () => request<ApiResponse<string[]>>('GET', '/api/ssh/config-aliases'),
}
