import { Database, FileCode, FolderTree, Play, Plus, Table } from 'lucide-react'
import { useState } from 'react'
import type { AppComponentProps } from '../registry'

const SIDEBAR_ITEMS = [
  { id: 'connections', label: 'Connections', icon: <Database size={16} /> },
  { id: 'tables', label: 'Tables', icon: <Table size={16} /> },
  { id: 'queries', label: 'SQL Workspace', icon: <FileCode size={16} /> },
  { id: 'schemas', label: 'Schemas', icon: <FolderTree size={16} /> }
]

export default function DatabaseApp(_props: AppComponentProps) {
  const [activeSection, setActiveSection] = useState('connections')

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{
          width: 180,
          borderRight: '0.5px solid var(--vos-border-subtle)',
          background: 'var(--vos-bg-surface)'
        }}
      >
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
            DATABASE
          </span>
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0"
            style={{ color: 'var(--vos-accent-primary)' }}
          >
            <Plus size={14} />
          </button>
        </div>
        {SIDEBAR_ITEMS.map(item => (
          <button
            type="button"
            key={item.id}
            className="flex items-center gap-2 px-3 py-1.5 text-xs border-none cursor-pointer text-left"
            style={{
              background: activeSection === item.id ? 'var(--vos-accent-primary)' : 'transparent',
              color: activeSection === item.id ? '#fff' : 'var(--vos-text-primary)',
              borderRadius: 6,
              margin: '0 8px 2px'
            }}
            onClick={() => setActiveSection(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeSection === 'queries' ? (
          /* SQL Editor placeholder */
          <div className="flex flex-col h-full">
            <div
              className="flex items-center justify-between px-4 h-10 flex-shrink-0"
              style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
            >
              <span className="text-sm font-medium">SQL Workspace</span>
              <button
                type="button"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer border-none"
                style={{
                  background: 'var(--vos-accent-primary)',
                  color: '#fff'
                }}
              >
                <Play size={12} />
                Execute
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--vos-bg-input)' }}>
              <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
                SQL editor will render here (Monaco Editor)
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Database size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
              <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                Database – {activeSection}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                Connect to a database to browse objects
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
