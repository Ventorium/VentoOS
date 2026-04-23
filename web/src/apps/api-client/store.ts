import { create } from 'zustand'
import { apiClientApi } from './api'
import type {
  ApiClientPersistedState,
  ApiClientSidebarTab,
  CollectionTree,
  Environment,
  EnvironmentVariable,
  HistoryEntry,
  HttpMethod,
  MqttConnection,
  MqttSubscription,
  MqttWorkbenchState,
  ProtocolLogEntry,
  ProtocolView,
  ProxyResponse,
  RequestTab,
  WebSocketConnection,
  WebSocketWorkbenchState
} from './types'
import { prepareHttpRequest } from './utils/runtime'

let _tabCounter = 0
const LOG_LIMIT = 200
const DEFAULT_WEBSOCKET_PORT: Record<'ws' | 'wss', number> = {
  ws: 80,
  wss: 443
}
const DEFAULT_MQTT_PORT: Record<'mqtt' | 'mqtts' | 'ws' | 'wss', number> = {
  mqtt: 1883,
  mqtts: 8883,
  ws: 8083,
  wss: 8084
}

function nextTabId() {
  return `tab-${++_tabCounter}-${Date.now()}`
}

function nextConnectionId(prefix: 'ws' | 'mqtt' | 'sub') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function nextLogId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createDefaultWebSocketConnection(partial: Partial<WebSocketConnection> = {}): WebSocketConnection {
  return {
    id: partial.id ?? nextConnectionId('ws'),
    name: partial.name ?? '',
    scheme: partial.scheme ?? '',
    host: partial.host ?? '',
    port: partial.port ?? null,
    path: partial.path ?? '',
    protocols: partial.protocols ?? '',
    connectTimeoutMs: partial.connectTimeoutMs ?? 5000,
    autoReconnect: partial.autoReconnect ?? false,
    reconnectPeriodMs: partial.reconnectPeriodMs ?? 3000,
    messageDraft: partial.messageDraft ?? '',
    logs: partial.logs ?? [],
    shouldConnect: partial.shouldConnect ?? false,
    connectionState: partial.connectionState ?? 'idle'
  }
}

function createDefaultWebSocketState(): WebSocketWorkbenchState {
  const connection = createDefaultWebSocketConnection()

  return {
    activeConnectionId: connection.id,
    connections: [connection]
  }
}

function createDefaultMqttConnection(partial: Partial<MqttConnection> = {}): MqttConnection {
  const scheme = partial.scheme ?? 'mqtt'

  return {
    id: partial.id ?? nextConnectionId('mqtt'),
    name: partial.name ?? '',
    scheme,
    host: partial.host ?? '',
    port: partial.port ?? DEFAULT_MQTT_PORT[scheme],
    path: partial.path ?? '',
    username: partial.username ?? '',
    password: partial.password ?? '',
    clientId: partial.clientId ?? '',
    mqttVersion: partial.mqttVersion ?? '5.0',
    connectTimeoutSeconds: partial.connectTimeoutSeconds ?? 10,
    keepAliveSeconds: partial.keepAliveSeconds ?? 60,
    autoReconnect: partial.autoReconnect ?? false,
    reconnectPeriodMs: partial.reconnectPeriodMs ?? 4000,
    cleanStart: partial.cleanStart ?? true,
    publishTopic: partial.publishTopic ?? '',
    payloadDraft: partial.payloadDraft ?? '',
    subscriptions: partial.subscriptions ?? [],
    logs: partial.logs ?? [],
    shouldConnect: partial.shouldConnect ?? false,
    connectionState: partial.connectionState ?? 'idle'
  }
}

