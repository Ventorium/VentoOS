import { Plus, X } from 'lucide-react'
import { useClusterStore } from '../../stores/cluster-store'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import { getResourceDef } from '../../utils/resource-registry'

export function K8sTabBar() {
  const tabs = useKubernetesStore(s => s.tabs)
  const activeTabId = useKubernetesStore(s => s.activeTabId)
  const setActiveTab = useKubernetesStore(s => s.setActiveTab)
  const closeTab = useKubernetesStore(s => s.closeTab)
  const pinTab = useKubernetesStore(s => s.pinTab)
  const openTab = useKubernetesStore(s => s.openTab)
  const clusters = useClusterStore(s => s.clusters)

  const handleAuxClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.stopPropagation()
      closeTab(tabId)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    const idx = tabs.findIndex(t => t.id === tabId)
    // Simple custom context menu via native menu or alert for now
    // In full impl use useContextMenu store
    const menu = document.createElement('div')
    // We'll skip full custom menu in skeleton; right-click close is acceptable for P0
  }

  return (
    <div className="flex items-center flex-shrink-0 overflow-x-auto h-[35px] min-h-[35px] border-b-[0.5px] border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]">
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId
        const cluster = clusters.find(c => c.id === tab.clusterId)
        const def = getResourceDef(tab.kind)
        const Icon = def.icon
        return (
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            className="flex items-center gap-1.5 px-3 h-full flex-shrink-0 cursor-pointer text-xs group border-r-[0.5px] border-r-[var(--vos-border-subtle)] min-w-[100px] max-w-[240px] select-none"
            style={{
              background: isActive ? 'var(--vos-bg-window)' : 'transparent',
              color: isActive ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
              borderBottom: isActive ? '2px solid var(--vos-accent-primary)' : '2px solid transparent',
            }}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => { if (tab.isPreview) pinTab(tab.id) }}
            onAuxClick={e => handleAuxClick(e, tab.id)}
          >
            <Icon size={11} className="shrink-0" style={{ color: isActive ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }} />
            <span className="truncate flex-1" style={{ fontStyle: tab.isPreview ? 'italic' : 'normal' }}>
              {def.pluralLabel} — {cluster?.name ?? tab.clusterId}
            </span>
            <button
              type="button"
              className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 bg-transparent border-none cursor-pointer text-inherit`}
              onClick={e => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              title="关闭"
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="flex-shrink-0 px-2 h-full flex items-center text-[var(--vos-text-tertiary)] bg-transparent border-none cursor-pointer"
        onClick={() => {
          const first = clusters[0]
          if (first) openTab(first.id, '', 'overview')
        }}
        title="新建标签页"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
