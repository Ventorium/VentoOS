import { Tabs } from '@/components/ui'
import { METHOD_COLORS } from '../constants'
import { useApiClientStore } from '../store'

export default function TabBar() {
  const tabs = useApiClientStore(s => s.tabs)
  const activeTabId = useApiClientStore(s => s.activeTabId)
  const setActiveTab = useApiClientStore(s => s.setActiveTab)
  const removeTab = useApiClientStore(s => s.removeTab)
  const addTab = useApiClientStore(s => s.addTab)

  return (
    <Tabs
      tabs={tabs}
      activeTabId={activeTabId}
      onActivate={setActiveTab}
      onClose={removeTab}
      closeButtonAlwaysVisible
      className="border-b border-b-[var(--vos-border-subtle)]"
      renderPrefix={tab => (
        <span className="font-semibold text-[10px] uppercase" style={{ color: METHOD_COLORS[tab.method] }}>
          {tab.method}
        </span>
      )}
      renderContent={tab => <span className="max-w-32 truncate">{tab.name}</span>}
      renderSuffix={tab =>
        tab.isDirty ? (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--vos-accent-primary)' }} />
        ) : null
      }
      showAddButton
      onAdd={() => addTab()}
      addButtonTitle="New Request"
    />
  )
}
