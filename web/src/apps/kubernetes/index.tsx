import { Box, HardDrive, Layers, Network, RefreshCw, Server, Settings } from 'lucide-react'
import { useState } from 'react'
import type { AppComponentProps } from '@/kernel'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: <Layers size={16} /> },
  { id: 'workloads', label: 'Workloads', icon: <Server size={16} /> },
  { id: 'network', label: 'Network', icon: <Network size={16} /> },
  { id: 'storage', label: 'Storage', icon: <HardDrive size={16} /> },
  { id: 'config', label: 'Config', icon: <Settings size={16} /> }
]

export default function KubernetesApp(_props: AppComponentProps) {
  const [activeNav, setActiveNav] = useState('overview')

  return (
    <div className="flex h-full">
      {/* Left sidebar – resource navigation */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{
          width: 180,
          borderRight: '0.5px solid var(--vos-border-subtle)',
          background: 'var(--vos-bg-surface)'
        }}
      >
        <div className="px-3 pt-3 pb-2 text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
          RESOURCES
        </div>
        {NAV_ITEMS.map(item => (
          <button
            type="button"
            key={item.id}
            className="flex items-center gap-2 px-3 py-1.5 text-xs border-none cursor-pointer text-left"
            style={{
              background: activeNav === item.id ? 'var(--vos-accent-primary)' : 'transparent',
              color: activeNav === item.id ? '#fff' : 'var(--vos-text-primary)',
              borderRadius: 6,
              margin: '0 8px 2px'
            }}
            onClick={() => setActiveNav(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center justify-between px-4 h-10 flex-shrink-0"
          style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
        >
          <span className="text-sm font-medium capitalize">{activeNav}</span>
          <button
            type="button"
            className="flex items-center gap-1 text-xs bg-transparent border-none cursor-pointer"
            style={{ color: 'var(--vos-accent-primary)' }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>

        {/* Content placeholder */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Box size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
            <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
              Kubernetes – {activeNav}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
              Connect to a cluster to get started
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
