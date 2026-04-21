/**
 * Database App — Type definitions
 * Based on Navicat-style PRD
 */

// ── Database engine types ──────────────────────────────────────────────────

export type DbEngine = 'postgresql' | 'mysql' | 'sqlite'

// ── Connection config ──────────────────────────────────────────────────────

export interface SslConfig {
  enabled: boolean
  mode: 'require' | 'verify-ca' | 'verify-full' | 'disable'
  useVerify: boolean
  clientKeyPath?: string
  clientCertPath?: string
  rootCertPath?: string
  crlPath?: string
}

export interface SshTunnelConfig {
  enabled: boolean
  host: string
  port: number
  username: string
  authMethod: 'password' | 'publickey' | 'agent'
  password?: string
  identityFilePath?: string
  passphrase?: string
  savePassword: boolean
}

export interface HttpTunnelConfig {
  enabled: boolean
  tunnelUrl: string
  username?: string
  password?: string
}

export interface DbConnectionConfig {
  id: string
  name: string
  engine: DbEngine
  host?: string
  port?: number
  username?: string
  database?: string
  ssl_enabled: boolean
  ssl?: SslConfig
  ssh?: SshTunnelConfig
  http?: HttpTunnelConfig
  group?: string
  sqlite_path?: string
  notes?: string
  // Advanced
  connectTimeout?: number
  readTimeout?: number
  encoding?: string
  keepAliveInterval?: number
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
  ssl?: SslConfig
  ssh?: SshTunnelConfig
  http?: HttpTunnelConfig
  group?: string
  sqlite_path?: string
  notes?: string
  connectTimeout?: number
  readTimeout?: number
  encoding?: string
  keepAliveInterval?: number
}

// ── Connection status ──────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

// ── Schema & database objects ──────────────────────────────────────────────

export interface SchemaInfo {
  name: string
  tables: TableInfo[]
}

export interface TableInfo {
  name: string
  row_count: number | null
  table_type: string
}

export interface DbObject {
  name: string
  type: DbObjectType
  schema?: string
  oid?: number
  owner?: string
  rowCount?: number
  dataSize?: number
  indexSize?: number
  engine?: string
  charset?: string
  comment?: string
  hasIndexes?: boolean
  hasTriggers?: boolean
  tableType?: string
  partitionOf?: string
  acl?: string
  primaryKeyCount?: number
}

export type DbObjectType = 'table' | 'view' | 'materialized_view' | 'function' | 'event' | 'trigger' | 'sequence'

// ── Object category per DB type ────────────────────────────────────────────

export type ObjectCategory = 'tables' | 'views' | 'materialized_views' | 'functions' | 'events' | 'triggers' | 'queries'

export const OBJECT_CATEGORIES: Record<DbEngine, { key: ObjectCategory; label: string }[]> = {
  postgresql: [
    { key: 'tables', label: '表' },
    { key: 'views', label: '视图' },
    { key: 'materialized_views', label: '实体化视图' },
    { key: 'functions', label: '函数' },
    { key: 'queries', label: '查询' }
  ],
  mysql: [
    { key: 'tables', label: '表' },
    { key: 'views', label: '视图' },
    { key: 'functions', label: '函数' },
    { key: 'events', label: '事件' },
    { key: 'queries', label: '查询' }
  ],
  sqlite: [
    { key: 'tables', label: '表' },
    { key: 'views', label: '视图' },
    { key: 'triggers', label: '触发器' },
    { key: 'queries', label: '查询' }
  ]
}

// ── Table structure ────────────────────────────────────────────────────────

export interface ColumnInfo {
  name: string
  data_type: string
  nullable: boolean
  default_value: string | null
  is_primary_key: boolean
  is_foreign_key?: boolean
  length?: number
  precision?: number
  collation?: string
  comment?: string
}

export interface IndexInfo {
  name: string
  columns: string[]
  unique: boolean
  is_primary?: boolean
  method?: string // BTree, Hash, GiST, GIN
  comment?: string
}

export interface ForeignKeyInfo {
  name: string
  column: string
  referencedTable: string
  referencedColumn: string
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'
  onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'
}

export interface UniqueConstraint {
  name: string
  columns: string[]
}

export interface CheckConstraint {
  name: string
  expression: string
}

export interface TriggerInfo {
  name: string
  timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF'
  event: 'INSERT' | 'UPDATE' | 'DELETE'
  enabled: boolean
  definition: string
}

export interface TableStructure {
  table_name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  foreignKeys?: ForeignKeyInfo[]
  uniqueConstraints?: UniqueConstraint[]
  checkConstraints?: CheckConstraint[]
  triggers?: TriggerInfo[]
}

// ── Query results ──────────────────────────────────────────────────────────

export interface QueryResult {
  columns: string[]
  column_types?: string[]
  rows: unknown[][]
  affected_rows: number
  execution_time_ms: number
  row_count?: number
}

// ── Test result ────────────────────────────────────────────────────────────

export interface DbTestResult {
  success: boolean
  message: string
  latency_ms?: number
  server_version?: string
}

// ── Filter & sort ──────────────────────────────────────────────────────────

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'is_null'
  | 'is_not_null'
  | 'starts_with'
  | 'ends_with'
  | 'in_list'

export interface FilterCondition {
  id: string
  enabled: boolean
  field: string
  operator: FilterOperator
  value: string
  logic: 'and' | 'or'
}

export interface SortRule {
  id: string
  field: string
  direction: 'asc' | 'desc'
}

// ── Tabs ───────────────────────────────────────────────────────────────────

export type MainTabType = 'objects' | 'data' | 'design' | 'query'

export interface TabItem {
  id: string
  type: MainTabType
  label: string
  icon?: string
  connId: string
  database?: string
  schema?: string
  table?: string
  closable: boolean
}

// ── Tree node ──────────────────────────────────────────────────────────────

export type TreeNodeType =
  | 'root'
  | 'group'
  | 'connection'
  | 'database'
  | 'schema'
  | 'category' // 表/视图/函数 等分类节点
  | 'table'
  | 'view'
  | 'materialized_view'
  | 'function'
  | 'event'
  | 'trigger'

export interface TreeNode {
  id: string
  type: TreeNodeType
  name: string
  engine?: DbEngine
  connId?: string
  database?: string
  schema?: string
  parentId?: string
  connectionStatus?: ConnectionStatus
  children?: TreeNode[]
  isExpanded?: boolean
  isLoading?: boolean
}

// ── Info panel data ────────────────────────────────────────────────────────

export interface InfoPanelData {
  type: TreeNodeType
  name: string
  icon?: string
  engine?: DbEngine
  meta: Record<string, string | number | boolean | undefined>
}
