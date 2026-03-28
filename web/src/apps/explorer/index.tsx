import { ChevronDown, ChevronRight, Download, File, FolderOpen, Grid, List, Upload } from 'lucide-react'
import { useState } from 'react'
import type { AppComponentProps } from '../registry'

interface FileNode {
  name: string
  type: 'folder' | 'file'
  children?: FileNode[]
}

const DEMO_TREE: FileNode[] = [
  {
    name: 'Documents',
    type: 'folder',
    children: [
      { name: 'README.md', type: 'file' },
      { name: 'config.yaml', type: 'file' }
    ]
  },
  {
    name: 'Downloads',
    type: 'folder',
    children: []
  },
  { name: 'notes.txt', type: 'file' }
]

function TreeItem({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 w-full text-xs py-1 border-none cursor-pointer text-left bg-transparent hover:opacity-80"
        style={{
          paddingLeft: 8 + depth * 16,
          color: 'var(--vos-text-primary)'
        }}
        onClick={() => node.type === 'folder' && setExpanded(!expanded)}
      >
        {node.type === 'folder' ? (
          expanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )
        ) : (
          <span style={{ width: 12 }} />
        )}
        {node.type === 'folder' ? (
          <FolderOpen size={14} style={{ color: 'var(--vos-accent-warning)' }} />
        ) : (
          <File size={14} style={{ color: 'var(--vos-text-tertiary)' }} />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && node.children?.map(child => <TreeItem key={child.name} node={child} depth={depth + 1} />)}
    </div>
  )
}

export default function ExplorerApp(_props: AppComponentProps) {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  return (
    <div className="flex h-full">
      {/* Sidebar – file tree */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{
          width: 200,
          borderRight: '0.5px solid var(--vos-border-subtle)',
          background: 'var(--vos-bg-surface)'
        }}
      >
        <div className="px-3 pt-3 pb-2 text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
          MOUNTS
        </div>
        <div className="px-1">
          {DEMO_TREE.map(node => (
            <TreeItem key={node.name} node={node} />
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center justify-between px-4 h-10 flex-shrink-0"
          style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
            <span>/ Documents</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-text-tertiary)' }}
            >
              <Upload size={14} />
            </button>
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-text-tertiary)' }}
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{
                color: viewMode === 'grid' ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)'
              }}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={14} />
            </button>
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{
                color: viewMode === 'list' ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)'
              }}
              onClick={() => setViewMode('list')}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Content placeholder */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FolderOpen size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
            <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
              Explorer
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
              Mount a remote filesystem to browse files
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
