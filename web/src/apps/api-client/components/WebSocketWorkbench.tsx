import { Cable, ChevronLeft, Plug, Send, Unplug } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, EmptyState, FormField, FormInput, FormSelect, FormTextarea, Spinner, StatusBadge } from '@/components/ui'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { apiClientApi } from '../api'
import { useApiClientStore } from '../store'
import type { ProtocolLogEntry, ProtocolSessionSnapshot, WebSocketConnection, WebSocketScheme } from '../types'
import { buildSocketUrl, withNormalizedPath } from '../utils/socket-connections'
import { ConnectionSidebar, WorkbenchSection } from './ProtocolWorkbenchLayout'

const WEBSOCKET_DEFAULT_PORTS: Record<WebSocketScheme, number> = {
  ws: 80,
  wss: 443
}

type WebSocketLogFilter = 'all' | ProtocolLogEntry['kind']

function parseOptionalNumberInput(value: string, fallback: number | null) {
  if (value.trim().length === 0) {
    return null
  }

  const nextValue = Number.parseInt(value, 10)
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : fallback
}

function parseNumberInput(value: string, fallback: number) {
  const nextValue = Number.parseInt(value, 10)
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : fallback
}

function getConnectionStatus(connectionState: WebSocketConnection['connectionState']) {
  return connectionState === 'idle' ? 'disconnected' : connectionState
}

function getConnectionName(connection: WebSocketConnection) {
  return connection.name.trim() || connection.host.trim() || 'Untitled WebSocket'
}

function getConnectionPrimary(connection: WebSocketConnection) {
  return connection.host.trim() || 'Host not configured'
}

function getConnectionSecondary(connection: WebSocketConnection) {
  const parts = [connection.scheme ? connection.scheme.toUpperCase() : 'Protocol -']

  if (typeof connection.port === 'number') {
    parts.push(`:${connection.port}`)
  }

  if (connection.path.trim().length > 0) {
    parts.push(connection.path.trim())
  }

  return parts.join(' · ')
}

function getSchemePort(nextScheme: WebSocketScheme, currentScheme: WebSocketScheme, currentPort: number | null) {
  if (nextScheme === '') {
    return null
  }

  if (currentPort === null || currentScheme === '' || currentPort === WEBSOCKET_DEFAULT_PORTS[currentScheme]) {
    return WEBSOCKET_DEFAULT_PORTS[nextScheme]
  }

  return currentPort
}

function canConnectToWebSocket(connection: WebSocketConnection) {
  return connection.scheme !== '' && connection.host.trim().length > 0 && typeof connection.port === 'number'
}

