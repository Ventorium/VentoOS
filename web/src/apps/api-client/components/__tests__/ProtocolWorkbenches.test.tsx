import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const protocolApiMocks = vi.hoisted(() => ({
  connectWebSocketSession: vi.fn().mockResolvedValue({ data: { session_id: 'ws-2', connection_state: 'connecting', logs: [] } }),
  disconnectWebSocketSession: vi.fn().mockResolvedValue({ data: { session_id: 'ws-2', connection_state: 'idle', logs: [] } }),
  sendWebSocketFrame: vi.fn().mockResolvedValue({ data: { session_id: 'ws-2', connection_state: 'connected', logs: [] } }),
  getWebSocketSession: vi.fn().mockResolvedValue({ data: { session_id: 'ws-2', connection_state: 'idle', logs: [] } }),
  connectMqttSession: vi.fn().mockResolvedValue({ data: { session_id: 'mqtt-2', connection_state: 'connecting', logs: [] } }),
  disconnectMqttSession: vi.fn().mockResolvedValue({ data: { session_id: 'mqtt-2', connection_state: 'idle', logs: [] } }),
  publishMqttMessage: vi.fn().mockResolvedValue({ data: { session_id: 'mqtt-2', connection_state: 'connected', logs: [] } }),
  syncMqttSubscriptions: vi.fn().mockResolvedValue({ data: { session_id: 'mqtt-2', connection_state: 'connected', logs: [] } }),
  getMqttSession: vi.fn().mockResolvedValue({ data: { session_id: 'mqtt-2', connection_state: 'idle', logs: [] } })
}))

const mqttTransportMocks = vi.hoisted(() => ({
  connect: vi.fn()
}))

vi.mock('../../api', () => ({
  apiClientApi: protocolApiMocks
}))

vi.mock('mqtt', () => ({
  default: mqttTransportMocks,
  connect: mqttTransportMocks.connect
}))
import MqttWorkbench from '../MqttWorkbench'
import WebSocketWorkbench from '../WebSocketWorkbench'
import { useApiClientStore } from '../../store'
import { useContextMenuStore } from '@/shell/ContextMenu/store'

const OriginalWebSocket = globalThis.WebSocket
const webSocketConstructor = vi.fn(function MockWebSocket(this: { readyState: number; close: ReturnType<typeof vi.fn> }) {
  this.readyState = 0
  this.close = vi.fn()
}) as unknown as typeof WebSocket

Object.assign(webSocketConstructor, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
})

function resetProtocolWorkbenchState() {
  useApiClientStore.setState(state => ({
    ...state,
    websocket: {
      activeConnectionId: 'ws-2',
      connections: [
        {
          id: 'ws-1',
          name: 'Events Feed',
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
        },
        {
          id: 'ws-2',
          name: 'Graph Gateway',
          scheme: 'wss',
          host: 'socket.example.com',
          port: 9443,
          path: '/gateway',
          protocols: 'graphql-ws',
          connectTimeoutMs: 8000,
          autoReconnect: true,
          reconnectPeriodMs: 2500,
          messageDraft: '{"type":"ping"}',
          logs: [],
          shouldConnect: false,
          connectionState: 'idle'
        }
      ]
    },
    mqtt: {
      activeConnectionId: 'mqtt-2',
      connections: [
        {
          id: 'mqtt-1',
          name: 'Public Broker',
          scheme: 'wss',
          host: 'broker.emqx.io',
          port: 8084,
          path: '/mqtt',
          username: '',
          password: '',
          clientId: 'ventoos-public',
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
        },
        {
          id: 'mqtt-2',
          name: 'Private Broker',
          scheme: 'ws',
          host: 'broker.internal',
          port: 9001,
          path: '/ws',
          username: 'tester',
          password: 'secret',
          clientId: 'ventoos-private',
          mqttVersion: '3.1.1',
          connectTimeoutSeconds: 12,
          keepAliveSeconds: 45,
          autoReconnect: false,
          reconnectPeriodMs: 5000,
          cleanStart: false,
          publishTopic: 'alerts/out',
          payloadDraft: '{"severity":"warn"}',
          subscriptions: [{ id: 'sub-1', topic: 'test/133', qos: 1, enabled: true }],
          logs: [],
          shouldConnect: false,
          connectionState: 'idle'
        }
      ]
    }
  }))
}

