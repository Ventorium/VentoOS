import { ChevronDown, ChevronRight, File, Folder as FolderIcon, MoreHorizontal, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useApiClientStore } from '../store'
import { METHOD_COLORS } from '../constants'
import type { ApiRequest, CollectionTree, FolderTree } from '../types'

function RequestItem({ req }: { req: ApiRequest }) {
  const openRequest = useApiClientStore((s) => s.openRequest)

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:opacity-80 rounded mx-1"
      style={{ color: 'var(--vos-text-secondary)' }}
      onClick={() =>
        openRequest({
          id: req.id,
          name: req.name,
          method: req.method,
          url: req.url,
          request: {
            params: req.params,
            headers: req.headers,
            body: req.body,
            auth: req.auth,
            preRequestScript: req.preRequestScript,
            testScript: req.testScript,
          } as Record<string, unknown>,
        })
      }
    >
      <span className="font-bold text-[9px] uppercase w-8 shrink-0 text-center" style={{ color: METHOD_COLORS[req.method] }}>
        {req.method}
      </span>
      <span className="truncate">{req.name}</span>
    </div>
  )
}

function FolderNode({ folder, depth }: { folder: FolderTree; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs hover:opacity-80 rounded mx-1"
        style={{ paddingLeft: `${depth * 12 + 8}px`, color: 'var(--vos-text-secondary)' }}
        onClick={() => setExpanded(!expanded)}
      >
        <Icon size={12} className="shrink-0" />
        <FolderIcon size={12} className="shrink-0" style={{ color: 'var(--vos-text-tertiary)' }} />
        <span className="truncate">{folder.folder.name}</span>
      </div>
      {expanded && (
        <>
          {folder.subFolders.map((sf) => (
            <FolderNode key={sf.folder.id} folder={sf} depth={depth + 1} />
          ))}
          {folder.requests.map((r) => (
            <div key={r.id} style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
              <RequestItem req={r} />
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function CollectionNode({ tree }: { tree: CollectionTree }) {
  const [expanded, setExpanded] = useState(true)
  const Icon = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-xs font-medium hover:opacity-80 rounded mx-1"
        style={{ color: 'var(--vos-text-primary)' }}
        onClick={() => setExpanded(!expanded)}
      >
        <Icon size={13} className="shrink-0" />
        <span className="truncate flex-1">{tree.collection.name}</span>
        <button
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:opacity-80 shrink-0"
          style={{ color: 'var(--vos-text-tertiary)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={12} />
        </button>
      </div>
      {expanded && (
        <div className="ml-1">
          {tree.folders.map((f) => (
            <FolderNode key={f.folder.id} folder={f} depth={1} />
          ))}
          {tree.requests.map((r) => (
            <div key={r.id} style={{ paddingLeft: '12px' }}>
              <RequestItem req={r} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CollectionTreeView() {
  const collections = useApiClientStore((s) => s.collections)
  const isLoading = useApiClientStore((s) => s.isLoading)

  if (isLoading && collections.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
        Loading...
      </div>
    )
  }

  if (collections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-2">
        <File size={24} style={{ color: 'var(--vos-text-tertiary)' }} />
        <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
          No collections yet
        </span>
      </div>
    )
  }

  return (
    <div className="py-1">
      {collections.map((tree) => (
        <CollectionNode key={tree.collection.id} tree={tree} />
      ))}
    </div>
  )
}