function createDefaultMqttState(): MqttWorkbenchState {
  const connection = createDefaultMqttConnection()

  return {
    activeConnectionId: connection.id,
    connections: [connection]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSidebarTab(value: unknown): value is ApiClientSidebarTab {
  return value === 'collections' || value === 'environments' || value === 'history'
}

function isProtocolView(value: unknown): value is ProtocolView {
  return value === 'http' || value === 'websocket' || value === 'mqtt' || value === 'guide'
}

function isHiddenProtocol(value: unknown): value is Exclude<ProtocolView, 'guide'> {
  return value === 'http' || value === 'websocket' || value === 'mqtt'
}

function isConnectionState(value: unknown): value is WebSocketConnection['connectionState'] {
  return value === 'idle' || value === 'connecting' || value === 'connected'
}

function isWebSocketScheme(value: unknown): value is WebSocketConnection['scheme'] {
  return value === '' || value === 'ws' || value === 'wss'
}

function isMqttScheme(value: unknown): value is MqttConnection['scheme'] {
  return value === 'mqtt' || value === 'mqtts' || value === 'ws' || value === 'wss'
}

function isMqttVersion(value: unknown): value is MqttConnection['mqttVersion'] {
  return value === '3.1.1' || value === '5.0'
}

function isHttpMethod(value: unknown): value is HttpMethod {
  return (
    value === 'GET' ||
    value === 'POST' ||
    value === 'PUT' ||
    value === 'PATCH' ||
    value === 'DELETE' ||
    value === 'HEAD' ||
    value === 'OPTIONS'
  )
}

function appendProtocolLog(
  currentLogs: ProtocolLogEntry[],
  nextLog: Omit<ProtocolLogEntry, 'id'> & { id?: string }
): ProtocolLogEntry[] {
  const entry: ProtocolLogEntry = {
    id: nextLog.id ?? nextLogId(),
    kind: nextLog.kind,
    message: nextLog.message
  }

  return [...currentLogs, entry].slice(-LOG_LIMIT)
}

function normalizeLogs(value: unknown): ProtocolLogEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .flatMap(entry => {
      if (!isRecord(entry)) {
        return []
      }

      if ((entry.kind !== 'system' && entry.kind !== 'in' && entry.kind !== 'out') || typeof entry.message !== 'string') {
        return []
      }

      return [
        {
          id: typeof entry.id === 'string' ? entry.id : nextLogId(),
          kind: entry.kind,
          message: entry.message
        } satisfies ProtocolLogEntry
      ]
    })
    .slice(-LOG_LIMIT)
}

function parseSocketEndpoint(endpoint: unknown, defaults: { scheme: WebSocketConnection['scheme']; host: string; port: number | null; path: string }) {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    return defaults
  }

  try {
    const url = new URL(endpoint)
    const scheme = url.protocol === 'wss:' ? 'wss' : 'ws'
    const path = `${url.pathname}${url.search}` || defaults.path

    return {
      scheme,
      host: url.hostname || defaults.host,
      port: url.port ? Number(url.port) : DEFAULT_WEBSOCKET_PORT[scheme],
      path: path === '' ? defaults.path : path
    }
  } catch {
    return defaults
  }
}

function parseMqttEndpoint(endpoint: unknown, defaults: { scheme: MqttConnection['scheme']; host: string; port: number; path: string }) {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    return defaults
  }

  try {
    const url = new URL(endpoint)
    const protocol = url.protocol.replace(':', '')
    const scheme = isMqttScheme(protocol) ? protocol : defaults.scheme

    return {
      scheme,
      host: url.hostname || defaults.host,
      port: url.port ? Number(url.port) : DEFAULT_MQTT_PORT[scheme],
      path: scheme === 'ws' || scheme === 'wss' ? `${url.pathname}${url.search}` || defaults.path : ''
    }
  } catch {
    return defaults
  }
}

function normalizeRequestTabs(value: unknown): RequestTab[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap(entry => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.url !== 'string') {
      return []
    }

    return [
      {
        id: entry.id,
        requestId: typeof entry.requestId === 'string' ? entry.requestId : undefined,
        name: entry.name,
        method: isHttpMethod(entry.method) ? entry.method : 'GET',
        url: entry.url,
        request: isRecord(entry.request) ? (entry.request as Partial<RequestTab['request']>) : {},
        isDirty: entry.isDirty === true
      } satisfies RequestTab
    ]
  })
}

function normalizeResponses(value: unknown, openTabIds: Set<string>): Record<string, ProxyResponse> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([tabId, response]) => {
      if (!openTabIds.has(tabId) || !isRecord(response)) {
        return []
      }

      if (
        typeof response.status !== 'number' ||
        typeof response.status_text !== 'string' ||
        typeof response.body !== 'string' ||
        typeof response.duration_ms !== 'number' ||
        typeof response.size_bytes !== 'number'
      ) {
        return []
      }

      return [
        [
          tabId,
          {
            status: response.status,
            status_text: response.status_text,
            headers: Array.isArray(response.headers) ? (response.headers as ProxyResponse['headers']) : [],
            body: response.body,
            duration_ms: response.duration_ms,
            size_bytes: response.size_bytes
          } satisfies ProxyResponse
        ]
      ]
    })
  )
}

function normalizeMqttSubscription(value: unknown): MqttSubscription | null {
  if (!isRecord(value)) {
    return null
  }

  const qos = value.qos === 1 || value.qos === 2 ? value.qos : 0

  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : nextConnectionId('sub'),
    topic: typeof value.topic === 'string' ? value.topic : '',
    qos,
    enabled: value.enabled !== false
  }
}

