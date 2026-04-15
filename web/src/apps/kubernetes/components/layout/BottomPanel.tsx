import { Plus, X } from 'lucide-react'
import { useBottomPanelStore } from '../../stores/bottom-panel-store'
import { YamlEditorPanel } from '../bottom-panel/YamlEditorPanel'
import { LogsPanel } from '../bottom-panel/LogsPanel'
import { ShellPanel } from '../bottom-panel/ShellPanel'

export function BottomPanel() {
  const tabs = useBottomPanelStore(s => s.tabs)
  const activeTabId = useBottomPanelStore(s => s.activeTabId)
  const setActiveTab = useBottomPanelStore(s => s.setActiveTab)
  const closeTab = useBottomPanelStore(s => s.closeTab)

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Inner tab bar */}
      <div className="flex items-center h-7 border-b-[0.5px] border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)] flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              className="flex items-center gap-1.5 px-2 h-full flex-shrink-0 cursor-pointer text-[11px] group border-r-[0.5px] border-r-[var(--vos-border-subtle)] min-w-[80px] max-w-[200px] select-none"
              style={{
                background: isActive ? 'var(--vos-bg-window)' : 'transparent',
                color: isActive ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
                borderBottom: isActive ? '1px solid var(--vos-accent-primary)' : '1px solid transparent',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="truncate flex-1">{tab.title}</span>
              <button
                type="button"
                className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 bg-transparent border-none cursor-pointer text-inherit"
                onClick={e => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <X size={10} />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="flex-shrink-0 px-2 h-full flex items-center text-[var(--vos-text-tertiary)] bg-transparent border-none cursor-pointer"
          onClick={() => {
            // TODO: open empty YAML apply tab
          }}
          title="新建"
        >
          <Plus size={12} />
        </button>
      </div>

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
