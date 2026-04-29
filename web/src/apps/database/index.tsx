import { Database, Info } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { AppLayout, AppSidebar, EmptyState } from '@/components'
import { Tabs } from '@/components/ui'
import type { AppComponentProps } from '@/kernel'
import { useAppStateSync, useEventHandler } from '@/kernel'
import type { OpenDatabasePayload } from '@/kernel'
import { createLogger } from '@/infra/logger'
import { dbApi } from './api'

const logger = createLogger('database/ipc')

/**
 * Handle open:database events from other apps (e.g. K8s).
 * Creates or updates a connection based on the event payload,
 * then optionally auto-connects.
 */
function useOpenDatabaseHandler() {
  const { addConnection, setConnectionStatus, setSchemas, expandNode, connections, setConnections } = useDatabaseStore()

  const handleOpenDatabase = useCallback(
    async (payload: OpenDatabasePayload) => {
      logger.info('Received open:database event', { dbType: payload.dbType, name: payload.name, connectionId: payload.connectionId })

      try {
        let connId = payload.connectionId

        if (connId) {
          // Update mode: update existing connection
          await dbApi.updateDbConnection(connId, {
            name: payload.name,
            host: payload.host,
            port: payload.port,
            database: payload.database,
            username: payload.username,
            password: payload.password,
          })
          // Re-fetch to get updated record
          const res = await dbApi.getDbConnections()
          setConnections(res.data)
        } else {
          // Create mode: check if a connection with same host/port/db already exists
          const existing = connections.find(
            c => c.engine === payload.dbType && c.host === payload.host && c.port === payload.port && c.database === payload.database
          )

          if (existing) {
            connId = existing.id
            // Update existing
            await dbApi.updateDbConnection(connId, {
              name: payload.name ?? existing.name,
              host: payload.host,
              port: payload.port,
              database: payload.database,
              username: payload.username,
              password: payload.password,
            })
            const res = await dbApi.getDbConnections()
            setConnections(res.data)
          } else {
            // Create new connection
            const res = await dbApi.createDbConnection({
              name: payload.name ?? `${payload.dbType} @ ${payload.host}:${payload.port}`,
              engine: payload.dbType,
              host: payload.host,
              port: payload.port,
              database: payload.database,
              username: payload.username,
              password: payload.password,
            })
            connId = res.data.id
            addConnection(res.data)
          }
        }

        // Auto-connect if requested
        if (connId && payload.autoConnect !== false) {
          setConnectionStatus(connId, 'connecting')
          try {
            await dbApi.connectDb(connId)
            setConnectionStatus(connId, 'connected')

            // Fetch schemas
            const schemasRes = await dbApi.getDbSchemas(connId)
            setSchemas(connId, schemasRes.data)

            // Expand tree node
            expandNode(`conn-${connId}`)

            logger.info('Auto-connected to database', { connId })
          } catch (err) {
            setConnectionStatus(connId, 'error')
            logger.warn('Auto-connect failed', err)
          }
        }
      } catch (err) {
        logger.error('Failed to handle open:database event', err)
      }
    },
    [addConnection, setConnectionStatus, setSchemas, expandNode, connections, setConnections]
  )

  // Register handlers for all database event topics
  useEventHandler('database', 'open:postgres', handleOpenDatabase)
  useEventHandler('database', 'open:mysql', handleOpenDatabase)
  useEventHandler('database', 'open:sqlite', handleOpenDatabase)
}
import { ConnectionConfigDialog } from './components/ConnectionConfigDialog'
import { ConnectionTree } from './components/ConnectionTree'
import { DataView } from './components/DataView'
import { InfoPanel } from './components/InfoPanel'
import { NewConnectionDialog } from './components/NewConnectionDialog'
import { ObjectBrowser } from './components/ObjectBrowser'
import { SqlEditor } from './components/SqlEditor'
import { TableDesigner } from './components/TableDesigner'
import { useDatabaseStore } from './stores'

export default function DatabaseApp({ windowId, initialAppState }: AppComponentProps) {
  // Register IPC event handlers for cross-app database opening
  useOpenDatabaseHandler()

  const {
    connections,
    setConnections,
    tabs,
    activeTabId,
    sqlText,
    savedQueries,
    addTab,
    removeTab,
    setActiveTab,
    setSqlText,
    setSavedQueries,
    showNewConnectionTypeDialog,
    showConnectionConfigDialog,
    infoPanelVisible,
    toggleInfoPanel,
    selectedNode
  } = useDatabaseStore()

  // Sync app state
  useAppStateSync(
    windowId,
    {
      activeTabId,
      selectedNodeId: useDatabaseStore.getState().selectedNodeId,
      sqlText,
      savedQueries
    },
    [activeTabId, sqlText, savedQueries]
  )

  // Load connections on mount
  const loadConnections = useCallback(async () => {
    try {
      const res = await dbApi.getDbConnections()
      setConnections(res.data)
    } catch (e) {
      console.error('Failed to load connections:', e)
    }
  }, [setConnections])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  // Restore initial state
  useEffect(() => {
    if (initialAppState?.activeTabId) {
      setActiveTab(initialAppState.activeTabId as string)
    }
    if (typeof initialAppState?.sqlText === 'string') {
      setSqlText(initialAppState.sqlText)
    }
    if (Array.isArray(initialAppState?.savedQueries)) {
      setSavedQueries(initialAppState.savedQueries as typeof savedQueries)
    }
  }, [initialAppState, setActiveTab, setSavedQueries, setSqlText])

  const activeTab = tabs.find(t => t.id === activeTabId)

  const renderTabContent = () => {
    if (!activeTab) return null

    switch (activeTab.type) {
      case 'objects':
        return <ObjectBrowser />
      case 'data':
        return <DataView />
      case 'design':
        return <TableDesigner />
      case 'query':
        return <SqlEditor />
      default:
        return null
    }
  }

  return (
    <AppLayout
      sidebar={
        <AppSidebar width={240}>
          <ConnectionTree />
        </AppSidebar>
      }
      overlay={
        <>
          {showNewConnectionTypeDialog && <NewConnectionDialog />}
          {showConnectionConfigDialog && <ConnectionConfigDialog />}
        </>
      }
    >
      {/* Tab bar */}
      <div className="flex items-center flex-shrink-0">
        <Tabs tabs={tabs} activeTabId={activeTabId} onActivate={setActiveTab} onClose={removeTab} className="flex-1" />
        {/* Info panel toggle */}
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 cursor-pointer border-none bg-transparent"
          style={{ color: infoPanelVisible ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
          onClick={toggleInfoPanel}
          title="信息面板"
        >
          <Info size={14} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {tabs.length > 0 ? (
            renderTabContent()
          ) : (
            <EmptyState
              icon={<Database size={48} />}
              title="数据库管理"
              description="在左侧连接树中选择表或视图以浏览数据"
            />
          )}
        </div>

        {/* Info panel */}
        {infoPanelVisible && <InfoPanel />}
      </div>
    </AppLayout>
  )
}