function normalizeWebSocketConnection(value: unknown): WebSocketConnection | null {
  if (!isRecord(value)) {
    return null
  }

  const parsedEndpoint = parseSocketEndpoint(value.endpoint, {
    scheme: '',
    host: '',
    port: null,
    path: ''
  })

  return createDefaultWebSocketConnection({
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : nextConnectionId('ws'),
    name: typeof value.name === 'string' ? value.name : '',
    scheme: isWebSocketScheme(value.scheme) ? value.scheme : parsedEndpoint.scheme,
    host: typeof value.host === 'string' ? value.host : parsedEndpoint.host,
    port:
      typeof value.port === 'number' && Number.isFinite(value.port)
        ? value.port
        : value.port === null
          ? null
          : parsedEndpoint.port,
    path: typeof value.path === 'string' ? value.path : parsedEndpoint.path,
    protocols: typeof value.protocols === 'string' ? value.protocols : '',
    connectTimeoutMs:
      typeof value.connectTimeoutMs === 'number' && Number.isFinite(value.connectTimeoutMs) ? value.connectTimeoutMs : 5000,
    autoReconnect: value.autoReconnect === true,
    reconnectPeriodMs:
      typeof value.reconnectPeriodMs === 'number' && Number.isFinite(value.reconnectPeriodMs)
        ? value.reconnectPeriodMs
        : 3000,
    messageDraft: typeof value.messageDraft === 'string' ? value.messageDraft : '',
    logs: normalizeLogs(value.logs),
    shouldConnect: value.shouldConnect === true,
    connectionState: isConnectionState(value.connectionState) ? value.connectionState : 'idle'
  })
}

function normalizeMqttConnection(value: unknown): MqttConnection | null {
  if (!isRecord(value)) {
    return null
  }

  const parsedEndpoint = parseMqttEndpoint(value.endpoint, {
    scheme: 'mqtt',
    host: '',
    port: 1883,
    path: ''
  })
  const subscriptions = Array.isArray(value.subscriptions)
    ? value.subscriptions.flatMap(subscription => {
        const normalized = normalizeMqttSubscription(subscription)
        return normalized ? [normalized] : []
      })
    : []
  const legacyTopic = typeof value.topic === 'string' ? value.topic : ''

  if (subscriptions.length === 0 && legacyTopic.length > 0 && value.shouldSubscribe === true) {
    subscriptions.push({
      id: nextConnectionId('sub'),
      topic: legacyTopic,
      qos: 0,
      enabled: true
    })
  }

  return createDefaultMqttConnection({
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : nextConnectionId('mqtt'),
    name: typeof value.name === 'string' ? value.name : '',
    scheme: isMqttScheme(value.scheme) ? value.scheme : parsedEndpoint.scheme,
    host: typeof value.host === 'string' ? value.host : parsedEndpoint.host,
    port:
      typeof value.port === 'number' && Number.isFinite(value.port)
        ? value.port
        : parsedEndpoint.port,
    path: typeof value.path === 'string' ? value.path : parsedEndpoint.path,
    username: typeof value.username === 'string' ? value.username : '',
    password: typeof value.password === 'string' ? value.password : '',
    clientId: typeof value.clientId === 'string' ? value.clientId : '',
    mqttVersion: isMqttVersion(value.mqttVersion) ? value.mqttVersion : '5.0',
    connectTimeoutSeconds:
      typeof value.connectTimeoutSeconds === 'number' && Number.isFinite(value.connectTimeoutSeconds)
        ? value.connectTimeoutSeconds
        : 10,
    keepAliveSeconds:
      typeof value.keepAliveSeconds === 'number' && Number.isFinite(value.keepAliveSeconds)
        ? value.keepAliveSeconds
        : 60,
    autoReconnect: value.autoReconnect === true,
    reconnectPeriodMs:
      typeof value.reconnectPeriodMs === 'number' && Number.isFinite(value.reconnectPeriodMs)
        ? value.reconnectPeriodMs
        : 4000,
    cleanStart: value.cleanStart !== false,
    publishTopic: typeof value.publishTopic === 'string' ? value.publishTopic : legacyTopic,
    payloadDraft: typeof value.payloadDraft === 'string' ? value.payloadDraft : '',
    subscriptions,
    logs: normalizeLogs(value.logs),
    shouldConnect: value.shouldConnect === true,
    connectionState: isConnectionState(value.connectionState) ? value.connectionState : 'idle'
  })
}

function normalizeWebSocketState(value: unknown): WebSocketWorkbenchState {
  const defaults = createDefaultWebSocketState()

  if (!isRecord(value)) {
    return defaults
  }

  const connections = Array.isArray(value.connections)
    ? value.connections.flatMap(connection => {
        const normalized = normalizeWebSocketConnection(connection)
        return normalized ? [normalized] : []
      })
    : [normalizeWebSocketConnection(value)].flatMap(connection => (connection ? [connection] : []))
  const nextConnections = connections.length > 0 ? connections : defaults.connections
  const activeConnectionId =
    typeof value.activeConnectionId === 'string' && nextConnections.some(connection => connection.id === value.activeConnectionId)
      ? value.activeConnectionId
      : nextConnections[0]?.id ?? null

  return {
    activeConnectionId,
    connections: nextConnections
  }
}

