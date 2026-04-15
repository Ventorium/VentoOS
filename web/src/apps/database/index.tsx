import { Database, Info, X } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { AppLayout, AppSidebar, EmptyState } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useAppStateSync } from '@/kernel'
import { ConnectionTree } from './components/ConnectionTree'
import { ConnectionConfigDialog } from './components/ConnectionConfigDialog'
import { DataView } from './components/DataView'
import { InfoPanel } from './components/InfoPanel'
import { NewConnectionDialog } from './components/NewConnectionDialog'
import { ObjectBrowser } from './components/ObjectBrowser'
import { SqlEditor } from './components/SqlEditor'
import { TableDesigner } from './components/TableDesigner'
import { useDatabaseStore } from './stores'
import { dbApi } from './api'

export default function DatabaseApp({ windowId, initialAppState }: AppComponentProps) {
  const {
    connections, setConnections,
    tabs, activeTabId, addTab, removeTab, setActiveTab,
    showNewConnectionTypeDialog, showConnectionConfigDialog,
    infoPanelVisible, toggleInfoPanel,
    selectedNode,
  } = useDatabaseStore()

  // Sync app state
  useAppStateSync(windowId, {
    activeTabId,
    selectedNodeId: useDatabaseStore.getState().selectedNodeId,
  }, [activeTabId])

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
      <div className="flex items-center h-9 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]">
        <div className="flex-1 flex items-center overflow-x-auto px-1 gap-0.5">
          {tabs.map(tab => (
            <button
              type="button"
              key={tab.id}
              className="flex items-center gap-1.5 text-xs px-3 py-1 rounded cursor-pointer border-none whitespace-nowrap group"
              style={{
                background: activeTabId === tab.id ? 'var(--vos-accent-primary)' : 'transparent',
                color: activeTabId === tab.id ? '#fff' : 'var(--vos-text-secondary)',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="truncate max-w-[120px]">{tab.label}</span>
              {tab.closable && (
                <span
                  className="opacity-0 group-hover:opacity-100 hover:bg-white/20 rounded-sm p-0.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTab(tab.id)
                  }}
                  onKeyDown={() => {}}
                >
                  <X size={10} />
                </span>
              )}
            </button>
          ))}
        </div>

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
