/**
 * Database App — API client
 * Types are defined in ./types.ts
 */

import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'
import type {
  CreateDbConnectionReq,
  DbConnectionConfig,
  DbObject,
  DbTestResult,
  QueryResult,
  SchemaInfo,
  TableStructure,
} from './types'

// Re-export types for backward compatibility
export type {
  CreateDbConnectionReq,
  DbConnectionConfig,
  DbTestResult,
  QueryResult,
  SchemaInfo,
  TableStructure,
} from './types'

export const dbApi = {
  // ── Connections ──
  getDbConnections: () => request<ApiResponse<DbConnectionConfig[]>>('GET', '/api/db/connections'),
  createDbConnection: (body: CreateDbConnectionReq) =>
    request<ApiResponse<DbConnectionConfig>>('POST', '/api/db/connections', body),
  updateDbConnection: (id: string, body: Partial<CreateDbConnectionReq>) =>
    request<ApiResponse<DbConnectionConfig>>('PUT', `/api/db/connections/${id}`, body),
  getDbConnection: (id: string) => request<ApiResponse<DbConnectionConfig>>('GET', `/api/db/connections/${id}`),
  deleteDbConnection: (id: string) => request<ApiResponse<null>>('DELETE', `/api/db/connections/${id}`),
  testDbConnection: (id: string) => request<ApiResponse<DbTestResult>>('POST', `/api/db/connections/${id}/test`),
  testDbConnectionInline: (body: CreateDbConnectionReq) =>
    request<ApiResponse<DbTestResult>>('POST', '/api/db/connections/test', body),
  connectDb: (id: string) => request<ApiResponse<unknown>>('POST', `/api/db/connections/${id}/connect`),
  disconnectDb: (id: string) => request<ApiResponse<unknown>>('POST', `/api/db/connections/${id}/disconnect`),

  // ── Schema & objects ──
  getDbSchemas: (id: string) => request<ApiResponse<SchemaInfo[]>>('GET', `/api/db/connections/${id}/schemas`),
  getDbObjects: (id: string, schema: string, category: string) =>
    request<ApiResponse<DbObject[]>>('GET', `/api/db/connections/${id}/schemas/${schema}/objects?category=${category}`),

  // ── Table structure & data ──
  getDbTableStructure: (id: string, table: string, schema?: string) =>
    request<ApiResponse<TableStructure>>(
      'GET',
      `/api/db/connections/${id}/tables/${table}/structure${schema ? `?schema=${schema}` : ''}`
    ),
  getDbTableData: (id: string, table: string, page?: number, pageSize?: number, schema?: string) =>
    request<ApiResponse<QueryResult>>(
      'GET',
      `/api/db/connections/${id}/tables/${table}/data?page=${page ?? 1}&page_size=${pageSize ?? 1000}${schema ? `&schema=${schema}` : ''}`
    ),
  saveTableDesign: (id: string, table: string, ddl: string) =>
    request<ApiResponse<null>>('POST', `/api/db/connections/${id}/tables/${table}/design`, { ddl }),

  // ── SQL execution ──
  executeDbSql: (id: string, sql: string) =>
    request<ApiResponse<QueryResult>>('POST', `/api/db/connections/${id}/query`, { sql }),
}
