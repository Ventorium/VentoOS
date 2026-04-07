/**
 * Database App — API client & types
 */

import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── API ─────────────────────────────────────────────────────────────────────

export const dbApi = {
  getDbConnections: () => request<ApiResponse<DbConnectionConfig[]>>('GET', '/api/db/connections'),
  createDbConnection: (body: CreateDbConnectionReq) =>
    request<ApiResponse<DbConnectionConfig>>('POST', '/api/db/connections', body),
  getDbConnection: (id: string) => request<ApiResponse<DbConnectionConfig>>('GET', `/api/db/connections/${id}`),
  deleteDbConnection: (id: string) => request<ApiResponse<null>>('DELETE', `/api/db/connections/${id}`),
  testDbConnection: (id: string) => request<ApiResponse<DbTestResult>>('POST', `/api/db/connections/${id}/test`),
  testDbConnectionInline: (body: CreateDbConnectionReq) =>
    request<ApiResponse<DbTestResult>>('POST', '/api/db/connections/test', body),
  connectDb: (id: string) => request<ApiResponse<unknown>>('POST', `/api/db/connections/${id}/connect`),
  disconnectDb: (id: string) => request<ApiResponse<unknown>>('POST', `/api/db/connections/${id}/disconnect`),
  getDbSchemas: (id: string) => request<ApiResponse<SchemaInfo[]>>('GET', `/api/db/connections/${id}/schemas`),
  getDbTableStructure: (id: string, table: string) =>
    request<ApiResponse<TableStructure>>('GET', `/api/db/connections/${id}/tables/${table}/structure`),
  getDbTableData: (id: string, table: string, page?: number, pageSize?: number) =>
    request<ApiResponse<QueryResult>>(
      'GET',
      `/api/db/connections/${id}/tables/${table}/data?page=${page ?? 1}&page_size=${pageSize ?? 50}`
    ),
  executeDbSql: (id: string, sql: string) =>
    request<ApiResponse<QueryResult>>('POST', `/api/db/connections/${id}/query`, { sql })
}
