import { Plus } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import EditorTab from './EditorTab'

export default function EditorTabs() {
  const tabs = useEditorStore(s => s.tabs)
  const activeTabId = useEditorStore(s => s.activeTabId)
  const setActiveTab = useEditorStore(s => s.setActiveTab)
  const closeTab = useEditorStore(s => s.closeTab)
  const openNewUntitled = useEditorStore(s => s.openNewUntitled)
  const pinTab = useEditorStore(s => s.pinTab)
  const moveTab = useEditorStore(s => s.moveTab)
  const isMac = /Mac/.test(navigator.userAgent)

  // Drag state
  const dragFromRef = useRef<number | null>(null)
  const dragToRef = useRef<number | null>(null)

  const handleDragStart = useCallback((index: number) => {
    dragFromRef.current = index
  }, [])

  const handleDragOver = useCallback((index: number) => {
    dragToRef.current = index
  }, [])

  const handleDragEnd = useCallback(() => {
    const from = dragFromRef.current
    const to = dragToRef.current
    dragFromRef.current = null
    dragToRef.current = null
    if (from !== null && to !== null && from !== to) {
      moveTab(from, to)
    }
  }, [moveTab])

  return (
    <div
      className="flex items-center flex-shrink-0 overflow-x-auto h-[35px] min-h-[35px] border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]"
    >
      {tabs.map((tab, i) => (
        <EditorTab
          key={tab.id}
          tab={tab}
          index={i}
          isActive={tab.id === activeTabId}
          isDirty={tab.content !== tab.savedContent}
          onActivate={() => setActiveTab(tab.id)}
          onClose={e => {
            e.stopPropagation()
            closeTab(tab.id)
          }}
          onDoubleClick={() => pinTab(tab.id)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        />
      ))}
      <button
        type="button"
        className="flex-shrink-0 px-2 h-full flex items-center text-[var(--vos-text-tertiary)] bg-transparent border-none cursor-pointer"
        title={`新建文件 (${isMac ? '⌘N' : 'Ctrl+Alt+N'})`}
        onClick={openNewUntitled}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
