/**
 * API Client App — Store Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  apiClientApi: {
    sendRequest: vi.fn(),
    getHistory: vi.fn().mockResolvedValue({ data: [] }),
    updateEnvironment: vi.fn(),
    createEnvironment: vi.fn()
  }
}))

import { apiClientApi } from '../api'
import { useApiClientStore } from '../store'

function resetStore() {
  const websocketConnectionId = 'ws-default'
  const mqttConnectionId = 'mqtt-default'

  useApiClientStore.setState({
    collections: [],
    environments: [],
    activeEnvironmentId: null,
    history: [],
    tabs: [],
    activeTabId: null,
    sidebarTab: 'collections',
    activeView: 'http',
    hiddenProtocols: [],
    websocket: {
      activeConnectionId: websocketConnectionId,
      connections: [
        {
          id: websocketConnectionId,
          name: 'Default WebSocket',
          scheme: 'wss',
          host: 'echo.websocket.events',
          port: 443,
          path: '/',
          protocols: '',
          connectTimeoutMs: 5000,
          autoReconnect: false,
          reconnectPeriodMs: 3000,
          messageDraft: '',
          logs: [],
          shouldConnect: false,
          connectionState: 'idle'
        }
      ]
    },
    mqtt: {
      activeConnectionId: mqttConnectionId,
      connections: [
        {
          id: mqttConnectionId,
          name: 'Default MQTT',
          scheme: 'wss',
          host: 'broker.emqx.io',
          port: 8084,
          path: '/mqtt',
          username: '',
          password: '',
          clientId: 'ventoos-test',
          mqttVersion: '5.0',
          connectTimeoutSeconds: 10,
          keepAliveSeconds: 60,
          autoReconnect: true,
          reconnectPeriodMs: 4000,
          cleanStart: true,
          publishTopic: 'ventoos/demo',
          payloadDraft: '{"hello":"mqtt"}',
          subscriptions: [],
          logs: [],
          shouldConnect: false,
          connectionState: 'idle'
        }
      ]
    },
    responses: {},
    isLoading: false,
    isSending: false
  })

  vi.mocked(apiClientApi.sendRequest).mockReset()
  vi.mocked(apiClientApi.getHistory).mockResolvedValue({ data: [] })
  vi.mocked(apiClientApi.updateEnvironment).mockReset()
  vi.mocked(apiClientApi.createEnvironment).mockReset()
}

describe('ApiClient Store', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('Persistence', () => {
    it('should hydrate persisted app state for refresh recovery', () => {
      useApiClientStore.getState().hydrateAppState({
        tabs: [
          {
            id: 'tab-restored',
            name: 'Profile',
            method: 'GET',
            url: 'https://api.example.com/profile',
            request: {
              headers: [{ key: 'Accept', value: 'application/json', enabled: true }]
            },
            isDirty: true,
            requestId: 'req-profile'
          }
        ],
        activeTabId: 'tab-restored',
        sidebarTab: 'history',
        activeEnvironmentId: 'env-1',
        responses: {
          'tab-restored': {
            status: 200,
            status_text: 'OK',
            headers: [],
            body: '{"id":1}',
            duration_ms: 20,
            size_bytes: 8
          }
        },
        activeView: 'mqtt',
        hiddenProtocols: ['websocket'],
        websocket: {
          activeConnectionId: 'ws-restored',
          connections: [
            {
              id: 'ws-restored',
              name: 'Realtime Gateway',
              scheme: 'wss',
              host: 'echo.websocket.events',
              port: 443,
              path: '/',
              protocols: 'json',
              connectTimeoutMs: 5000,
              autoReconnect: true,
              reconnectPeriodMs: 3000,
              messageDraft: '{"ping":true}',
              logs: [{ id: 'ws-log-1', kind: 'system', message: 'Connected' }],
              shouldConnect: true,
              connectionState: 'connected'
            }
          ]
        },
        mqtt: {
          activeConnectionId: 'mqtt-restored',
          connections: [
            {
              id: 'mqtt-restored',
              name: 'Broker A',
              scheme: 'wss',
              host: 'broker.emqx.io',
              port: 8084,
              path: '/mqtt',
              username: 'demo',
              password: 'secret',
              clientId: 'client-1',
              mqttVersion: '5.0',
              connectTimeoutSeconds: 10,
              keepAliveSeconds: 45,
              autoReconnect: true,
              reconnectPeriodMs: 4000,
              cleanStart: true,
              publishTopic: 'ventoos/demo',
              payloadDraft: '{"hello":"mqtt"}',
              subscriptions: [{ id: 'sub-1', topic: 'ventoos/demo', qos: 1, enabled: true }],
              logs: [{ id: 'mqtt-log-1', kind: 'out', message: 'ventoos/demo: hello' }],
              shouldConnect: true,
              connectionState: 'connected'
            }
          ]
        }
      })

      const state = useApiClientStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.activeTabId).toBe('tab-restored')
      expect(state.sidebarTab).toBe('history')
      expect(state.activeEnvironmentId).toBe('env-1')
      expect(state.responses['tab-restored']?.body).toBe('{"id":1}')
      expect(state.activeView).toBe('mqtt')
      expect(state.hiddenProtocols).toEqual(['websocket'])
      expect(state.websocket.activeConnectionId).toBe('ws-restored')
      expect(state.websocket.connections[0]).toMatchObject({
        host: 'echo.websocket.events',
        protocols: 'json',
        messageDraft: '{"ping":true}',
        shouldConnect: true,
        connectionState: 'connected'
      })
      expect(state.mqtt.activeConnectionId).toBe('mqtt-restored')
      expect(state.mqtt.connections[0]).toMatchObject({
        host: 'broker.emqx.io',
        clientId: 'client-1',
        publishTopic: 'ventoos/demo',
        payloadDraft: '{"hello":"mqtt"}',
        shouldConnect: true,
        connectionState: 'connected'
      })
      expect(state.mqtt.connections[0]?.subscriptions).toEqual([{ id: 'sub-1', topic: 'ventoos/demo', qos: 1, enabled: true }])
    })

    it('should expose a serializable app state snapshot', () => {
      const tabId = useApiClientStore.getState().addTab({
        name: 'Create User',
        method: 'POST',
        url: 'https://api.example.com/users',
        request: {
          body: {
            type: 'json',
            content: '{"name":"vento"}'
          }
        }
      })

      useApiClientStore.getState().setSidebarTab('environments')
      useApiClientStore.getState().setActiveEnvironment('env-1')
      useApiClientStore.getState().setActiveView('websocket')
      useApiClientStore.getState().setHiddenProtocols(['mqtt'])
      useApiClientStore.getState().updateWebSocketState({
        host: 'echo.websocket.events',
        port: 443,
        path: '/',
        messageDraft: '{"token":"abc"}',
        shouldConnect: true,
        connectionState: 'connecting'
      })
      useApiClientStore.getState().appendWebSocketLog({ kind: 'out', message: '{"token":"abc"}' })
      useApiClientStore.getState().updateMqttState({
        host: 'broker.emqx.io',
        port: 8084,
        path: '/mqtt',
        clientId: 'client-42',
        publishTopic: 'ventoos/demo',
        payloadDraft: '{"ping":true}',
        shouldConnect: true,
        connectionState: 'connected'
      })
      useApiClientStore.getState().addMqttSubscription('mqtt-default', { topic: 'ventoos/demo', qos: 1 })
      useApiClientStore.getState().appendMqttLog({ kind: 'system', message: 'Connected' })
      useApiClientStore.setState({
        responses: {
          [tabId]: {
            status: 201,
            status_text: 'Created',
            headers: [],
            body: '{"ok":true}',
            duration_ms: 18,
            size_bytes: 11
          }
        }
      })

      const snapshot = useApiClientStore.getState().getPersistedAppState()

      expect(snapshot.activeTabId).toBe(tabId)
      expect(snapshot.tabs[0]?.name).toBe('Create User')
      expect(snapshot.sidebarTab).toBe('environments')
      expect(snapshot.activeEnvironmentId).toBe('env-1')
      expect(snapshot.activeView).toBe('websocket')
      expect(snapshot.hiddenProtocols).toEqual(['mqtt'])
      expect(snapshot.responses[tabId]?.status).toBe(201)
      expect(snapshot.websocket.activeConnectionId).toBe('ws-default')
      expect(snapshot.websocket.connections[0]).toMatchObject({
        host: 'echo.websocket.events',
        messageDraft: '{"token":"abc"}',
        shouldConnect: true,
        connectionState: 'connecting'
      })
      expect(snapshot.websocket.connections[0]?.logs).toHaveLength(1)
      expect(snapshot.mqtt.activeConnectionId).toBe('mqtt-default')
      expect(snapshot.mqtt.connections[0]).toMatchObject({
        host: 'broker.emqx.io',
        clientId: 'client-42',
        publishTopic: 'ventoos/demo',
        payloadDraft: '{"ping":true}',
        shouldConnect: true,
        connectionState: 'connected'
      })
      expect(snapshot.mqtt.connections[0]?.subscriptions).toHaveLength(1)
      expect(snapshot.mqtt.connections[0]?.logs).toHaveLength(1)
    })
  })

  describe('Tab Management', () => {
    it('should add a new tab with defaults', () => {
      const { addTab } = useApiClientStore.getState()
      const tabId = addTab()
      const state = useApiClientStore.getState()

      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe(tabId)
      expect(state.tabs[0].name).toBe('Untitled Request')
      expect(state.tabs[0].method).toBe('GET')
      expect(state.tabs[0].url).toBe('')
      expect(state.tabs[0].isDirty).toBe(false)
      expect(state.activeTabId).toBe(tabId)
    })

    it('should add a tab with custom values', () => {
      const { addTab } = useApiClientStore.getState()
      addTab({ name: 'Create User', method: 'POST', url: 'https://api.example.com/users' })
      const state = useApiClientStore.getState()

      expect(state.tabs[0].name).toBe('Create User')
      expect(state.tabs[0].method).toBe('POST')
      expect(state.tabs[0].url).toBe('https://api.example.com/users')
    })

    it('should remove a tab and update active', () => {
      const { addTab } = useApiClientStore.getState()
      const tab1 = addTab({ name: 'Tab 1' })
      const tab2 = addTab({ name: 'Tab 2' })
      const tab3 = addTab({ name: 'Tab 3' })

      // Active should be tab3 (last added)
      expect(useApiClientStore.getState().activeTabId).toBe(tab3)

      // Remove active tab
      useApiClientStore.getState().removeTab(tab3)
      const state = useApiClientStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe(tab2)
    })

    it('should remove a non-active tab without changing active', () => {
      const { addTab } = useApiClientStore.getState()
      const tab1 = addTab({ name: 'Tab 1' })
      const tab2 = addTab({ name: 'Tab 2' })

      useApiClientStore.getState().removeTab(tab1)
      const state = useApiClientStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.activeTabId).toBe(tab2)
    })

    it('should set active tab to null when last tab removed', () => {
      const { addTab } = useApiClientStore.getState()
      const tabId = addTab()

      useApiClientStore.getState().removeTab(tabId)
      expect(useApiClientStore.getState().tabs).toHaveLength(0)
      expect(useApiClientStore.getState().activeTabId).toBeNull()
    })

    it('should switch active tab', () => {
      const { addTab } = useApiClientStore.getState()
      const tab1 = addTab({ name: 'Tab 1' })
      addTab({ name: 'Tab 2' })

      useApiClientStore.getState().setActiveTab(tab1)
      expect(useApiClientStore.getState().activeTabId).toBe(tab1)
    })

    it('should update tab request and mark dirty', () => {
      const { addTab } = useApiClientStore.getState()
      const tabId = addTab()

      useApiClientStore.getState().updateTabRequest(tabId, {
        url: 'https://example.com/api',
        method: 'POST'
      })

      const tab = useApiClientStore.getState().tabs[0]
      expect(tab.url).toBe('https://example.com/api')
      expect(tab.method).toBe('POST')
      expect(tab.isDirty).toBe(true)
    })
  })

  describe('Sidebar', () => {
    it('should switch sidebar tab', () => {
      useApiClientStore.getState().setSidebarTab('environments')
      expect(useApiClientStore.getState().sidebarTab).toBe('environments')

      useApiClientStore.getState().setSidebarTab('history')
      expect(useApiClientStore.getState().sidebarTab).toBe('history')
    })
  })

  describe('Environment', () => {
    it('should set active environment', () => {
      useApiClientStore.getState().setActiveEnvironment('env-1')
      expect(useApiClientStore.getState().activeEnvironmentId).toBe('env-1')

      useApiClientStore.getState().setActiveEnvironment(null)
      expect(useApiClientStore.getState().activeEnvironmentId).toBeNull()
    })

    it('should resolve active environment values before sending a request', async () => {
      vi.mocked(apiClientApi.sendRequest).mockResolvedValueOnce({
        data: {
          status: 200,
          status_text: 'OK',
          headers: [],
          body: '{}',
          duration_ms: 12,
          size_bytes: 2
        }
      })

      useApiClientStore.setState({
        environments: [
          {
            id: 'env-1',
            name: 'Development',
            variables: [
              {
                key: 'BASE_URL',
                initialValue: 'https://api.example.com',
                currentValue: 'https://api.example.com',
                enabled: true,
                secret: false
              },
              {
                key: 'TOKEN',
                initialValue: 'token-123',
                currentValue: 'token-123',
                enabled: true,
                secret: true
              }
            ],
            isGlobal: false,
            sortOrder: 0,
            createdAt: '',
            updatedAt: ''
          }
        ],
        activeEnvironmentId: 'env-1'
      })

      const tabId = useApiClientStore.getState().addTab({
        name: 'Authorized Request',
        method: 'GET',
        url: '{{BASE_URL}}/profile',
        request: {
          auth: { type: 'bearer', token: '{{TOKEN}}' }
        }
      })

      await useApiClientStore.getState().sendRequest(tabId)

      expect(apiClientApi.sendRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.example.com/profile',
        headers: [{ key: 'Authorization', value: 'Bearer token-123', enabled: true }],
        body: undefined,
        follow_redirects: true
      })
    })

    it('should save a response value into the active environment', async () => {
      vi.mocked(apiClientApi.updateEnvironment).mockResolvedValueOnce({
        data: {
          id: 'env-1',
          name: 'Development',
          variables: [
            {
              key: 'TOKEN',
              initialValue: 'token-xyz',
              currentValue: 'token-xyz',
              enabled: true,
              secret: true
            }
          ],
          isGlobal: false,
          sortOrder: 0,
          createdAt: '',
          updatedAt: ''
        }
      })

      useApiClientStore.setState({
        environments: [
          {
            id: 'env-1',
            name: 'Development',
            variables: [],
            isGlobal: false,
            sortOrder: 0,
            createdAt: '',
            updatedAt: ''
          }
        ],
        activeEnvironmentId: 'env-1'
      })

      await useApiClientStore.getState().saveEnvironmentVariable({
        key: 'TOKEN',
        value: 'token-xyz',
        secret: true
      })

      expect(apiClientApi.updateEnvironment).toHaveBeenCalledWith('env-1', {
        variables: [
          {
            key: 'TOKEN',
            initialValue: 'token-xyz',
            currentValue: 'token-xyz',
            enabled: true,
            secret: true
          }
        ]
      })
      expect(useApiClientStore.getState().environments[0].variables[0]).toEqual({
        key: 'TOKEN',
        initialValue: 'token-xyz',
        currentValue: 'token-xyz',
        enabled: true,
        secret: true
      })
    })

    it('should create a new environment and activate it', async () => {
      vi.mocked(apiClientApi.createEnvironment).mockResolvedValueOnce({
        data: {
          id: 'env-new',
          name: 'Staging',
          variables: [],
          isGlobal: false,
          sortOrder: 1,
          createdAt: '',
          updatedAt: ''
        }
      })

      const created = await useApiClientStore.getState().createEnvironment({ name: 'Staging' })

      expect(apiClientApi.createEnvironment).toHaveBeenCalledWith({
        name: 'Staging',
        variables: [],
        isGlobal: false
      })
      expect(created?.id).toBe('env-new')
      expect(useApiClientStore.getState().activeEnvironmentId).toBe('env-new')
      expect(useApiClientStore.getState().environments[0].name).toBe('Staging')
    })
  })

  describe('Open Request', () => {
    it('should open a saved request in new tab', () => {
      useApiClientStore.getState().openRequest({
        id: 'req-123',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        request: {}
      })

      const state = useApiClientStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].requestId).toBe('req-123')
      expect(state.tabs[0].name).toBe('Get Users')
    })

    it('should switch to existing tab if request already open', () => {
      useApiClientStore.getState().openRequest({
        id: 'req-123',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        request: {}
      })

      // Open same request again
      useApiClientStore.getState().openRequest({
        id: 'req-123',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        request: {}
      })

      expect(useApiClientStore.getState().tabs).toHaveLength(1)
    })
  })
})
