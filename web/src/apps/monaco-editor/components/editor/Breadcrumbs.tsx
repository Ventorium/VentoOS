import { ChevronRight } from 'lucide-react'
import { useEditorStore } from '../../stores/editor-store'
import { useWorkspaceStore } from '../../stores/workspace-store'

export default function Breadcrumbs() {
  const activeTab = useEditorStore(s => s.getActiveTab())
  const workspace = useWorkspaceStore(s => s.workspace)

  if (!activeTab) return null

  return (
    <div className="flex items-center gap-1 px-3 flex-shrink-0 overflow-hidden text-xs h-[22px] bg-[var(--vos-bg-surface)] border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] text-[var(--vos-text-tertiary)]">
      {workspace && (
        <>
          <span className="flex-shrink-0 max-w-20 truncate">{workspace.name}</span>
          <ChevronRight size={10} className="shrink-0" />
        </>
      )}
      {!activeTab.isNew ? (
        activeTab.node.path
          .split('/')
          .filter(Boolean)
          .map((seg, i, arr) => (
            <span key={`${seg}-${i}`} className="flex items-center gap-1 flex-shrink-0">
              <span
                className={`cursor-pointer hover:underline${i === arr.length - 1 ? ' text-[var(--vos-text-primary)]' : ''}`}
              >
                {seg}
              </span>
              {i < arr.length - 1 && <ChevronRight size={10} />}
            </span>
          ))
      ) : (
        <span className="text-[var(--vos-text-primary)]">{activeTab.node.name}</span>
      )}
    </div>
  )
}
