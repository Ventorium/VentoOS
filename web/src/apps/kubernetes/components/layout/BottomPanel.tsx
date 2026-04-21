import { Tabs } from '@/components/ui'
import { useBottomPanelStore } from '../../stores/bottom-panel-store'
import { LogsPanel } from '../bottom-panel/LogsPanel'
import { ShellPanel } from '../bottom-panel/ShellPanel'
import { YamlEditorPanel } from '../bottom-panel/YamlEditorPanel'

export function BottomPanel() {
  const tabs = useBottomPanelStore(s => s.tabs)
  const activeTabId = useBottomPanelStore(s => s.activeTabId)
  const setActiveTab = useBottomPanelStore(s => s.setActiveTab)
  const closeTab = useBottomPanelStore(s => s.closeTab)

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Inner tab bar */}
      <Tabs
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={setActiveTab}
        onClose={closeTab}
        variant="compact"
        renderContent={tab => <span className="truncate flex-1">{tab.title}</span>}
        showAddButton
        onAdd={() => {}}
        addButtonTitle="新建"
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab?.type === 'yaml' && (
          <YamlEditorPanel
            clusterId={activeTab.clusterId}
            namespace={activeTab.namespace ?? ''}
            kind={activeTab.kind!}
            name={activeTab.name!}
          />
        )}
        {activeTab?.type === 'logs' && (
          <LogsPanel
            clusterId={activeTab.clusterId}
            namespace={activeTab.namespace ?? ''}
            podName={activeTab.name!}
            container={activeTab.container}
          />
        )}
        {activeTab?.type === 'shell' && (
          <ShellPanel
            clusterId={activeTab.clusterId}
            namespace={activeTab.namespace ?? ''}
            podName={activeTab.name!}
            container={activeTab.container}
          />
        )}
        {!activeTab && (
          <div className="flex items-center justify-center h-full text-xs text-[var(--vos-text-tertiary)]">
            选择资源以编辑 YAML、查看日志或打开终端
          </div>
        )}
      </div>
    </div>
  )
}
