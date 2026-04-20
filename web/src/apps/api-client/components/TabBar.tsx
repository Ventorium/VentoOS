import { Plus, X } from 'lucide-react'
import { useApiClientStore } from '../store'
import { METHOD_COLORS } from '../constants'

export default function TabBar() {
  const tabs = useApiClientStore((s) => s.tabs)
  const activeTabId = useApiClientStore((s) => s.activeTabId)
  const setActiveTab = useApiClientStore((s) => s.setActiveTab)
  const removeTab = useApiClientStore((s) => s.removeTab)
  const addTab = useApiClientStore((s) => s.addTab)

  return (
    <div
      className="flex items-center h-9 overflow-x-auto shrink-0"
      style={{ background: 'var(--vos-bg-secondary)', borderBottom: '1px solid var(--vos-border-subtle)' }}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="flex items-center gap-1.5 px-3 h-full cursor-pointer shrink-0 text-xs select-none"
          style={{
            background: tab.id === activeTabId ? 'var(--vos-bg-surface)' : 'transparent',
            color: tab.id === activeTabId ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
            borderRight: '1px solid var(--vos-border-subtle)',
          }}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="font-semibold text-[10px] uppercase" style={{ color: METHOD_COLORS[tab.method] }}>
            {tab.method}
          </span>
          <span className="max-w-32 truncate">{tab.name}</span>
          {tab.isDirty && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--vos-accent-primary)' }} />
          )}
          <button
            className="ml-1 p-0.5 rounded hover:opacity-80 shrink-0"
            style={{ color: 'var(--vos-text-tertiary)' }}
            onClick={(e) => {
              e.stopPropagation()
              removeTab(tab.id)
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        className="flex items-center justify-center w-8 h-full shrink-0 hover:opacity-80"
        style={{ color: 'var(--vos-text-tertiary)' }}
        onClick={() => addTab()}
        title="New Request"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
