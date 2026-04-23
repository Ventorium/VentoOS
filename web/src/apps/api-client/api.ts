import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'
import type {
  ApiRequest,
  Collection,
  CollectionTree,
  Environment,
  EnvironmentVariable,
  Folder,
  HistoryEntry,
  KeyValueItem,
  MqttPublishRequest,
  MqttSessionConnectRequest,
  ProtocolSessionSnapshot,
  ProxyResponse
  ,WebSocketSessionConnectRequest
} from './types'
import { mapCollectionTreeDto, mapEnvironmentDto, toEnvironmentPayload } from './utils/mappers'

const BASE = '/api/api-client'

function mapApiResponse<TInput, TOutput>(
  promise: Promise<ApiResponse<TInput>>,
  mapper: (value: TInput) => TOutput
): Promise<ApiResponse<TOutput>> {
  return promise.then(response => ({
    ...response,
    data: mapper(response.data)
  }))
}

export const apiClientApi = {
  // Collections
  getCollections: () =>
    mapApiResponse(request<ApiResponse<unknown[]>>('GET', `${BASE}/collections`), data =>
      (data ?? []).map(item => mapCollectionTreeDto(item))
    ),
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
  connectWebSocketSession: (data: WebSocketSessionConnectRequest) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/websocket/sessions/connect`, data),
  getWebSocketSession: (sessionId: string) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('GET', `${BASE}/proxy/websocket/sessions/${sessionId}`),
  disconnectWebSocketSession: (sessionId: string) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/websocket/sessions/${sessionId}/disconnect`),
  sendWebSocketFrame: (sessionId: string, data: { message: string }) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/websocket/sessions/${sessionId}/send`, data),
  clearWebSocketSessionLogs: (sessionId: string) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/websocket/sessions/${sessionId}/clear-logs`),
  connectMqttSession: (data: MqttSessionConnectRequest) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/mqtt/sessions/connect`, data),
  getMqttSession: (sessionId: string) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('GET', `${BASE}/proxy/mqtt/sessions/${sessionId}`),
  disconnectMqttSession: (sessionId: string) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/mqtt/sessions/${sessionId}/disconnect`),
  publishMqttMessage: (sessionId: string, data: MqttPublishRequest) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/mqtt/sessions/${sessionId}/publish`, data),
  syncMqttSubscriptions: (sessionId: string, data: { subscriptions: MqttSessionConnectRequest['subscriptions'] }) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/mqtt/sessions/${sessionId}/subscriptions`, data),
  clearMqttSessionLogs: (sessionId: string) =>
    request<ApiResponse<ProtocolSessionSnapshot>>('POST', `${BASE}/proxy/mqtt/sessions/${sessionId}/clear-logs`),

  // Environments
  getEnvironments: () =>
    mapApiResponse(request<ApiResponse<unknown[]>>('GET', `${BASE}/environments`), data =>
      (data ?? []).map(item => mapEnvironmentDto(item))
    ),
  createEnvironment: (data: { name: string; variables?: EnvironmentVariable[]; isGlobal?: boolean }) =>
    mapApiResponse(
      request<ApiResponse<unknown>>('POST', `${BASE}/environments`, toEnvironmentPayload(data)),
      environment => mapEnvironmentDto(environment)
    ),
  updateEnvironment: (id: string, data: Partial<Environment>) =>
    mapApiResponse(
      request<ApiResponse<unknown>>('PUT', `${BASE}/environments/${id}`, toEnvironmentPayload(data)),
      environment => mapEnvironmentDto(environment)
    ),
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