describe('Protocol workbenches', () => {
  beforeEach(() => {
    resetProtocolWorkbenchState()
    useContextMenuStore.getState().hide()
    globalThis.WebSocket = webSocketConstructor
    webSocketConstructor.mockClear()
    mqttTransportMocks.connect.mockClear()
    protocolApiMocks.connectWebSocketSession.mockClear()
    protocolApiMocks.disconnectWebSocketSession.mockClear()
    protocolApiMocks.sendWebSocketFrame.mockClear()
    protocolApiMocks.getWebSocketSession.mockClear()
    protocolApiMocks.connectMqttSession.mockClear()
    protocolApiMocks.disconnectMqttSession.mockClear()
    protocolApiMocks.publishMqttMessage.mockClear()
    protocolApiMocks.syncMqttSubscriptions.mockClear()
    protocolApiMocks.getMqttSession.mockClear()
  })

  it('renders the WebSocket workbench in message-first mode with connection actions in context menu', () => {
    render(<WebSocketWorkbench />)

    expect(screen.getByRole('button', { name: 'Send frame' })).toBeInTheDocument()
    expect(screen.queryByText('Connection Profile')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Remove Graph Gateway')).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getAllByText('Graph Gateway')[0] as HTMLElement)

    expect(useContextMenuStore.getState().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Edit connection' }),
        expect.objectContaining({ label: 'Duplicate connection' }),
        expect.objectContaining({ label: 'Delete connection' })
      ])
    )
  })

  it('shows a cancellable loading action while websocket is connecting', () => {
    protocolApiMocks.getWebSocketSession.mockResolvedValueOnce({
      data: { session_id: 'ws-2', connection_state: 'connecting', logs: [] }
    })

    useApiClientStore.setState(state => ({
      ...state,
      websocket: {
        ...state.websocket,
        activeConnectionId: 'ws-2',
        connections: state.websocket.connections.map(connection =>
          connection.id === 'ws-2'
            ? { ...connection, shouldConnect: true, connectionState: 'connecting' }
            : connection
        )
      }
    }))

    render(<WebSocketWorkbench />)

    return waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel connect/i })).toBeInTheDocument()
      expect(screen.getAllByText('connecting').length).toBeGreaterThan(0)
    })
  })

  it('delegates websocket connect lifecycle to the native api client backend', async () => {
    useApiClientStore.setState(state => ({
      ...state,
      websocket: {
        ...state.websocket,
        activeConnectionId: 'ws-2',
        connections: state.websocket.connections.map(connection =>
          connection.id === 'ws-2'
            ? { ...connection, shouldConnect: true, connectionState: 'idle' }
            : connection
        )
      }
    }))

    render(<WebSocketWorkbench />)

    await waitFor(() => {
      expect(protocolApiMocks.connectWebSocketSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'ws-2',
          scheme: 'wss',
          host: 'socket.example.com',
          port: 9443,
          path: '/gateway'
        })
      )
    })

    expect(webSocketConstructor).not.toHaveBeenCalled()
  })

  it('renders the MQTT workbench in message-first mode with connection actions in context menu', () => {
    render(<MqttWorkbench />)

    expect(screen.getByDisplayValue('test/133')).toBeInTheDocument()
    expect(screen.getByLabelText('Topic')).toHaveValue('alerts/out')
    expect(screen.getByRole('button', { name: /new subscription/i })).toBeInTheDocument()
    expect(screen.queryByText('Broker Profile')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Remove Private Broker')).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getAllByText('Private Broker')[0] as HTMLElement)

    expect(useContextMenuStore.getState().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Edit connection' }),
        expect.objectContaining({ label: 'Duplicate connection' }),
        expect.objectContaining({ label: 'Delete connection' })
      ])
    )
  })

  it('shows a cancellable loading action while mqtt is connecting', () => {
    protocolApiMocks.getMqttSession.mockResolvedValueOnce({
      data: { session_id: 'mqtt-2', connection_state: 'connecting', logs: [] }
    })

    useApiClientStore.setState(state => ({
      ...state,
      mqtt: {
        ...state.mqtt,
        activeConnectionId: 'mqtt-2',
        connections: state.mqtt.connections.map(connection =>
          connection.id === 'mqtt-2'
            ? { ...connection, shouldConnect: true, connectionState: 'connecting' }
            : connection
        )
      }
    }))

    render(<MqttWorkbench />)

    return waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel connect/i })).toBeInTheDocument()
      expect(screen.getAllByText('connecting').length).toBeGreaterThan(0)
    })
  })

  it('delegates mqtt connect lifecycle to the native api client backend', async () => {
    useApiClientStore.setState(state => ({
      ...state,
      mqtt: {
        ...state.mqtt,
        activeConnectionId: 'mqtt-2',
        connections: state.mqtt.connections.map(connection =>
          connection.id === 'mqtt-2'
            ? { ...connection, shouldConnect: true, connectionState: 'idle' }
            : connection
        )
      }
    }))

    render(<MqttWorkbench />)

    await waitFor(() => {
      expect(protocolApiMocks.connectMqttSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'mqtt-2',
          scheme: 'ws',
          host: 'broker.internal',
          port: 9001,
          path: '/ws'
        })
      )
    })

    expect(mqttTransportMocks.connect).not.toHaveBeenCalled()
  })

  it('creates a mqtt profile in edit mode with mqtt defaults and websocket-only path field', () => {
    render(<MqttWorkbench />)

    fireEvent.click(screen.getByRole('button', { name: /new connection/i }))

    expect(screen.getByText('Edit')).toBeInTheDocument()
    const protocolSelect = screen.getByDisplayValue('mqtt')

    expect(protocolSelect).toHaveValue('mqtt')
    expect(screen.getByDisplayValue('1883')).toBeInTheDocument()
    expect(screen.queryByLabelText('Path')).not.toBeInTheDocument()

    fireEvent.change(protocolSelect, { target: { value: 'ws' } })

    expect(screen.getByLabelText('Path')).toHaveValue('/mqtt')
  })
})

afterAll(() => {
  globalThis.WebSocket = OriginalWebSocket
})