import { Tabs } from '@/components/ui'
import { getFileIconByName } from '@/kernel/apps/file-icons'
import { useEditorStore } from '../../stores/editor-store'

export default function EditorTabs() {
  const tabs = useEditorStore(s => s.tabs)
  const activeTabId = useEditorStore(s => s.activeTabId)
  const setActiveTab = useEditorStore(s => s.setActiveTab)
  const closeTab = useEditorStore(s => s.closeTab)
  const openNewUntitled = useEditorStore(s => s.openNewUntitled)
  const pinTab = useEditorStore(s => s.pinTab)
  const isMac = /Mac/.test(navigator.userAgent)

  return (
    <Tabs
      tabs={tabs}
      activeTabId={activeTabId}
      onActivate={setActiveTab}
      onClose={closeTab}
      onDoubleClick={pinTab}
      onAuxClick={(e, tabId) => {
        if (e.button === 1) {
          e.stopPropagation()
          closeTab(tabId)
        }
      }}
      closeButtonAlwaysVisible={tab => tab.content !== tab.savedContent}
      renderPrefix={(tab, isActive) => {
        const iconInfo = getFileIconByName(tab.node.name)
        const IconComp = iconInfo.icon
        return (
          <IconComp
            size={11}
            className="shrink-0"
            style={{ color: isActive ? iconInfo.color : 'var(--vos-text-tertiary)' }}
          />
        )
      }}
      renderContent={tab => {
        const isDirty = tab.content !== tab.savedContent
        return (
          <span className="truncate flex-1" style={{ fontStyle: tab.isPreview ? 'italic' : 'normal' }}>
            {isDirty && <span className="text-[var(--vos-accent-warning)] mr-[2px]">●</span>}
            {tab.node.name}
          </span>
        )
      }}
      showAddButton
      onAdd={openNewUntitled}
      addButtonTitle={`新建文件 (${isMac ? '⌘N' : 'Ctrl+Alt+N'})`}
    />
  )
}
