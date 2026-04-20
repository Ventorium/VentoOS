import { BookOpen, Clock, FolderPlus, Globe, Import, Plus, Star, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useApiClientStore } from '../store'
import { METHOD_COLORS } from '../constants'
import CollectionTreeView from './CollectionTree'
import EnvironmentSelector from './EnvironmentSelector'
import type { HistoryEntry } from '../types'

function HistoryList() {
  const history = useApiClientStore((s) => s.history)
  const openRequest = useApiClientStore((s) => s.openRequest)

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-2">
        <Clock size={24} style={{ color: 'var(--vos-text-tertiary)' }} />
        <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
          No history yet
        </span>
      </div>
    )
  }

  return (
    <div className="py-1">
      {history.map((entry) => {
        const req = entry.request as { method?: string; url?: string; name?: string }
        const method = (req.method ?? 'GET') as keyof typeof METHOD_COLORS
        return (
          <div
            key={entry.id}
            className="flex items-center gap-1.5 px-2 py-1.5 mx-1 cursor-pointer text-xs hover:opacity-80 rounded"
            style={{ color: 'var(--vos-text-secondary)' }}
            onClick={() =>
              openRequest({
                id: entry.id,
                name: req.name ?? req.url ?? 'Untitled',
                method: method as any,
                url: req.url ?? '',
                request: entry.request,
              })
            }
          >
            <span className="font-bold text-[9px] uppercase w-8 shrink-0 text-center" style={{ color: METHOD_COLORS[method] }}>
              {method}
            </span>
            <span className="truncate flex-1">{req.url ?? 'Untitled'}</span>
            {entry.starred && <Star size={10} style={{ color: '#f59e0b' }} />}
          </div>
        )
      })}
    </div>
  )
}

function EnvironmentsList() {
  const environments = useApiClientStore((s) => s.environments)

  if (environments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-2">
        <Globe size={24} style={{ color: 'var(--vos-text-tertiary)' }} />
        <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
          No environments yet
        </span>
      </div>
    )
  }

  return (
    <div className="py-1">
      {environments.map((env) => (
        <div
          key={env.id}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer hover:opacity-80 rounded mx-1"
          style={{ color: 'var(--vos-text-secondary)' }}
        >
          <Globe size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
          <span className="truncate flex-1">{env.name}</span>
          {env.isGlobal && (
            <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
              Global
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
            {env.variables.length} vars
          </span>
        </div>
      ))}
    </div>
  )
}

type SidebarTabKey = 'collections' | 'environments' | 'history'

const SIDEBAR_TABS: { key: SidebarTabKey; label: string; icon: typeof BookOpen }[] = [
  { key: 'collections', label: 'Collections', icon: BookOpen },
  { key: 'environments', label: 'Env', icon: Globe },
  { key: 'history', label: 'History', icon: Clock },
]

export default function Sidebar() {
  const sidebarTab = useApiClientStore((s) => s.sidebarTab)
  const setSidebarTab = useApiClientStore((s) => s.setSidebarTab)
  const loadCollections = useApiClientStore((s) => s.loadCollections)
  const loadEnvironments = useApiClientStore((s) => s.loadEnvironments)
  const loadHistory = useApiClientStore((s) => s.loadHistory)

  useEffect(() => {
    loadCollections()
    loadEnvironments()
    loadHistory()
  }, [])

  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{
        width: 260,
        borderRight: '1px solid var(--vos-border-subtle)',
        background: 'var(--vos-bg-secondary)',
      }}
    >
      {/* Sidebar tabs */}
      <div
        className="flex items-center shrink-0"
        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        {SIDEBAR_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] relative"
              style={{
                color: sidebarTab === tab.key ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
              }}
              onClick={() => setSidebarTab(tab.key)}
            >
              <Icon size={12} />
              {tab.label}
              {sidebarTab === tab.key && (
                <div
                  className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                  style={{ background: 'var(--vos-accent-primary)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Actions bar */}
      <div
        className="flex items-center justify-between px-2 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        {sidebarTab === 'collections' && (
          <div className="flex items-center gap-1">
            <button
              className="p-1 rounded hover:opacity-80"
              style={{ color: 'var(--vos-text-tertiary)' }}
              title="New Collection"
            >
              <FolderPlus size={13} />
            </button>
            <button
              className="p-1 rounded hover:opacity-80"
              style={{ color: 'var(--vos-text-tertiary)' }}
              title="Import"
            >
              <Import size={13} />
            </button>
          </div>
        )}
        {sidebarTab === 'environments' && (
          <div className="flex items-center gap-1">
            <button
              className="p-1 rounded hover:opacity-80"
              style={{ color: 'var(--vos-text-tertiary)' }}
              title="New Environment"
            >
              <Plus size={13} />
            </button>
          </div>
        )}
        {sidebarTab === 'history' && (
          <div className="flex items-center gap-1">
            <button
              className="p-1 rounded hover:opacity-80"
              style={{ color: 'var(--vos-text-tertiary)' }}
              title="Clear History"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
        <div className="flex-1" />
        <EnvironmentSelector />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {sidebarTab === 'collections' && <CollectionTreeView />}
        {sidebarTab === 'environments' && <EnvironmentsList />}
        {sidebarTab === 'history' && <HistoryList />}
      </div>
    </div>
  )
}
