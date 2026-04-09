import { ChevronRight } from 'lucide-react'
import { useEditorStore } from '../../stores/editor-store'
import { useWorkspaceStore } from '../../stores/workspace-store'

export default function Breadcrumbs() {
  const activeTab = useEditorStore(s => s.getActiveTab())
  const workspace = useWorkspaceStore(s => s.workspace)

  if (!activeTab) return null

  return (
    <div
      className="flex items-center gap-1 px-3 flex-shrink-0 overflow-hidden text-xs"
      style={{
        height: 22,
        background: 'var(--vos-bg-surface)',
        borderBottom: '0.5px solid var(--vos-border-subtle)',
        color: 'var(--vos-text-tertiary)'
      }}
    >
      {workspace && (
        <>
          <span className="flex-shrink-0 max-w-20 truncate">{workspace.name}</span>
          <ChevronRight size={10} style={{ flexShrink: 0 }} />
        </>
      )}
      {!activeTab.isNew ? (
        activeTab.node.path
          .split('/')
          .filter(Boolean)
          .map((seg, i, arr) => (
            <span key={`${seg}-${i}`} className="flex items-center gap-1 flex-shrink-0">
              <span
                className="cursor-pointer hover:underline"
                style={i === arr.length - 1 ? { color: 'var(--vos-text-primary)' } : {}}
              >
                {seg}
              </span>
              {i < arr.length - 1 && <ChevronRight size={10} />}
            </span>
          ))
      ) : (
        <span style={{ color: 'var(--vos-text-primary)' }}>{activeTab.node.name}</span>
      )}
    </div>
  )
}
