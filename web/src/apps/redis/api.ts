/**
 * Redis App — API client & types
 */

import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── API ─────────────────────────────────────────────────────────────────────

export const redisApi = {
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
  getRedisServerInfo: (id: string) => request<ApiResponse<RedisServerInfo>>('GET', `/api/redis/connections/${id}/info`)
}
