import { ChevronLeft, Radio, Send, Wifi, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, EmptyState, FormField, FormInput, FormSelect, FormTextarea, Spinner, StatusBadge } from '@/components/ui'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { apiClientApi } from '../api'
import { useApiClientStore } from '../store'
import type { MqttConnection, MqttScheme, MqttSubscription, ProtocolLogEntry, ProtocolSessionSnapshot } from '../types'
import { buildMqttBrokerUrl, withNormalizedPath } from '../utils/socket-connections'
import { ConnectionSidebar, WorkbenchSection } from './ProtocolWorkbenchLayout'

const MQTT_DEFAULT_PORTS: Record<MqttScheme, number> = {
  mqtt: 1883,
  mqtts: 8883,
  ws: 8083,
  wss: 8084
}

type MqttLogFilter = 'all' | ProtocolLogEntry['kind']

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

function isWebSocketTransport(scheme: MqttScheme) {
  return scheme === 'ws' || scheme === 'wss'
}

function getConnectionStatus(connectionState: MqttConnection['connectionState']) {
  return connectionState === 'idle' ? 'disconnected' : connectionState
}

function getConnectionName(connection: MqttConnection) {
  return connection.name.trim() || connection.host.trim() || 'Untitled MQTT'
}

function getConnectionPrimary(connection: MqttConnection) {
  return connection.host.trim() || 'Host not configured'
}

function getConnectionSecondary(connection: MqttConnection) {
  const protocol = connection.scheme.toUpperCase()
  const port = typeof connection.port === 'number' ? `:${connection.port}` : ''
  return `${protocol}${port}${isWebSocketTransport(connection.scheme) && connection.path.trim() ? ` · ${connection.path.trim()}` : ''}`
}

function getSchemePort(nextScheme: MqttScheme, currentScheme: MqttScheme, currentPort: number | null) {
  if (currentPort === null || currentPort === MQTT_DEFAULT_PORTS[currentScheme]) {
    return MQTT_DEFAULT_PORTS[nextScheme]
  }

  return currentPort
}

function getSchemePath(nextScheme: MqttScheme, currentPath: string) {
  if (!isWebSocketTransport(nextScheme)) {
    return currentPath
  }

  return currentPath.trim().length > 0 ? withNormalizedPath(currentPath) : '/mqtt'
}

function canConnectToMqtt(connection: MqttConnection) {
  return connection.host.trim().length > 0 && typeof connection.port === 'number'
}

