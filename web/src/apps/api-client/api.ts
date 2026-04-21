import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'
import type {
  ApiRequest,
  Collection,
  CollectionTree,
  Environment,
  Folder,
  HistoryEntry,
  KeyValueItem,
  ProxyResponse
} from './types'

const BASE = '/api/api-client'

export const apiClientApi = {
  // Collections
  getCollections: () => request<ApiResponse<CollectionTree[]>>('GET', `${BASE}/collections`),
  createCollection: (data: { name: string; description?: string }) =>
    request<ApiResponse<Collection>>('POST', `${BASE}/collections`, data),
  updateCollection: (id: string, data: Partial<Collection>) =>
    request<ApiResponse<Collection>>('PUT', `${BASE}/collections/${id}`, data),
  deleteCollection: (id: string) => request<ApiResponse<null>>('DELETE', `${BASE}/collections/${id}`),

  // Folders
  createFolder: (data: { collection_id: string; parent_folder_id?: string; name: string }) =>
    request<ApiResponse<Folder>>('POST', `${BASE}/folders`, data),
  updateFolder: (id: string, data: Partial<Folder>) =>
    request<ApiResponse<Folder>>('PUT', `${BASE}/folders/${id}`, data),
  deleteFolder: (id: string) => request<ApiResponse<null>>('DELETE', `${BASE}/folders/${id}`),

  // Requests
  getRequest: (id: string) => request<ApiResponse<ApiRequest>>('GET', `${BASE}/requests/${id}`),
  createRequest: (data: Record<string, unknown>) => request<ApiResponse<ApiRequest>>('POST', `${BASE}/requests`, data),
  updateRequest: (id: string, data: Record<string, unknown>) =>
    request<ApiResponse<ApiRequest>>('PUT', `${BASE}/requests/${id}`, data),
  deleteRequest: (id: string) => request<ApiResponse<null>>('DELETE', `${BASE}/requests/${id}`),
  duplicateRequest: (id: string) => request<ApiResponse<ApiRequest>>('POST', `${BASE}/requests/${id}/duplicate`),

  // Proxy
  sendRequest: (data: {
    method: string
    url: string
    headers?: KeyValueItem[]
    body?: Record<string, unknown>
    timeout_ms?: number
    follow_redirects?: boolean
  }) => request<ApiResponse<ProxyResponse>>('POST', `${BASE}/proxy/rest`, data),

  // Environments
  getEnvironments: () => request<ApiResponse<Environment[]>>('GET', `${BASE}/environments`),
  createEnvironment: (data: { name: string; variables?: KeyValueItem[]; is_global?: boolean }) =>
    request<ApiResponse<Environment>>('POST', `${BASE}/environments`, data),
  updateEnvironment: (id: string, data: Partial<Environment>) =>
    request<ApiResponse<Environment>>('PUT', `${BASE}/environments/${id}`, data),
  deleteEnvironment: (id: string) => request<ApiResponse<null>>('DELETE', `${BASE}/environments/${id}`),

  // History
  getHistory: (params?: { limit?: number; offset?: number; starred?: boolean }) => {
    const qs = params
      ? '?' +
        new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : ''
    return request<ApiResponse<HistoryEntry[]>>('GET', `${BASE}/history${qs}`)
  },
  deleteHistory: (id: string) => request<ApiResponse<null>>('DELETE', `${BASE}/history/${id}`),
  clearHistory: () => request<ApiResponse<null>>('DELETE', `${BASE}/history`),

  // Import
  importOpenApi: (data: Record<string, unknown>) =>
    request<ApiResponse<Collection>>('POST', `${BASE}/import/openapi`, { data }),
  importPostman: (data: Record<string, unknown>) =>
    request<ApiResponse<Collection>>('POST', `${BASE}/import/postman`, { data }),
  importCurl: (curl: string) => request<ApiResponse<Collection>>('POST', `${BASE}/import/curl`, { curl }),

  // Export
  exportCollection: (collectionId: string, format = 'hopp') =>
    request<ApiResponse<Record<string, unknown>>>('GET', `${BASE}/export/${collectionId}?format=${format}`),

  // Codegen
  generateCode: (data: {
    method: string
    url: string
    headers?: KeyValueItem[]
    body?: Record<string, unknown>
    language: string
  }) => request<ApiResponse<{ code: string }>>('POST', `${BASE}/codegen`, data)
}
