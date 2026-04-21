import { Tabs } from '@/components/ui'
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

  return (
    <Tabs
      tabs={tabs}
      activeTabId={activeTabId}
      onActivate={setActiveTab}
      onClose={closeTab}
      onDoubleClick={tabId => {
        const t = tabs.find(x => x.id === tabId)
        if (t?.isPreview) pinTab(tabId)
      }}
      onAuxClick={(e, tabId) => {
        if (e.button === 1) {
          e.stopPropagation()
          closeTab(tabId)
        }
      }}
      renderPrefix={(tab, isActive) => {
        const def = getResourceDef(tab.kind)
        const Icon = def.icon
        return (
          <Icon
            size={11}
            className="shrink-0"
            style={{ color: isActive ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
          />
        )
      }}
      renderContent={tab => {
        const def = getResourceDef(tab.kind)
        const cluster = clusters.find(c => c.id === tab.clusterId)
        return (
          <span className="truncate flex-1" style={{ fontStyle: tab.isPreview ? 'italic' : 'normal' }}>
            {def.pluralLabel} — {cluster?.name ?? tab.clusterId}
          </span>
        )
      }}
      showAddButton
      onAdd={() => {
        const first = clusters[0]
        if (first) openTab(first.id, '', 'overview')
      }}
      addButtonTitle="新建标签页"
    />
  )
}
