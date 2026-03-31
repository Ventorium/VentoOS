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

// SSH config import & key files
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

// ─── Database ──────────────────────────────────────────────────────────────

export type DbEngine = 'postgresql' | 'mysql' | 'sqlite'

export interface DbConnectionConfig {
  id: string
  name: string
  engine: DbEngine
  host: string
  port: number
  username?: string
  database?: string
  ssl_enabled: boolean
  group?: string
  sqlite_path?: string
}

export interface CreateDbConnectionReq {
  name: string
  engine: DbEngine
  host?: string
  port?: number
  username?: string
  password?: string
  database?: string
  ssl_enabled?: boolean
  group?: string
  sqlite_path?: string
}

export interface SchemaInfo {
  name: string
  tables: TableInfo[]
}

export interface TableInfo {
  name: string
  row_count: number | null
  table_type: string
}

export interface ColumnInfo {
  name: string
  data_type: string
  nullable: boolean
  default_value: string | null
  is_primary_key: boolean
}

export interface IndexInfo {
  name: string
  columns: string[]
  unique: boolean
}

export interface TableStructure {
  table_name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  affected_rows: number
  execution_time_ms: number
}

export interface DbTestResult {
  success: boolean
  message: string
  latency_ms?: number
  server_version?: string
}

// ─── Redis ─────────────────────────────────────────────────────────────────

export interface RedisConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  password?: string
  username?: string
  db: number
  group?: string
  ssl_enabled: boolean
}

export interface CreateRedisConnectionReq {
  name: string
  host: string
  port?: number
  password?: string
  username?: string
  db?: number
  group?: string
  ssl_enabled?: boolean
}

export interface RedisKeyInfo {
  key: string
  key_type: string
  ttl: number
  size?: number
}

export interface RedisKeyValue {
  key: string
  key_type: string
  ttl: number
  value: unknown
  encoding?: string
}

export interface RedisCommandResult {
  result: unknown
  execution_time_ms: number
}

export interface RedisTestResult {
  success: boolean
  message: string
  latency_ms?: number
  server_info?: unknown
}

export interface RedisServerInfo {
  version: string
  connected_clients: number
  used_memory_human: string
  total_keys: number
  uptime_days: number
}

export interface RedisScanResult {
  cursor: string
  keys: RedisKeyInfo[]
  finished: boolean
}

// ─── Kubernetes ────────────────────────────────────────────────────────────

export interface K8sCluster {
  id: string
  name: string
  context_name: string
  kubeconfig_path?: string
  kubeconfig_inline?: string
  server_url?: string
  namespace?: string
  group?: string
}

export interface CreateK8sClusterReq {
  name: string
  kubeconfig_path?: string
  kubeconfig_inline?: string
  context_name?: string
  default_namespace?: string
  group?: string
}

export interface K8sNamespace {
  name: string
  status: string
}

export type K8sResourceKind =
  | 'pod'
  | 'deployment'
  | 'service'
  | 'configmap'
  | 'secret'
  | 'ingress'
  | 'statefulset'
  | 'daemonset'
  | 'job'
  | 'cronjob'
  | 'replicaset'
  | 'persistentvolumeclaim'
  | 'persistentvolume'
  | 'storageclass'
  | 'namespace'
  | 'serviceaccount'
  | 'networkpolicy'
  | 'node'
  | 'replicaset'
  | 'networkpolicy'
  | 'serviceaccount'

export interface K8sResource {
  name: string
  namespace?: string
  kind: string
  status?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  raw?: unknown
}

export interface K8sTestResult {
  success: boolean
  message: string
  server_version?: string
}

export interface KubeconfigContext {
  name: string
  cluster: string
  user: string
  namespace?: string
}

// ─── VFS ───────────────────────────────────────────────────────────────────

export type VfsSourceKind = 'local' | 'sftp' | 'ftp' | 'smb' | 's3'

export interface VfsMount {
  id: string
  name: string
  kind: VfsSourceKind
  root: string
  connection_id?: string
  group?: string
}

export interface CreateVfsMountReq {
  name: string
  kind: VfsSourceKind
  root: string
  connection_id?: string
  group?: string
}

export interface VfsNode {
  name: string
  path: string
  is_dir: boolean
  size?: number
  modified?: string
  permissions?: string
}

export interface VfsFileContent {
  path: string
  size: number
  content: string
  is_binary: boolean
  truncated: boolean
}

// ─── Local Filesystem Browse (system capability) ────────────────────────────

export interface LocalFsNode {
  name: string
  path: string
  is_dir: boolean
  size?: number
  modified?: string
}

// ─── AI Agent ──────────────────────────────────────────────────────────────

export type AgentEngine = 'claude_code' | 'codex' | 'open_code' | 'custom'
export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface ChatRequest {
  session_id?: string
  message: string
  context?: string
}

export interface ChatResponse {
  session_id: string
  message: ChatMessage
}

export interface AgentConfig {
  engine: AgentEngine
  enabled: boolean
  api_key?: string
  endpoint?: string
}
