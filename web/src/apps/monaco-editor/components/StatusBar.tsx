import { Spinner } from '@/components'
import { useEditorStore } from '../stores/editor-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { displayLanguage } from '../utils/language-detection'

function Sep() {
  return <span className="opacity-[0.35] mx-1">|</span>
}

export default function StatusBar() {
  const activeTab = useEditorStore(s => s.getActiveTab())
  const cursorLine = useEditorStore(s => s.cursorLine)
  const cursorCol = useEditorStore(s => s.cursorCol)
  const isIndexing = useWorkspaceStore(s => s.isIndexing)

  const isDirty = activeTab ? activeTab.content !== activeTab.savedContent : false

  return (
    <div className="flex items-center px-2 flex-shrink-0 text-[11px] select-none overflow-hidden h-[22px] bg-[var(--vos-accent-primary)] text-[#ffffffcc]">
      {activeTab ? (
        <>
          {/* Left section */}
          <div className="flex items-center flex-1 min-w-0">
            <span className="px-1">{displayLanguage(activeTab.language)}</span>
            <Sep />
            <span className="px-1">
              Ln {cursorLine}, Col {cursorCol}
            </span>
            <Sep />
            <span className="px-1">UTF-8</span>
            <Sep />
            <span className="px-1">Spaces: 2</span>
            {isDirty && (
              <>
                <Sep />
                <span className="px-1 text-[#ffd86e]">● 已修改</span>
              </>
            )}
          </div>
          {/* Right section */}
          <div className="flex items-center flex-shrink-0">
            {isIndexing && (
              <span className="px-1 flex items-center gap-1">
                <Spinner size={10} /> 索引中
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="px-1">代码编辑器</span>
          {isIndexing && (
            <>
              <Sep />
              <span className="px-1 flex items-center gap-1">
                <Spinner size={10} /> 建立索引中...
              </span>
            </>
          )}
        </>
      )}
    </div>
  )
}
