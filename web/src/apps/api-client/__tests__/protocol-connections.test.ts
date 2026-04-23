import { beforeEach, describe, expect, it } from 'vitest'
import { useApiClientStore } from '../store'

describe('ApiClient protocol connection collections', () => {
  beforeEach(() => {
    useApiClientStore.getState().hydrateAppState(undefined)
  })

  it('hydrates websocket and mqtt saved connection collections for refresh recovery', () => {
    useApiClientStore.getState().hydrateAppState({
      websocket: {
        activeConnectionId: 'ws-primary',
        connections: [
          {
            id: 'ws-primary',
            name: 'Local Echo',
            scheme: 'wss',
            host: 'echo.websocket.events',
            port: 443,
            path: '/',
            protocols: 'json',
            connectTimeoutMs: 8000,
            autoReconnect: true,
            reconnectPeriodMs: 2500,
            messageDraft: '{"ping":true}',
            logs: [{ id: 'ws-log-1', kind: 'system', message: 'Connected' }],
            shouldConnect: true,
            connectionState: 'connected'
          },
          {
            id: 'ws-staging',
            name: 'Staging Socket',
            scheme: 'ws',
            host: 'localhost',
            port: 8080,
            path: '/ws',
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
        activeConnectionId: 'mqtt-emqx',
        connections: [
          {
            id: 'mqtt-emqx',
            name: 'EMQX',
            scheme: 'wss',
            host: 'broker.emqx.io',
            port: 8084,
            path: '/mqtt',
            username: 'demo',
            password: 'secret',
            clientId: 'ventoos-emqx',
            mqttVersion: '5.0',
            connectTimeoutSeconds: 10,
            keepAliveSeconds: 60,
            autoReconnect: true,
            reconnectPeriodMs: 4000,
            cleanStart: true,
            publishTopic: 'test/133',
            payloadDraft: '{"msg":"hello"}',
            subscriptions: [
              { id: 'sub-1', topic: 'iot/svr/comm/yfn03/863013073531013/post', qos: 0, enabled: true },
              { id: 'sub-2', topic: 'iot/cli/comm/yfv03/ack', qos: 2, enabled: true }
            ],
            logs: [{ id: 'mqtt-log-1', kind: 'in', message: 'test/133: {"msg":"hello"}' }],
            shouldConnect: true,
            connectionState: 'connected'
          }
        ]
      }
    })

    const state = useApiClientStore.getState()

    expect(state.websocket.activeConnectionId).toBe('ws-primary')
    expect(state.websocket.connections).toHaveLength(2)
    expect(state.websocket.connections[0]).toMatchObject({
      name: 'Local Echo',
      scheme: 'wss',
      port: 443,
      autoReconnect: true,
      connectTimeoutMs: 8000
    })

    expect(state.mqtt.activeConnectionId).toBe('mqtt-emqx')
    expect(state.mqtt.connections[0]).toMatchObject({
      name: 'EMQX',
      host: 'broker.emqx.io',
      publishTopic: 'test/133',
      mqttVersion: '5.0'
    })
    expect(state.mqtt.connections[0]?.subscriptions).toHaveLength(2)
    expect(state.mqtt.connections[0]?.subscriptions[1]).toMatchObject({ topic: 'iot/cli/comm/yfv03/ack', qos: 2 })
  })

  it('manages websocket saved connections as reusable presets', () => {
    const createdId = useApiClientStore.getState().addWebSocketConnection({
      name: 'QA Socket',
      scheme: 'ws',
      host: 'qa.example.com',
      port: 8080,
      path: '/events'
    })

    useApiClientStore.getState().updateWebSocketConnection(createdId, {
      protocols: 'graphql-ws',
      autoReconnect: true,
      reconnectPeriodMs: 1500
    })
    useApiClientStore.getState().setActiveWebSocketConnection(createdId)

    const state = useApiClientStore.getState()
    expect(state.websocket.activeConnectionId).toBe(createdId)
    expect(state.websocket.connections.find(connection => connection.id === createdId)).toMatchObject({
      host: 'qa.example.com',
      path: '/events',
      protocols: 'graphql-ws',
      autoReconnect: true,
      reconnectPeriodMs: 1500
    })
  })

  it('creates blank websocket and mqtt connections when adding a new preset', () => {
    const websocketId = useApiClientStore.getState().addWebSocketConnection()
    const mqttId = useApiClientStore.getState().addMqttConnection()

    const state = useApiClientStore.getState()
    const websocketConnection = state.websocket.connections.find(connection => connection.id === websocketId)
    const mqttConnection = state.mqtt.connections.find(connection => connection.id === mqttId)

    expect(websocketConnection).toMatchObject({
      name: '',
      scheme: '',
      host: '',
      port: null,
      path: '',
      protocols: '',
      messageDraft: ''
    })
    expect(mqttConnection).toMatchObject({
      name: '',
      scheme: 'mqtt',
      host: '',
      port: 1883,
      path: '',
      username: '',
      password: '',
      clientId: '',
      publishTopic: '',
      payloadDraft: ''
    })
  })

  it('persists edited mqtt transport settings in the app state snapshot', () => {
    const mqttId = useApiClientStore.getState().addMqttConnection()

    useApiClientStore.getState().updateMqttConnection(mqttId, {
      name: 'TLS Broker',
      scheme: 'mqtts',
      host: 'secure.example.com',
      port: 8883,
      path: '',
      clientId: 'tls-client'
    })

    const snapshot = useApiClientStore.getState().getPersistedAppState()
    expect(snapshot.mqtt.connections.find(connection => connection.id === mqttId)).toMatchObject({
      name: 'TLS Broker',
      scheme: 'mqtts',
      host: 'secure.example.com',
      port: 8883,
      path: '',
      clientId: 'tls-client'
    })
  })

  it('supports mqtt subscriptions and independent publish topic per connection', () => {
    const mqttConnectionId = useApiClientStore.getState().addMqttConnection({
      name: 'Factory Broker',
      scheme: 'wss',
      host: 'factory.example.com',
      port: 443,
      path: '/mqtt'
    })

    const subscriptionId = useApiClientStore.getState().addMqttSubscription(mqttConnectionId, {
      topic: 'factory/device/telemetry',
      qos: 1
    })

    useApiClientStore.getState().updateMqttConnection(mqttConnectionId, {
      publishTopic: 'test/133',
      payloadDraft: '{"msg":"hello"}'
    })
    useApiClientStore.getState().updateMqttSubscription(mqttConnectionId, subscriptionId, {
      topic: 'factory/device/telemetry/v2',
      qos: 2
    })

    const state = useApiClientStore.getState()
    const mqttConnection = state.mqtt.connections.find(connection => connection.id === mqttConnectionId)

    expect(mqttConnection).toMatchObject({
      publishTopic: 'test/133',
      payloadDraft: '{"msg":"hello"}'
    })
    expect(mqttConnection?.subscriptions).toHaveLength(1)
    expect(mqttConnection?.subscriptions[0]).toMatchObject({
      id: subscriptionId,
      topic: 'factory/device/telemetry/v2',
      qos: 2,
      enabled: true
    })

    const snapshot = useApiClientStore.getState().getPersistedAppState()
    expect(snapshot.mqtt.connections.find(connection => connection.id === mqttConnectionId)).toMatchObject({
      publishTopic: 'test/133'
    })
  })
})