function normalizeMqttState(value: unknown): MqttWorkbenchState {
  const defaults = createDefaultMqttState()

  if (!isRecord(value)) {
    return defaults
  }

  const connections = Array.isArray(value.connections)
    ? value.connections.flatMap(connection => {
        const normalized = normalizeMqttConnection(connection)
        return normalized ? [normalized] : []
      })
    : [normalizeMqttConnection(value)].flatMap(connection => (connection ? [connection] : []))
  const nextConnections = connections.length > 0 ? connections : defaults.connections
  const activeConnectionId =
    typeof value.activeConnectionId === 'string' && nextConnections.some(connection => connection.id === value.activeConnectionId)
      ? value.activeConnectionId
      : nextConnections[0]?.id ?? null

  return {
    activeConnectionId,
    connections: nextConnections
  }
}

function normalizePersistedAppState(value: unknown): ApiClientPersistedState {
  const source = isRecord(value) ? value : {}
  const tabs = normalizeRequestTabs(source.tabs)
  const openTabIds = new Set(tabs.map(tab => tab.id))
  const hiddenProtocols = Array.isArray(source.hiddenProtocols)
    ? [...new Set(source.hiddenProtocols.filter(isHiddenProtocol))]
    : []
  const activeTabId =
    typeof source.activeTabId === 'string' && openTabIds.has(source.activeTabId) ? source.activeTabId : (tabs[0]?.id ?? null)

  let activeView: ProtocolView = isProtocolView(source.activeView) ? source.activeView : 'http'
  if (activeView !== 'guide' && hiddenProtocols.includes(activeView)) {
    activeView = (['http', 'websocket', 'mqtt'] as const).find(item => !hiddenProtocols.includes(item)) ?? 'guide'
  }

  return {
    tabs,
    activeTabId,
    sidebarTab: isSidebarTab(source.sidebarTab) ? source.sidebarTab : 'collections',
    activeEnvironmentId: typeof source.activeEnvironmentId === 'string' ? source.activeEnvironmentId : null,
    responses: normalizeResponses(source.responses, openTabIds),
    activeView,
    hiddenProtocols,
    websocket: normalizeWebSocketState(source.websocket),
    mqtt: normalizeMqttState(source.mqtt)
  }
}

function resolveActiveConnectionId<T extends { id: string }>(
  connections: T[],
  activeConnectionId: string | null | undefined
) {
  if (typeof activeConnectionId === 'string' && connections.some(connection => connection.id === activeConnectionId)) {
    return activeConnectionId
  }

  return connections[0]?.id ?? null
}

function updateConnectionById<T extends { id: string }>(
  connections: T[],
  connectionId: string,
  updater: (connection: T) => T
) {
  return connections.map(connection => (connection.id === connectionId ? updater(connection) : connection))
}

interface ApiClientState {
  // Data
  collections: CollectionTree[]
  environments: Environment[]
  activeEnvironmentId: string | null
  history: HistoryEntry[]

  // Tabs
  tabs: RequestTab[]
  activeTabId: string | null

  // Sidebar
  sidebarTab: ApiClientSidebarTab

  // Protocol navigation
  activeView: ProtocolView
  hiddenProtocols: Array<Exclude<ProtocolView, 'guide'>>

  // Protocol workbenches
  websocket: WebSocketWorkbenchState
  mqtt: MqttWorkbenchState

  // Response for active tab
  responses: Record<string, ProxyResponse>

  // Loading
  isLoading: boolean
  isSending: boolean

  // Actions
  loadCollections: () => Promise<void>
  loadEnvironments: () => Promise<void>
  loadHistory: () => Promise<void>

