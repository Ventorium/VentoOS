import { Database, Info } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { AppLayout, AppSidebar, EmptyState } from '@/components'
import { Tabs } from '@/components/ui'
import type { AppComponentProps } from '@/kernel'
import { useAppStateSync } from '@/kernel'
import { dbApi } from './api'
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
  const {
    connections,
    setConnections,
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
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
      selectedNodeId: useDatabaseStore.getState().selectedNodeId
    },
    [activeTabId]
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
  }, [initialAppState, setActiveTab])

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
