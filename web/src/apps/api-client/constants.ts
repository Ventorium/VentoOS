import type { HttpMethod } from './types'

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#22c55e',
  POST: '#f97316',
  PUT: '#3b82f6',
  PATCH: '#a855f7',
  DELETE: '#ef4444',
  HEAD: '#6b7280',
  OPTIONS: '#6b7280',
}

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