  setSidebarTab: (tab: ApiClientSidebarTab) => void
  setActiveEnvironment: (id: string | null) => void
  setActiveView: (view: ProtocolView) => void
  setHiddenProtocols: (protocols: Array<Exclude<ProtocolView, 'guide'>>) => void
  addWebSocketConnection: (connection?: Partial<WebSocketConnection>) => string
  updateWebSocketConnection: (connectionId: string, updates: Partial<WebSocketConnection>) => void
  removeWebSocketConnection: (connectionId: string) => void
  setActiveWebSocketConnection: (connectionId: string) => void
  updateWebSocketState: (updates: Partial<WebSocketConnection>) => void
  appendWebSocketConnectionLog: (connectionId: string, log: Omit<ProtocolLogEntry, 'id'> & { id?: string }) => void
  appendWebSocketLog: (log: Omit<ProtocolLogEntry, 'id'> & { id?: string }) => void
  clearWebSocketLogs: () => void
  addMqttConnection: (connection?: Partial<MqttConnection>) => string
  updateMqttConnection: (connectionId: string, updates: Partial<MqttConnection>) => void
  removeMqttConnection: (connectionId: string) => void
  setActiveMqttConnection: (connectionId: string) => void
  updateMqttState: (updates: Partial<MqttConnection>) => void
  addMqttSubscription: (connectionId: string, subscription?: Partial<MqttSubscription>) => string
  updateMqttSubscription: (
    connectionId: string,
    subscriptionId: string,
    updates: Partial<MqttSubscription>
  ) => void
  removeMqttSubscription: (connectionId: string, subscriptionId: string) => void
  appendMqttConnectionLog: (connectionId: string, log: Omit<ProtocolLogEntry, 'id'> & { id?: string }) => void
  appendMqttLog: (log: Omit<ProtocolLogEntry, 'id'> & { id?: string }) => void
  clearMqttLog: () => void
  hydrateAppState: (state: Record<string, unknown> | undefined) => void
  getPersistedAppState: () => ApiClientPersistedState
  createEnvironment: (input: { name: string; isGlobal?: boolean }) => Promise<Environment | null>
  saveEnvironmentVariable: (input: {
    environmentId?: string
    key: string
    value: string
    secret?: boolean
  }) => Promise<Environment | null>

  // Tab actions
  addTab: (tab?: Partial<RequestTab>) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabRequest: (tabId: string, updates: Partial<RequestTab>) => void

  // Request actions
  sendRequest: (tabId: string) => Promise<void>
  saveRequest: (tabId: string, collectionId: string, folderId?: string) => Promise<void>

  // Open a saved request in a tab
  openRequest: (req: {
    id: string
    name: string
    method: HttpMethod
    url: string
    request: Record<string, unknown>
  }) => void
}

