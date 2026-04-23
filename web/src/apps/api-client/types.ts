export interface Collection {
  id: string
  name: string
  description?: string | null
  auth?: AuthConfig | null
  headers?: KeyValueItem[] | null
  variables?: KeyValueItem[] | null
  preRequestScript?: string | null
  testScript?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Folder {
  id: string
  collectionId: string
  parentFolderId?: string | null
  name: string
  description?: string | null
  auth?: AuthConfig | null
  headers?: KeyValueItem[] | null
  variables?: KeyValueItem[] | null
  preRequestScript?: string | null
  testScript?: string | null
  sortOrder: number
}

export interface ApiRequest {
  id: string
  collectionId: string
  folderId?: string | null
  name: string
  method: HttpMethod
  url: string
  params?: KeyValueItem[] | null
  headers?: KeyValueItem[] | null
  body?: BodyConfig | null
  auth?: AuthConfig | null
  preRequestScript?: string | null
  testScript?: string | null
  variables?: KeyValueItem[] | null
  description?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type FormDataType = 'text' | 'integer' | 'boolean' | 'number' | 'file' | 'array'

export interface KeyValueItem {
  key: string
  value: string
  enabled: boolean
  description?: string
  dataType?: FormDataType
}

export interface BodyConfig {
  type: 'none' | 'json' | 'text' | 'form-urlencoded' | 'form-data' | 'binary' | 'xml'
  content?: string
  contentType?: string
  params?: KeyValueItem[]
}

export interface AuthConfig {
  type: 'none' | 'inherit' | 'basic' | 'bearer' | 'api-key'
  username?: string
  password?: string
  token?: string
  key?: string
  value?: string
  addTo?: 'header' | 'query'
}

export interface EnvironmentVariable {
  key: string
  initialValue: string
  currentValue: string
  enabled: boolean
  secret?: boolean
}

export interface Environment {
  id: string
  name: string
  variables: EnvironmentVariable[]
  isGlobal: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface HistoryEntry {
  id: string
  request: Record<string, unknown>
  response?: Record<string, unknown> | null
  durationMs?: number | null
  starred: boolean
  createdAt: string
}

export interface ProxyResponse {
  status: number
  status_text: string
  headers: KeyValueItem[]
  body: string
  duration_ms: number
  size_bytes: number
}

export type ProtocolView = 'http' | 'websocket' | 'mqtt' | 'guide'

export type ApiClientSidebarTab = 'collections' | 'environments' | 'history'

export interface ProtocolLogEntry {
  id: string
  kind: 'system' | 'in' | 'out'
  message: string
}

export type ConnectionState = 'idle' | 'connecting' | 'connected'

export interface ProtocolSessionSnapshot {
  session_id: string
  connection_state: ConnectionState
  logs: ProtocolLogEntry[]
}

export type WebSocketScheme = '' | 'ws' | 'wss'

export interface WebSocketConnection {
  id: string
  name: string
  scheme: WebSocketScheme
  host: string
  port: number | null
  path: string
  protocols: string
  connectTimeoutMs: number
  autoReconnect: boolean
  reconnectPeriodMs: number
  messageDraft: string
  logs: ProtocolLogEntry[]
  shouldConnect: boolean
  connectionState: ConnectionState
}

export interface WebSocketSessionConnectRequest {
  session_id: string
  scheme: Exclude<WebSocketScheme, ''>
  host: string
  port: number
  path: string
  protocols: string
  connect_timeout_ms: number
  auto_reconnect: boolean
  reconnect_period_ms: number
}

export interface WebSocketWorkbenchState {
  activeConnectionId: string | null
  connections: WebSocketConnection[]
}

export type MqttScheme = 'mqtt' | 'mqtts' | 'ws' | 'wss'

export interface MqttSubscription {
  id: string
  topic: string
  qos: 0 | 1 | 2
  enabled: boolean
}

export interface MqttConnection {
  id: string
  name: string
  scheme: MqttScheme
  host: string
  port: number | null
  path: string
  username: string
  password: string
  clientId: string
  mqttVersion: '3.1.1' | '5.0'
  connectTimeoutSeconds: number
  keepAliveSeconds: number
  autoReconnect: boolean
  reconnectPeriodMs: number
  cleanStart: boolean
  publishTopic: string
  payloadDraft: string
  subscriptions: MqttSubscription[]
  logs: ProtocolLogEntry[]
  shouldConnect: boolean
  connectionState: ConnectionState
}

export interface MqttSessionConnectRequest {
  session_id: string
  scheme: MqttScheme
  host: string
  port: number
  path: string
  username: string
  password: string
  client_id: string
  mqtt_version: MqttConnection['mqttVersion']
  connect_timeout_seconds: number
  keep_alive_seconds: number
  auto_reconnect: boolean
  reconnect_period_ms: number
  clean_start: boolean
  subscriptions: Array<Pick<MqttSubscription, 'topic' | 'qos' | 'enabled'>>
}

export interface MqttPublishRequest {
  topic: string
  payload: string
  qos: 0 | 1 | 2
  retain: boolean
}

export interface MqttWorkbenchState {
  activeConnectionId: string | null
  connections: MqttConnection[]
}

export interface ApiClientPersistedState {
  tabs: RequestTab[]
  activeTabId: string | null
  sidebarTab: ApiClientSidebarTab
  activeEnvironmentId: string | null
  responses: Record<string, ProxyResponse>
  activeView: ProtocolView
  hiddenProtocols: Array<Exclude<ProtocolView, 'guide'>>
  websocket: WebSocketWorkbenchState
  mqtt: MqttWorkbenchState
}

export interface CollectionTree {
  collection: Collection
  folders: FolderTree[]
  requests: ApiRequest[]
}

export interface FolderTree {
  folder: Folder
  subFolders: FolderTree[]
  requests: ApiRequest[]
}

export interface RequestTab {
  id: string
  requestId?: string
  name: string
  method: HttpMethod
  url: string
  request: Partial<ApiRequest>
  isDirty: boolean
}