function duplicateConnectionName(name: string) {
  const baseName = name.trim() || 'Untitled WebSocket'
  return `${baseName} Copy`
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}>
      <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--vos-text-tertiary)' }}>
        {label}
      </div>
      <div className="mt-1 truncate text-sm" style={{ color: 'var(--vos-text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

export default function WebSocketWorkbench() {
  const pollingRef = useRef<number | null>(null)
  const [logFilter, setLogFilter] = useState<WebSocketLogFilter>('all')
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null)

  const showContextMenu = useContextMenuStore(s => s.show)
  const websocket = useApiClientStore(s => s.websocket)
  const addWebSocketConnection = useApiClientStore(s => s.addWebSocketConnection)
  const updateWebSocketConnection = useApiClientStore(s => s.updateWebSocketConnection)
  const removeWebSocketConnection = useApiClientStore(s => s.removeWebSocketConnection)
  const setActiveWebSocketConnection = useApiClientStore(s => s.setActiveWebSocketConnection)
  const appendWebSocketConnectionLog = useApiClientStore(s => s.appendWebSocketConnectionLog)

  const activeConnection = useMemo(
    () => websocket.connections.find(connection => connection.id === websocket.activeConnectionId) ?? websocket.connections[0] ?? null,
    [websocket.activeConnectionId, websocket.connections]
  )

  const isEditing = activeConnection != null && editingConnectionId === activeConnection.id
  const endpointPreview = activeConnection ? buildSocketUrl(activeConnection) : ''
  const canConnect = activeConnection ? canConnectToWebSocket(activeConnection) : false
  const connectionItems = useMemo(
    () =>
      websocket.connections.map(connection => ({
        id: connection.id,
        title: getConnectionName(connection),
        primary: getConnectionPrimary(connection),
        secondary: getConnectionSecondary(connection),
        status: getConnectionStatus(connection.connectionState)
      })),
    [websocket.connections]
  )
  const filteredLogs = useMemo(() => {
    if (!activeConnection) {
      return []
    }

    return logFilter === 'all'
      ? activeConnection.logs
      : activeConnection.logs.filter(log => log.kind === logFilter)
  }, [activeConnection, logFilter])
  const pollingSessionIds = useMemo(
    () => websocket.connections.filter(connection => connection.shouldConnect || connection.connectionState !== 'idle').map(connection => connection.id).join('|'),
    [websocket.connections]
  )

  const applySessionSnapshot = useCallback(
    (connectionId: string, snapshot: ProtocolSessionSnapshot) => {
      updateWebSocketConnection(connectionId, {
        connectionState: snapshot.connection_state,
        shouldConnect: snapshot.connection_state !== 'idle',
        logs: snapshot.logs
      })
    },
    [updateWebSocketConnection]
  )

  const patchActiveConnection = useCallback(
    (updates: Partial<WebSocketConnection>) => {
      if (!activeConnection) {
        return
      }

      updateWebSocketConnection(activeConnection.id, updates)
    },
    [activeConnection, updateWebSocketConnection]
  )

  const disconnectActiveConnection = useCallback(() => {
    if (!activeConnection) {
      return
    }

    updateWebSocketConnection(activeConnection.id, { shouldConnect: false, connectionState: 'idle' })
    void apiClientApi.disconnectWebSocketSession(activeConnection.id).then(response => {
      if (response.data) {
        applySessionSnapshot(activeConnection.id, response.data)
      }
    })
  }, [activeConnection, applySessionSnapshot, updateWebSocketConnection])

  const selectConnection = useCallback(
    (connectionId: string) => {
      if (activeConnection && activeConnection.id !== connectionId && activeConnection.shouldConnect) {
        disconnectActiveConnection()
      }

      setActiveWebSocketConnection(connectionId)
      setEditingConnectionId(null)
    },
    [activeConnection, disconnectActiveConnection, setActiveWebSocketConnection]
  )

  const createConnection = useCallback(() => {
    const connectionId = addWebSocketConnection()
    setEditingConnectionId(connectionId)
  }, [addWebSocketConnection])

  const duplicateConnection = useCallback(
    (connectionId: string) => {
      const source = websocket.connections.find(connection => connection.id === connectionId)
      if (!source) {
        return
      }

      addWebSocketConnection({
        ...source,
        name: duplicateConnectionName(source.name),
        logs: [],
        shouldConnect: false,
        connectionState: 'idle'
      })
      setEditingConnectionId(null)
    },
    [addWebSocketConnection, websocket.connections]
  )

  const deleteConnection = useCallback(
    (connectionId: string) => {
      if (activeConnection?.id === connectionId) {
        disconnectActiveConnection()
      }

      if (editingConnectionId === connectionId) {
        setEditingConnectionId(null)
      }

      removeWebSocketConnection(connectionId)
    },
    [activeConnection?.id, disconnectActiveConnection, editingConnectionId, removeWebSocketConnection]
  )

  const handleItemContextMenu = useCallback(
    (connectionId: string, event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      showContextMenu(event.clientX, event.clientY, [
        {
          id: `ws-edit-${connectionId}`,
          label: 'Edit connection',
          action: () => {
            setActiveWebSocketConnection(connectionId)
            setEditingConnectionId(connectionId)
          }
        },
        {
          id: `ws-duplicate-${connectionId}`,
          label: 'Duplicate connection',
          action: () => duplicateConnection(connectionId)
        },
        { type: 'separator' },
        {
          id: `ws-delete-${connectionId}`,
          label: 'Delete connection',
          danger: true,
          action: () => deleteConnection(connectionId)
        }
      ])
    },
    [deleteConnection, duplicateConnection, setActiveWebSocketConnection, showContextMenu]
  )

  useEffect(() => {
    if (editingConnectionId && !websocket.connections.some(connection => connection.id === editingConnectionId)) {
      setEditingConnectionId(null)
    }
  }, [editingConnectionId, websocket.connections])

  useEffect(() => {
    setLogFilter('all')
  }, [activeConnection?.id])

  useEffect(() => {
    if (!activeConnection || !activeConnection.shouldConnect || activeConnection.connectionState !== 'idle' || !canConnectToWebSocket(activeConnection)) {
      return
    }

    const connectionId = activeConnection.id
    updateWebSocketConnection(connectionId, { connectionState: 'connecting' })

    void apiClientApi
      .connectWebSocketSession({
        session_id: connectionId,
        scheme: activeConnection.scheme,
        host: activeConnection.host,
        port: activeConnection.port,
        path: activeConnection.path,
        protocols: activeConnection.protocols,
        connect_timeout_ms: activeConnection.connectTimeoutMs,
        auto_reconnect: activeConnection.autoReconnect,
        reconnect_period_ms: activeConnection.reconnectPeriodMs
      })
      .then(response => {
        if (response.data) {
          applySessionSnapshot(connectionId, response.data)
        }
      })
      .catch(error => {
        updateWebSocketConnection(connectionId, { shouldConnect: false, connectionState: 'idle' })
        appendWebSocketConnectionLog(connectionId, {
          kind: 'system',
          message: error instanceof Error ? `Connection error: ${error.message}` : 'Connection error'
        })
      })
  }, [
    activeConnection,
    appendWebSocketConnectionLog,
    applySessionSnapshot,
    updateWebSocketConnection
  ])

  useEffect(() => {
    const sessionIds = pollingSessionIds.length > 0 ? pollingSessionIds.split('|') : []
    if (sessionIds.length === 0) {
      return
    }

    let disposed = false

    const pollSessions = async () => {
      await Promise.all(
        sessionIds.map(async sessionId => {
          try {
            const response = await apiClientApi.getWebSocketSession(sessionId)
            if (!disposed && response.data) {
              applySessionSnapshot(sessionId, response.data)
            }
          } catch {
            // Ignore polling failures and retry on next tick.
          }
        })
      )
    }

    void pollSessions()
    pollingRef.current = window.setInterval(() => {
      void pollSessions()
    }, 1000)

    return () => {
      disposed = true
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [applySessionSnapshot, pollingSessionIds])

  if (!activeConnection) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--vos-bg-surface)' }}>
        <EmptyState
          icon={<Cable size={18} />}
          title="No WebSocket connections"
          description="Create a connection profile to start testing frames."
          action={<Button variant="primary" size="sm" onClick={createConnection}>New connection</Button>}
        />
      </div>
    )
  }

  const connected = activeConnection.connectionState === 'connected'
  const connecting = activeConnection.connectionState === 'connecting'
  const fieldPrefix = `ws-${activeConnection.id}`
  const displayName = getConnectionName(activeConnection)

  const renderConnectionAction = () => {
    if (connecting) {
      return (
        <Button variant="danger" size="sm" leadingIcon={<Spinner size={14} color="currentColor" />} onClick={disconnectActiveConnection}>
          Cancel connect
        </Button>
      )
    }

    if (connected) {
      return (
        <Button variant="ghost" size="sm" leadingIcon={<Unplug size={14} />} onClick={disconnectActiveConnection}>
          Disconnect
        </Button>
      )
    }

    return (
      <Button
        variant="primary"
        size="sm"
        leadingIcon={<Plug size={14} />}
        disabled={!canConnect}
        onClick={() => patchActiveConnection({ shouldConnect: true })}
      >
        Connect
      </Button>
    )
  }

  if (isEditing) {
    return (
      <div className="flex-1 min-h-0 flex overflow-hidden" style={{ background: 'var(--vos-bg-surface)' }}>
        <ConnectionSidebar
          items={connectionItems}
          activeId={activeConnection.id}
          onSelect={selectConnection}
          onAdd={createConnection}
          onItemContextMenu={handleItemContextMenu}
        />

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b px-6" style={{ borderColor: 'var(--vos-border-subtle)', background: 'var(--vos-bg-secondary)' }}>
            <Button variant="ghost" size="sm" leadingIcon={<ChevronLeft size={14} />} onClick={() => setEditingConnectionId(null)}>
              Back
            </Button>
            <div className="text-sm font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
              Edit
            </div>
            {renderConnectionAction()}
          </div>

          <div className="mx-auto max-w-[960px] p-6 space-y-4">
            <WorkbenchSection title="General" description="Connection settings are saved to this profile automatically.">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Name" htmlFor={`${fieldPrefix}-name`}>
                  <FormInput
                    id={`${fieldPrefix}-name`}
                    value={activeConnection.name}
                    onChange={event => patchActiveConnection({ name: event.target.value })}
                    placeholder="notifications-gateway"
                  />
                </FormField>

                <FormField label="Protocol" htmlFor={`${fieldPrefix}-scheme`}>
                  <FormSelect
                    id={`${fieldPrefix}-scheme`}
                    value={activeConnection.scheme}
                    onChange={event => {
                      const nextScheme = event.target.value as WebSocketScheme
                      patchActiveConnection({
                        scheme: nextScheme,
                        port: getSchemePort(nextScheme, activeConnection.scheme, activeConnection.port)
                      })
                    }}
                  >
                    <option value="">Select protocol</option>
                    <option value="ws">ws</option>
                    <option value="wss">wss</option>
                  </FormSelect>
                </FormField>

                <FormField label="Host" htmlFor={`${fieldPrefix}-host`}>
                  <FormInput
                    id={`${fieldPrefix}-host`}
                    value={activeConnection.host}
                    onChange={event => patchActiveConnection({ host: event.target.value })}
                    placeholder="socket.example.com"
                  />
                </FormField>

                <FormField label="Port" htmlFor={`${fieldPrefix}-port`}>
                  <FormInput
                    id={`${fieldPrefix}-port`}
                    inputMode="numeric"
                    value={typeof activeConnection.port === 'number' ? String(activeConnection.port) : ''}
                    onChange={event => patchActiveConnection({ port: parseOptionalNumberInput(event.target.value, activeConnection.port) })}
                  />
                </FormField>

                <FormField label="Path" htmlFor={`${fieldPrefix}-path`}>
                  <FormInput
                    id={`${fieldPrefix}-path`}
                    value={activeConnection.path}
                    onChange={event => patchActiveConnection({ path: event.target.value })}
                    onBlur={event => patchActiveConnection({ path: withNormalizedPath(event.target.value) })}
                    placeholder="/socket"
                  />
                </FormField>

                <FormField label="Subprotocols" htmlFor={`${fieldPrefix}-protocols`}>
                  <FormInput
                    id={`${fieldPrefix}-protocols`}
                    value={activeConnection.protocols}
                    onChange={event => patchActiveConnection({ protocols: event.target.value })}
                    placeholder="json, graphql-ws"
                  />
                </FormField>
              </div>
            </WorkbenchSection>

            <WorkbenchSection title="Advanced" description="Less frequently changed runtime behavior.">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Connect timeout" htmlFor={`${fieldPrefix}-timeout`}>
                  <FormInput
                    id={`${fieldPrefix}-timeout`}
                    inputMode="numeric"
                    value={String(activeConnection.connectTimeoutMs)}
                    onChange={event =>
                      patchActiveConnection({ connectTimeoutMs: parseNumberInput(event.target.value, activeConnection.connectTimeoutMs) })
                    }
                  />
                </FormField>

                <FormField label="Reconnect delay" htmlFor={`${fieldPrefix}-reconnect-delay`}>
                  <FormInput
                    id={`${fieldPrefix}-reconnect-delay`}
                    inputMode="numeric"
                    value={String(activeConnection.reconnectPeriodMs)}
                    disabled={!activeConnection.autoReconnect}
                    onChange={event =>
                      patchActiveConnection({ reconnectPeriodMs: parseNumberInput(event.target.value, activeConnection.reconnectPeriodMs) })
                    }
                  />
                </FormField>
              </div>

              <div className="mt-4">
                <Checkbox
                  checked={activeConnection.autoReconnect}
                  onChange={checked => patchActiveConnection({ autoReconnect: checked })}
                  label="Auto reconnect after unexpected disconnect"
                />
              </div>
            </WorkbenchSection>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden" style={{ background: 'var(--vos-bg-surface)' }}>
      <ConnectionSidebar
        items={connectionItems}
        activeId={activeConnection.id}
        onSelect={selectConnection}
        onAdd={createConnection}
        onItemContextMenu={handleItemContextMenu}
      />

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--vos-border-subtle)', background: 'var(--vos-bg-secondary)' }}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
                  {displayName}
                </h2>
                <StatusBadge
                  status={getConnectionStatus(activeConnection.connectionState)}
                  icon={connecting ? <Spinner size={11} color="currentColor" /> : undefined}
                />
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                {endpointPreview || 'Fill protocol, host, and port to complete the endpoint.'}
              </div>
            </div>
            {renderConnectionAction()}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryField label="Endpoint" value={endpointPreview || '-'} />
            <SummaryField label="Protocols" value={activeConnection.protocols || '-'} />
            <SummaryField label="Timeout" value={`${activeConnection.connectTimeoutMs}ms`} />
            <SummaryField label="Reconnect" value={activeConnection.autoReconnect ? `${activeConnection.reconnectPeriodMs}ms` : 'manual'} />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="border-b px-5 py-3" style={{ borderColor: 'var(--vos-border-subtle)' }}>
            <div className="flex items-center gap-2">
              {([
                ['all', 'All'],
                ['in', 'Received'],
                ['out', 'Sent'],
                ['system', 'System']
              ] as const).map(([filter, label]) => (
                <Button
                  key={filter}
                  variant={logFilter === filter ? 'primary' : 'ghost'}
                  size="xs"
                  onClick={() => setLogFilter(filter)}
                >
                  {label}
                </Button>
              ))}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  void apiClientApi.clearWebSocketSessionLogs(activeConnection.id).then(response => {
                    if (response.data) {
                      applySessionSnapshot(activeConnection.id, response.data)
                    }
                  })
                }}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-3">
            {filteredLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--vos-border-subtle)', color: 'var(--vos-text-tertiary)' }}>
                No frames yet.
              </div>
            ) : (
              filteredLogs.map(log => (
                <div
                  key={log.id}
                  className="max-w-[72%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap"
                  style={{
                    marginLeft: log.kind === 'out' ? 'auto' : 0,
                    background:
                      log.kind === 'out'
                        ? 'color-mix(in srgb, var(--vos-accent-primary) 18%, var(--vos-bg-surface))'
                        : log.kind === 'in'
                          ? 'color-mix(in srgb, var(--vos-success) 16%, var(--vos-bg-surface))'
                          : 'var(--vos-bg-secondary)',
                    color: 'var(--vos-text-primary)'
                  }}
                >
                  <div className="mb-1 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--vos-text-tertiary)' }}>
                    {log.kind === 'in' ? 'Received' : log.kind === 'out' ? 'Sent' : 'System'}
                  </div>
                  {log.message}
                </div>
              ))
            )}
          </div>

          <div className="border-t px-5 py-4" style={{ borderColor: 'var(--vos-border-subtle)', background: 'var(--vos-bg-secondary)' }}>
            <FormField label="Payload" htmlFor={`${fieldPrefix}-payload`}>
              <FormTextarea
                id={`${fieldPrefix}-payload`}
                className="min-h-28 resize-y font-mono"
                value={activeConnection.messageDraft}
                onChange={event => patchActiveConnection({ messageDraft: event.target.value })}
                placeholder='{"ping":true}'
              />
            </FormField>
            <div className="mt-3 flex items-center justify-end">
              <Button
                variant={connected ? 'primary' : 'ghost'}
                size="sm"
                leadingIcon={<Send size={14} />}
                disabled={!connected || activeConnection.messageDraft.trim().length === 0}
                onClick={() => {
                  const messageDraft = activeConnection.messageDraft
                  void apiClientApi
                    .sendWebSocketFrame(activeConnection.id, { message: messageDraft })
                    .then(response => {
                      if (response.data) {
                        applySessionSnapshot(activeConnection.id, response.data)
                        patchActiveConnection({ messageDraft: '' })
                      }
                    })
                    .catch(error => {
                      appendWebSocketConnectionLog(activeConnection.id, {
                        kind: 'system',
                        message: error instanceof Error ? `Send failed: ${error.message}` : 'Send failed'
                      })
                    })
                }}
              >
                Send frame
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}