export const useApiClientStore = create<ApiClientState>((set, get) => ({
  collections: [],
  environments: [],
  activeEnvironmentId: null,
  history: [],
  tabs: [],
  activeTabId: null,
  sidebarTab: 'collections',
  activeView: 'http',
  hiddenProtocols: [],
  websocket: createDefaultWebSocketState(),
  mqtt: createDefaultMqttState(),
  responses: {},
  isLoading: false,
  isSending: false,

  loadCollections: async () => {
    set({ isLoading: true })
    try {
      const res = await apiClientApi.getCollections()
      if (res.data) {
        set({ collections: res.data })
      }
    } catch {
      // ignore
    } finally {
      set({ isLoading: false })
    }
  },

  loadEnvironments: async () => {
    try {
      const res = await apiClientApi.getEnvironments()
      if (res.data) {
        set({ environments: res.data })
      }
    } catch {
      // ignore
    }
  },

  loadHistory: async () => {
    try {
      const res = await apiClientApi.getHistory({ limit: 50 })
      if (res.data) {
        set({ history: res.data })
      }
    } catch {
      // ignore
    }
  },

  setSidebarTab: tab => set({ sidebarTab: tab }),
  setActiveEnvironment: id => set({ activeEnvironmentId: id }),
  setActiveView: view =>
    set(state => {
      if (view === 'guide') {
        return { activeView: view }
      }

      if (state.hiddenProtocols.includes(view)) {
        const fallback = (['http', 'websocket', 'mqtt'] as const).find(item => !state.hiddenProtocols.includes(item)) ?? 'guide'
        return { activeView: fallback }
      }

      return { activeView: view }
    }),
  setHiddenProtocols: protocols =>
    set(state => {
      const hiddenProtocols = [...new Set(protocols.filter(isHiddenProtocol))]
      let activeView = state.activeView

      if (activeView !== 'guide' && hiddenProtocols.includes(activeView)) {
        activeView = (['http', 'websocket', 'mqtt'] as const).find(item => !hiddenProtocols.includes(item)) ?? 'guide'
      }

      return { hiddenProtocols, activeView }
    }),
  addWebSocketConnection: connection => {
    const createdConnection = createDefaultWebSocketConnection(connection)

    set(state => ({
      websocket: {
        activeConnectionId: createdConnection.id,
        connections: [...state.websocket.connections, createdConnection]
      }
    }))

    return createdConnection.id
  },
  updateWebSocketConnection: (connectionId, updates) =>
    set(state => ({
      websocket: {
        ...state.websocket,
        connections: updateConnectionById(state.websocket.connections, connectionId, connection => ({
          ...connection,
          ...updates,
          logs: updates.logs ? updates.logs.slice(-LOG_LIMIT) : connection.logs
        }))
      }
    })),
  removeWebSocketConnection: connectionId =>
    set(state => {
      const remainingConnections = state.websocket.connections.filter(connection => connection.id !== connectionId)
      const nextConnections = remainingConnections.length > 0 ? remainingConnections : [createDefaultWebSocketConnection()]

      return {
        websocket: {
          activeConnectionId: resolveActiveConnectionId(nextConnections, state.websocket.activeConnectionId === connectionId ? null : state.websocket.activeConnectionId),
          connections: nextConnections
        }
      }
    }),
  setActiveWebSocketConnection: connectionId =>
    set(state => ({
      websocket: {
        ...state.websocket,
        activeConnectionId: resolveActiveConnectionId(state.websocket.connections, connectionId)
      }
    })),
  updateWebSocketState: updates =>
    set(state => {
      const activeConnectionId = state.websocket.activeConnectionId
      if (!activeConnectionId) {
        return state
      }

      return {
        websocket: {
          ...state.websocket,
          connections: updateConnectionById(state.websocket.connections, activeConnectionId, connection => ({
            ...connection,
            ...updates,
            logs: updates.logs ? updates.logs.slice(-LOG_LIMIT) : connection.logs
          }))
        }
      }
    }),
  appendWebSocketConnectionLog: (connectionId, log) =>
    set(state => ({
      websocket: {
        ...state.websocket,
        connections: updateConnectionById(state.websocket.connections, connectionId, connection => ({
          ...connection,
          logs: appendProtocolLog(connection.logs, log)
        }))
      }
    })),
  appendWebSocketLog: log =>
    set(state => {
      const activeConnectionId = state.websocket.activeConnectionId
      if (!activeConnectionId) {
        return state
      }

      return {
        websocket: {
          ...state.websocket,
          connections: updateConnectionById(state.websocket.connections, activeConnectionId, connection => ({
            ...connection,
            logs: appendProtocolLog(connection.logs, log)
          }))
        }
      }
    }),
  clearWebSocketLogs: () =>
    set(state => {
      const activeConnectionId = state.websocket.activeConnectionId
      if (!activeConnectionId) {
        return state
      }

      return {
        websocket: {
          ...state.websocket,
          connections: updateConnectionById(state.websocket.connections, activeConnectionId, connection => ({
            ...connection,
            logs: []
          }))
        }
      }
    }),
  addMqttConnection: connection => {
    const createdConnection = createDefaultMqttConnection(connection)

    set(state => ({
      mqtt: {
        activeConnectionId: createdConnection.id,
        connections: [...state.mqtt.connections, createdConnection]
      }
    }))

    return createdConnection.id
  },
  updateMqttConnection: (connectionId, updates) =>
    set(state => ({
      mqtt: {
        ...state.mqtt,
        connections: updateConnectionById(state.mqtt.connections, connectionId, connection => ({
          ...connection,
          ...updates,
          logs: updates.logs ? updates.logs.slice(-LOG_LIMIT) : connection.logs,
          subscriptions: updates.subscriptions ?? connection.subscriptions
        }))
      }
    })),
  removeMqttConnection: connectionId =>
    set(state => {
      const remainingConnections = state.mqtt.connections.filter(connection => connection.id !== connectionId)
      const nextConnections = remainingConnections.length > 0 ? remainingConnections : [createDefaultMqttConnection()]

      return {
        mqtt: {
          activeConnectionId: resolveActiveConnectionId(nextConnections, state.mqtt.activeConnectionId === connectionId ? null : state.mqtt.activeConnectionId),
          connections: nextConnections
        }
      }
    }),
  setActiveMqttConnection: connectionId =>
    set(state => ({
      mqtt: {
        ...state.mqtt,
        activeConnectionId: resolveActiveConnectionId(state.mqtt.connections, connectionId)
      }
    })),
  updateMqttState: updates =>
    set(state => {
      const activeConnectionId = state.mqtt.activeConnectionId
      if (!activeConnectionId) {
        return state
      }

      return {
        mqtt: {
          ...state.mqtt,
          connections: updateConnectionById(state.mqtt.connections, activeConnectionId, connection => ({
            ...connection,
            ...updates,
            logs: updates.logs ? updates.logs.slice(-LOG_LIMIT) : connection.logs,
            subscriptions: updates.subscriptions ?? connection.subscriptions
          }))
        }
      }
    }),
  addMqttSubscription: (connectionId, subscription) => {
    const createdSubscription: MqttSubscription = {
      id: subscription?.id ?? nextConnectionId('sub'),
      topic: subscription?.topic ?? '',
      qos: subscription?.qos === 1 || subscription?.qos === 2 ? subscription.qos : 0,
      enabled: subscription?.enabled ?? true
    }

    set(state => ({
      mqtt: {
        ...state.mqtt,
        connections: updateConnectionById(state.mqtt.connections, connectionId, connection => ({
          ...connection,
          subscriptions: [...connection.subscriptions, createdSubscription]
        }))
      }
    }))

    return createdSubscription.id
  },
  updateMqttSubscription: (connectionId, subscriptionId, updates) =>
    set(state => ({
      mqtt: {
        ...state.mqtt,
        connections: updateConnectionById(state.mqtt.connections, connectionId, connection => ({
          ...connection,
          subscriptions: connection.subscriptions.map(subscription =>
            subscription.id === subscriptionId
              ? {
                  ...subscription,
                  ...updates,
                  qos: updates.qos === 1 || updates.qos === 2 ? updates.qos : (updates.qos === 0 ? 0 : subscription.qos)
                }
              : subscription
          )
        }))
      }
    })),
  removeMqttSubscription: (connectionId, subscriptionId) =>
    set(state => ({
      mqtt: {
        ...state.mqtt,
        connections: updateConnectionById(state.mqtt.connections, connectionId, connection => ({
          ...connection,
          subscriptions: connection.subscriptions.filter(subscription => subscription.id !== subscriptionId)
        }))
      }
    })),
  appendMqttConnectionLog: (connectionId, log) =>
    set(state => ({
      mqtt: {
        ...state.mqtt,
        connections: updateConnectionById(state.mqtt.connections, connectionId, connection => ({
          ...connection,
          logs: appendProtocolLog(connection.logs, log)
        }))
      }
    })),
  appendMqttLog: log =>
    set(state => {
      const activeConnectionId = state.mqtt.activeConnectionId
      if (!activeConnectionId) {
        return state
      }

      return {
        mqtt: {
          ...state.mqtt,
          connections: updateConnectionById(state.mqtt.connections, activeConnectionId, connection => ({
            ...connection,
            logs: appendProtocolLog(connection.logs, log)
          }))
        }
      }
    }),
  clearMqttLog: () =>
    set(state => {
      const activeConnectionId = state.mqtt.activeConnectionId
      if (!activeConnectionId) {
        return state
      }

      return {
        mqtt: {
          ...state.mqtt,
          connections: updateConnectionById(state.mqtt.connections, activeConnectionId, connection => ({
            ...connection,
            logs: []
          }))
        }
      }
    }),
  hydrateAppState: appState => {
    const persistedState = normalizePersistedAppState(appState)

    set({
      tabs: persistedState.tabs,
      activeTabId: persistedState.activeTabId,
      sidebarTab: persistedState.sidebarTab,
      activeEnvironmentId: persistedState.activeEnvironmentId,
      responses: persistedState.responses,
      activeView: persistedState.activeView,
      hiddenProtocols: persistedState.hiddenProtocols,
      websocket: persistedState.websocket,
      mqtt: persistedState.mqtt
    })
  },
  getPersistedAppState: () => {
    const state = get()
    const openTabIds = new Set(state.tabs.map(tab => tab.id))

    return {
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      sidebarTab: state.sidebarTab,
      activeEnvironmentId: state.activeEnvironmentId,
      responses: Object.fromEntries(Object.entries(state.responses).filter(([tabId]) => openTabIds.has(tabId))),
      activeView: state.activeView,
      hiddenProtocols: state.hiddenProtocols,
      websocket: {
        activeConnectionId: state.websocket.activeConnectionId,
        connections: state.websocket.connections.map(connection => ({
          ...connection,
          logs: connection.logs.slice(-LOG_LIMIT)
        }))
      },
      mqtt: {
        activeConnectionId: state.mqtt.activeConnectionId,
        connections: state.mqtt.connections.map(connection => ({
          ...connection,
          logs: connection.logs.slice(-LOG_LIMIT)
        }))
      }
    }
  },

  createEnvironment: async input => {
    try {
      const response = await apiClientApi.createEnvironment({
        name: input.name,
        variables: [],
        isGlobal: input.isGlobal ?? false
      })

      if (!response.data) {
        return null
      }

      set(currentState => ({
        environments: [...currentState.environments, response.data],
        activeEnvironmentId: response.data.id
      }))

      return response.data
    } catch {
      return null
    }
  },

  saveEnvironmentVariable: async input => {
    const state = get()
    const targetEnvironmentId = input.environmentId ?? state.activeEnvironmentId
    if (!targetEnvironmentId) {
      return null
    }

    const targetEnvironment = state.environments.find(environment => environment.id === targetEnvironmentId)
    if (!targetEnvironment) {
      return null
    }

    const nextVariable: EnvironmentVariable = {
      key: input.key,
      initialValue: input.value,
      currentValue: input.value,
      enabled: true,
      secret: input.secret ?? false
    }
    const existingIndex = targetEnvironment.variables.findIndex(variable => variable.key === input.key)
    const nextVariables = [...targetEnvironment.variables]

    if (existingIndex >= 0) {
      nextVariables[existingIndex] = {
        ...nextVariables[existingIndex],
        ...nextVariable,
        secret: input.secret ?? nextVariables[existingIndex].secret ?? false
      }
    } else {
      nextVariables.push(nextVariable)
    }

    try {
      const response = await apiClientApi.updateEnvironment(targetEnvironment.id, {
        variables: nextVariables
      })

      if (!response.data) {
        return null
      }

      set(currentState => ({
        environments: currentState.environments.map(environment =>
          environment.id === response.data.id ? response.data : environment
        )
      }))

      return response.data
    } catch {
      return null
    }
  },

  addTab: partial => {
    const id = nextTabId()
    const tab: RequestTab = {
      id,
      name: partial?.name ?? 'Untitled Request',
      method: partial?.method ?? 'GET',
      url: partial?.url ?? '',
      request: partial?.request ?? {},
      isDirty: false,
      requestId: partial?.requestId
    }
    set(s => ({
      tabs: [...s.tabs, tab],
      activeTabId: id
    }))
    return id
  },

  removeTab: tabId => {
    set(s => {
      const tabs = s.tabs.filter(t => t.id !== tabId)
      const newResponses = { ...s.responses }
      delete newResponses[tabId]
      let activeTabId = s.activeTabId
      if (activeTabId === tabId) {
        const idx = s.tabs.findIndex(t => t.id === tabId)
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
      }
      return { tabs, activeTabId, responses: newResponses }
    })
  },

  setActiveTab: tabId => set({ activeTabId: tabId }),

  updateTabRequest: (tabId, updates) => {
    set(s => ({
      tabs: s.tabs.map(t => (t.id === tabId ? { ...t, ...updates, isDirty: true } : t))
    }))
  },

  sendRequest: async tabId => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab || !tab.url) return

    const environments = get().environments
    const activeEnvironment = environments.find(environment => environment.id === get().activeEnvironmentId) ?? null
    const globalVariables = environments
      .filter(environment => environment.isGlobal)
      .flatMap(environment => environment.variables ?? [])
    const runtimeContext = tab.request as Partial<RequestTab['request']> & {
      collectionVariables?: unknown[]
      folderVariables?: unknown[]
    }
    const preparedRequest = prepareHttpRequest(
      {
        method: tab.method,
        url: tab.url,
        headers: tab.request.headers,
        body: tab.request.body,
        auth: tab.request.auth,
        requestVariables: Array.isArray(tab.request.variables) ? tab.request.variables : undefined,
        collectionVariables: Array.isArray(runtimeContext.collectionVariables)
          ? runtimeContext.collectionVariables
          : undefined,
        folderVariables: Array.isArray(runtimeContext.folderVariables) ? runtimeContext.folderVariables : undefined
      },
      {
        globalVariables,
        activeEnvironmentVariables: activeEnvironment?.variables ?? []
      }
    )

    set({ isSending: true })
    try {
      const res = await apiClientApi.sendRequest({
        method: preparedRequest.method,
        url: preparedRequest.url,
        headers: preparedRequest.headers.length > 0 ? preparedRequest.headers : undefined,
        body: preparedRequest.body
          ? { type: preparedRequest.body.type, content: preparedRequest.body.content, params: preparedRequest.body.params }
          : undefined,
        follow_redirects: true
      })
      if (res.data) {
        set(s => ({
          responses: { ...s.responses, [tabId]: res.data! }
        }))
      }
    } catch {
      // ignore
    } finally {
      set({ isSending: false })
      // Reload history after sending
      get().loadHistory()
    }
  },

  saveRequest: async (tabId, collectionId, folderId) => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab) return

    const data: Record<string, unknown> = {
      name: tab.name,
      method: tab.method,
      url: tab.url,
      collection_id: collectionId,
      folder_id: folderId,
      params: tab.request.params,
      headers: tab.request.headers,
      body: tab.request.body,
      auth: tab.request.auth
    }

    try {
      if (tab.requestId) {
        await apiClientApi.updateRequest(tab.requestId, data)
      } else {
        const res = await apiClientApi.createRequest(data)
        if (res.data) {
          set(s => ({
            tabs: s.tabs.map(t => (t.id === tabId ? { ...t, requestId: res.data!.id, isDirty: false } : t))
          }))
        }
      }
      set(s => ({
        tabs: s.tabs.map(t => (t.id === tabId ? { ...t, isDirty: false } : t))
      }))
      get().loadCollections()
    } catch {
      // ignore
    }
  },

  openRequest: req => {
    const { tabs } = get()
    const existing = tabs.find(t => t.requestId === req.id)
    if (existing) {
      set({ activeTabId: existing.id, activeView: 'http' })
      return
    }
    get().addTab({
      requestId: req.id,
      name: req.name,
      method: req.method,
      url: req.url,
      request: req.request as Partial<RequestTab['request']>
    })
    set({ activeView: 'http' })
  }
}))