function duplicateConnectionName(name: string) {
  const baseName = name.trim() || 'Untitled MQTT'
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

export default function MqttWorkbench() {
  const pollingRef = useRef<number | null>(null)
  const [logFilter, setLogFilter] = useState<MqttLogFilter>('all')
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null)

  const showContextMenu = useContextMenuStore(s => s.show)
  const mqttState = useApiClientStore(s => s.mqtt)
  const addMqttConnection = useApiClientStore(s => s.addMqttConnection)
  const updateMqttConnection = useApiClientStore(s => s.updateMqttConnection)
  const removeMqttConnection = useApiClientStore(s => s.removeMqttConnection)
  const setActiveMqttConnection = useApiClientStore(s => s.setActiveMqttConnection)
  const addMqttSubscription = useApiClientStore(s => s.addMqttSubscription)
  const updateMqttSubscription = useApiClientStore(s => s.updateMqttSubscription)
  const removeMqttSubscription = useApiClientStore(s => s.removeMqttSubscription)
  const appendMqttConnectionLog = useApiClientStore(s => s.appendMqttConnectionLog)

  const activeConnection = useMemo(
    () => mqttState.connections.find(connection => connection.id === mqttState.activeConnectionId) ?? mqttState.connections[0] ?? null,
    [mqttState.activeConnectionId, mqttState.connections]
  )

  const isEditing = activeConnection != null && editingConnectionId === activeConnection.id
  const brokerPreview = activeConnection ? buildMqttBrokerUrl(activeConnection) : ''
  const canConnect = activeConnection ? canConnectToMqtt(activeConnection) : false
  const connectionItems = useMemo(
    () =>
      mqttState.connections.map(connection => ({
        id: connection.id,
        title: getConnectionName(connection),
        primary: getConnectionPrimary(connection),
        secondary: getConnectionSecondary(connection),
        status: getConnectionStatus(connection.connectionState)
      })),
    [mqttState.connections]
  )
  const filteredLogs = useMemo(() => {
    if (!activeConnection) {
      return []
    }

    return logFilter === 'all'
      ? activeConnection.logs
      : activeConnection.logs.filter(log => log.kind === logFilter)
  }, [activeConnection, logFilter])
  const subscriptionSignature = useMemo(
    () =>
      activeConnection?.subscriptions
        .map(subscription => `${subscription.id}:${subscription.topic}:${subscription.qos}:${subscription.enabled ? '1' : '0'}`)
        .join('|') ?? '',
    [activeConnection?.subscriptions]
  )
  const pollingSessionIds = useMemo(
    () => mqttState.connections.filter(connection => connection.shouldConnect || connection.connectionState !== 'idle').map(connection => connection.id).join('|'),
    [mqttState.connections]
  )

  const applySessionSnapshot = useCallback(
    (connectionId: string, snapshot: ProtocolSessionSnapshot) => {
      updateMqttConnection(connectionId, {
        connectionState: snapshot.connection_state,
        shouldConnect: snapshot.connection_state !== 'idle',
        logs: snapshot.logs
      })
    },
    [updateMqttConnection]
  )

  const patchActiveConnection = useCallback(
    (updates: Partial<MqttConnection>) => {
      if (!activeConnection) {
        return
      }

      updateMqttConnection(activeConnection.id, updates)
    },
    [activeConnection, updateMqttConnection]
  )

  const disconnectActiveConnection = useCallback(() => {
    if (!activeConnection) {
      return
    }

    updateMqttConnection(activeConnection.id, { shouldConnect: false, connectionState: 'idle' })
    void apiClientApi.disconnectMqttSession(activeConnection.id).then(response => {
      if (response.data) {
        applySessionSnapshot(activeConnection.id, response.data)
      }
    })
  }, [activeConnection, applySessionSnapshot, updateMqttConnection])

  const selectConnection = useCallback(
    (connectionId: string) => {
      if (activeConnection && activeConnection.id !== connectionId && activeConnection.shouldConnect) {
        disconnectActiveConnection()
      }

      setActiveMqttConnection(connectionId)
      setEditingConnectionId(null)
    },
    [activeConnection, disconnectActiveConnection, setActiveMqttConnection]
  )

  const createConnection = useCallback(() => {
    const connectionId = addMqttConnection()
    setEditingConnectionId(connectionId)
  }, [addMqttConnection])

  const duplicateConnection = useCallback(
    (connectionId: string) => {
      const source = mqttState.connections.find(connection => connection.id === connectionId)
      if (!source) {
        return
      }

      addMqttConnection({
        ...source,
        name: duplicateConnectionName(source.name),
        logs: [],
        shouldConnect: false,
        connectionState: 'idle'
      })
      setEditingConnectionId(null)
    },
    [addMqttConnection, mqttState.connections]
  )

  const deleteConnection = useCallback(
    (connectionId: string) => {
      if (activeConnection?.id === connectionId) {
        disconnectActiveConnection()
      }

      if (editingConnectionId === connectionId) {
        setEditingConnectionId(null)
      }

      removeMqttConnection(connectionId)
    },
    [activeConnection?.id, disconnectActiveConnection, editingConnectionId, removeMqttConnection]
  )

  const handleItemContextMenu = useCallback(
    (connectionId: string, event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      showContextMenu(event.clientX, event.clientY, [
        {
          id: `mqtt-edit-${connectionId}`,
          label: 'Edit connection',
          action: () => {
            setActiveMqttConnection(connectionId)
            setEditingConnectionId(connectionId)
          }
        },
        {
          id: `mqtt-duplicate-${connectionId}`,
          label: 'Duplicate connection',
          action: () => duplicateConnection(connectionId)
        },
        { type: 'separator' },
        {
          id: `mqtt-delete-${connectionId}`,
          label: 'Delete connection',
          danger: true,
          action: () => deleteConnection(connectionId)
        }
      ])
    },
    [deleteConnection, duplicateConnection, setActiveMqttConnection, showContextMenu]
  )

  useEffect(() => {
    if (editingConnectionId && !mqttState.connections.some(connection => connection.id === editingConnectionId)) {
      setEditingConnectionId(null)
    }
  }, [editingConnectionId, mqttState.connections])

  useEffect(() => {
    setLogFilter('all')
  }, [activeConnection?.id])

  useEffect(() => {
    if (!activeConnection || !activeConnection.shouldConnect || activeConnection.connectionState !== 'idle' || !canConnectToMqtt(activeConnection)) {
      return
    }

    const connectionId = activeConnection.id
    updateMqttConnection(connectionId, { connectionState: 'connecting' })
    void apiClientApi
      .connectMqttSession({
        session_id: connectionId,
        scheme: activeConnection.scheme,
        host: activeConnection.host,
        port: activeConnection.port,
        path: activeConnection.path,
        username: activeConnection.username,
        password: activeConnection.password,
        client_id: activeConnection.clientId,
        mqtt_version: activeConnection.mqttVersion,
        connect_timeout_seconds: activeConnection.connectTimeoutSeconds,
        keep_alive_seconds: activeConnection.keepAliveSeconds,
        auto_reconnect: activeConnection.autoReconnect,
        reconnect_period_ms: activeConnection.reconnectPeriodMs,
        clean_start: activeConnection.cleanStart,
        subscriptions: activeConnection.subscriptions.map(subscription => ({
          topic: subscription.topic,
          qos: subscription.qos,
          enabled: subscription.enabled
        }))
      })
      .then(response => {
        if (response.data) {
          applySessionSnapshot(connectionId, response.data)
        }
      })
      .catch(error => {
        updateMqttConnection(connectionId, { shouldConnect: false, connectionState: 'idle' })
        appendMqttConnectionLog(connectionId, {
          kind: 'system',
          message: error instanceof Error ? `Connection error: ${error.message}` : 'Connection error'
        })
      })
  }, [activeConnection, appendMqttConnectionLog, applySessionSnapshot, updateMqttConnection])

  useEffect(() => {
    if (!activeConnection || !activeConnection.shouldConnect || activeConnection.subscriptions.length === 0 && subscriptionSignature.length === 0) {
      return
    }

    void apiClientApi
      .syncMqttSubscriptions(activeConnection.id, {
        subscriptions: activeConnection.subscriptions.map(subscription => ({
          topic: subscription.topic,
          qos: subscription.qos,
          enabled: subscription.enabled
        }))
      })
      .then(response => {
        if (response.data) {
          applySessionSnapshot(activeConnection.id, response.data)
        }
      })
      .catch(() => {
        // Ignore background sync failures and retry on next change or poll tick.
      })
  }, [activeConnection?.id, activeConnection?.shouldConnect, applySessionSnapshot, subscriptionSignature])

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
            const response = await apiClientApi.getMqttSession(sessionId)
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
          icon={<Radio size={18} />}
          title="No MQTT connections"
          description="Create a connection profile to start subscribing and publishing."
          action={<Button variant="primary" size="sm" onClick={createConnection}>New connection</Button>}
        />
      </div>
    )
  }

  const connected = activeConnection.connectionState === 'connected'
  const connecting = activeConnection.connectionState === 'connecting'
  const fieldPrefix = `mqtt-${activeConnection.id}`
  const displayName = getConnectionName(activeConnection)
  const showPathField = isWebSocketTransport(activeConnection.scheme)

  const renderConnectionAction = () => {
    if (connecting) {
      return (
        <Button
          variant="danger"
          size="sm"
          leadingIcon={<Spinner size={14} color="currentColor" />}
          onClick={disconnectActiveConnection}
        >
          Cancel connect
        </Button>
      )
    }

    if (connected) {
      return (
        <Button variant="ghost" size="sm" leadingIcon={<WifiOff size={14} />} onClick={disconnectActiveConnection}>
          Disconnect
        </Button>
      )
    }

    return (
      <Button
        variant="primary"
        size="sm"
        leadingIcon={<Wifi size={14} />}
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
                <FormField label="Name" htmlFor={`${fieldPrefix}-name`} required>
                  <FormInput
                    id={`${fieldPrefix}-name`}
                    value={activeConnection.name}
                    onChange={event => patchActiveConnection({ name: event.target.value })}
                    placeholder="emqx-test"
                  />
                </FormField>

                <FormField label="Protocol" htmlFor={`${fieldPrefix}-protocol`} required>
                  <FormSelect
                    id={`${fieldPrefix}-protocol`}
                    value={activeConnection.scheme}
                    onChange={event => {
                      const nextScheme = event.target.value as MqttScheme
                      patchActiveConnection({
                        scheme: nextScheme,
                        port: getSchemePort(nextScheme, activeConnection.scheme, activeConnection.port),
                        path: getSchemePath(nextScheme, activeConnection.path)
                      })
                    }}
                  >
                    <option value="mqtt">mqtt</option>
                    <option value="mqtts">mqtts</option>
                    <option value="ws">ws</option>
                    <option value="wss">wss</option>
                  </FormSelect>
                </FormField>

                <FormField label="Host" htmlFor={`${fieldPrefix}-host`} required>
                  <FormInput
                    id={`${fieldPrefix}-host`}
                    value={activeConnection.host}
                    onChange={event => patchActiveConnection({ host: event.target.value })}
                    placeholder="broker.emqx.io"
                  />
                </FormField>

                <FormField label="Port" htmlFor={`${fieldPrefix}-port`} required>
                  <FormInput
                    id={`${fieldPrefix}-port`}
                    inputMode="numeric"
                    value={typeof activeConnection.port === 'number' ? String(activeConnection.port) : ''}
                    onChange={event => patchActiveConnection({ port: parseOptionalNumberInput(event.target.value, activeConnection.port) })}
                  />
                </FormField>

                <FormField label="Client ID" htmlFor={`${fieldPrefix}-client-id`}>
                  <FormInput
                    id={`${fieldPrefix}-client-id`}
                    value={activeConnection.clientId}
                    onChange={event => patchActiveConnection({ clientId: event.target.value })}
                    placeholder="emqx-test"
                  />
                </FormField>

                {showPathField ? (
                  <FormField label="Path" htmlFor={`${fieldPrefix}-path`}>
                    <FormInput
                      id={`${fieldPrefix}-path`}
                      value={activeConnection.path}
                      onChange={event => patchActiveConnection({ path: event.target.value })}
                      onBlur={event => patchActiveConnection({ path: withNormalizedPath(event.target.value || '/mqtt') })}
                      placeholder="/mqtt"
                    />
                  </FormField>
                ) : null}

                <FormField label="Username" htmlFor={`${fieldPrefix}-username`}>
                  <FormInput
                    id={`${fieldPrefix}-username`}
                    value={activeConnection.username}
                    onChange={event => patchActiveConnection({ username: event.target.value })}
                    placeholder="Optional username"
                  />
                </FormField>

                <FormField label="Password" htmlFor={`${fieldPrefix}-password`}>
                  <FormInput
                    id={`${fieldPrefix}-password`}
                    type="password"
                    value={activeConnection.password}
                    onChange={event => patchActiveConnection({ password: event.target.value })}
                    placeholder="Optional password"
                  />
                </FormField>
              </div>
            </WorkbenchSection>

            <WorkbenchSection title="Advanced" description="Less frequently changed session parameters.">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="MQTT version" htmlFor={`${fieldPrefix}-version`}>
                  <FormSelect
                    id={`${fieldPrefix}-version`}
                    value={activeConnection.mqttVersion}
                    onChange={event => patchActiveConnection({ mqttVersion: event.target.value as MqttConnection['mqttVersion'] })}
                  >
                    <option value="3.1.1">3.1.1</option>
                    <option value="5.0">5.0</option>
                  </FormSelect>
                </FormField>

                <FormField label="Connect timeout" htmlFor={`${fieldPrefix}-timeout`}>
                  <FormInput
                    id={`${fieldPrefix}-timeout`}
                    inputMode="numeric"
                    value={String(activeConnection.connectTimeoutSeconds)}
                    onChange={event =>
                      patchActiveConnection({
                        connectTimeoutSeconds: parseNumberInput(event.target.value, activeConnection.connectTimeoutSeconds)
                      })
                    }
                  />
                </FormField>

                <FormField label="Keep alive" htmlFor={`${fieldPrefix}-keepalive`}>
                  <FormInput
                    id={`${fieldPrefix}-keepalive`}
                    inputMode="numeric"
                    value={String(activeConnection.keepAliveSeconds)}
                    onChange={event =>
                      patchActiveConnection({ keepAliveSeconds: parseNumberInput(event.target.value, activeConnection.keepAliveSeconds) })
                    }
                  />
                </FormField>

                <FormField label="Reconnect delay" htmlFor={`${fieldPrefix}-reconnect`}>
                  <FormInput
                    id={`${fieldPrefix}-reconnect`}
                    inputMode="numeric"
                    disabled={!activeConnection.autoReconnect}
                    value={String(activeConnection.reconnectPeriodMs)}
                    onChange={event =>
                      patchActiveConnection({ reconnectPeriodMs: parseNumberInput(event.target.value, activeConnection.reconnectPeriodMs) })
                    }
                  />
                </FormField>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Checkbox
                  checked={activeConnection.autoReconnect}
                  onChange={checked => patchActiveConnection({ autoReconnect: checked })}
                  label="Auto reconnect"
                />
                <Checkbox
                  checked={activeConnection.cleanStart}
                  onChange={checked => patchActiveConnection({ cleanStart: checked })}
                  label="Clean start"
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
                {brokerPreview || 'Fill host and port to complete the broker profile.'}
              </div>
            </div>
            {renderConnectionAction()}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <SummaryField label="Name" value={activeConnection.name || '-'} />
            <SummaryField label="Client ID" value={activeConnection.clientId || '-'} />
            <SummaryField label="Username" value={activeConnection.username || '-'} />
            <SummaryField label="Password" value={activeConnection.password ? '••••••••' : '-'} />
            <SummaryField label="Keep alive" value={`${activeConnection.keepAliveSeconds}s`} />
            <SummaryField label="Clean start" value={activeConnection.cleanStart ? 'true' : 'false'} />
          </div>
        </div>

        <div className="flex-1 min-h-0 grid lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto border-r px-4 py-4" style={{ borderColor: 'var(--vos-border-subtle)' }}>
            <WorkbenchSection
              title="Subscriptions"
              description="Manage the topics attached to this broker profile."
              actions={
                <Button size="xs" variant="primary" onClick={() => addMqttSubscription(activeConnection.id, { topic: 'test/133' })}>
                  New Subscription
                </Button>
              }
            >
              <div className="space-y-3">
                {activeConnection.subscriptions.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-center text-xs" style={{ borderColor: 'var(--vos-border-subtle)', color: 'var(--vos-text-tertiary)' }}>
                    No topics yet.
                  </div>
                ) : (
                  activeConnection.subscriptions.map(subscription => (
                    <div key={subscription.id} className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--vos-border-subtle)' }}>
                      <FormInput
                        value={subscription.topic}
                        onChange={event => updateMqttSubscription(activeConnection.id, subscription.id, { topic: event.target.value })}
                        placeholder="test/133"
                      />
                      <div className="grid gap-2 grid-cols-[112px_minmax(0,1fr)_auto] items-center">
                        <FormSelect
                          value={String(subscription.qos)}
                          onChange={event =>
                            updateMqttSubscription(activeConnection.id, subscription.id, {
                              qos: Number.parseInt(event.target.value, 10) as MqttSubscription['qos']
                            })
                          }
                        >
                          <option value="0">QoS 0</option>
                          <option value="1">QoS 1</option>
                          <option value="2">QoS 2</option>
                        </FormSelect>
                        <Checkbox
                          checked={subscription.enabled}
                          onChange={checked => updateMqttSubscription(activeConnection.id, subscription.id, { enabled: checked })}
                          label="Enabled"
                        />
                        <Button size="xs" variant="ghost" onClick={() => removeMqttSubscription(activeConnection.id, subscription.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </WorkbenchSection>
          </div>

          <div className="min-h-0 flex flex-col overflow-hidden">
            <div className="border-b px-5 py-3" style={{ borderColor: 'var(--vos-border-subtle)' }}>
              <div className="flex items-center gap-2">
                {([
                  ['all', 'All'],
                  ['in', 'Received'],
                  ['out', 'Published'],
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
                    void apiClientApi.clearMqttSessionLogs(activeConnection.id).then(response => {
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
                  No messages yet.
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
                      {log.kind === 'in' ? 'Received' : log.kind === 'out' ? 'Published' : 'System'}
                    </div>
                    {log.message}
                  </div>
                ))
              )}
            </div>

            <div className="border-t px-5 py-4" style={{ borderColor: 'var(--vos-border-subtle)', background: 'var(--vos-bg-secondary)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="xs">JSON</Button>
                <Button variant="ghost" size="xs">QoS 0</Button>
                <Button variant="ghost" size="xs">Retain</Button>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(220px,320px)_minmax(0,1fr)_auto] xl:items-end">
                <FormField label="Topic" htmlFor={`${fieldPrefix}-publish-topic`}>
                  <FormInput
                    id={`${fieldPrefix}-publish-topic`}
                    value={activeConnection.publishTopic}
                    onChange={event => patchActiveConnection({ publishTopic: event.target.value })}
                    placeholder="test/133"
                  />
                </FormField>

                <FormField label="Payload" htmlFor={`${fieldPrefix}-payload`}>
                  <FormTextarea
                    id={`${fieldPrefix}-payload`}
                    className="min-h-28 resize-y font-mono"
                    value={activeConnection.payloadDraft}
                    onChange={event => patchActiveConnection({ payloadDraft: event.target.value })}
                    placeholder='{"msg":"hello"}'
                  />
                </FormField>

                <Button
                  variant={connected ? 'primary' : 'ghost'}
                  size="sm"
                  leadingIcon={<Send size={14} />}
                  disabled={
                    !connected ||
                    activeConnection.publishTopic.trim().length === 0 ||
                    activeConnection.payloadDraft.trim().length === 0
                  }
                  onClick={() => {
                    void apiClientApi
                      .publishMqttMessage(activeConnection.id, {
                        topic: activeConnection.publishTopic,
                        payload: activeConnection.payloadDraft,
                        qos: 0,
                        retain: false
                      })
                      .then(response => {
                        if (response.data) {
                          applySessionSnapshot(activeConnection.id, response.data)
                        }
                      })
                      .catch(error => {
                        appendMqttConnectionLog(activeConnection.id, {
                          kind: 'system',
                          message: error instanceof Error ? `Publish failed: ${error.message}` : 'Publish failed'
                        })
                      })
                  }}
                >
                  Publish
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}