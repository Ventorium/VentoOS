import { Key, List, Plus, Search, Terminal } from 'lucide-react'
import { useState } from 'react'
import type { AppComponentProps } from '@/kernel'

const SECTIONS = [
  { id: 'keys', label: 'Keys', icon: <Key size={16} /> },
  { id: 'cli', label: 'CLI', icon: <Terminal size={16} /> },
  { id: 'monitor', label: 'Monitor', icon: <List size={16} /> }
]

export default function RedisApp(_props: AppComponentProps) {
  const [activeSection, setActiveSection] = useState('keys')

  return (
    <div className="flex h-full">
      {/* Sidebar */}
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
            REDIS
          </span>
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0"
            style={{ color: 'var(--vos-accent-primary)' }}
          >
            <Plus size={14} />
          </button>
        </div>
        {SECTIONS.map(item => (
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
        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-4 h-10 flex-shrink-0"
          style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
        >
          <Search size={14} style={{ color: 'var(--vos-text-tertiary)' }} />
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-xs"
            style={{ color: 'var(--vos-text-primary)' }}
            placeholder="Filter keys…"
          />
        </div>

        {/* Placeholder */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Key size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
            <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
              Redis – {activeSection}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
              Connect to a Redis instance to browse keys
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
