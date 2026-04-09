import { Files, Search } from 'lucide-react'
import { useLayoutStore } from '../stores/layout-store'
import type { SidebarView } from '../types'

const ITEMS: { id: SidebarView; icon: React.ReactNode; title: string }[] = [
  { id: 'files', icon: <Files size={20} />, title: '资源管理器' },
  { id: 'search', icon: <Search size={20} />, title: '搜索' }
]

export default function ActivityBar() {
  const { sidebarOpen, sidebarView, toggleSidebar } = useLayoutStore()

  return (
    <div
      className="flex flex-col items-center gap-1 py-2 flex-shrink-0"
      style={{ width: 48, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
    >
      {ITEMS.map(item => {
        const active = sidebarOpen && sidebarView === item.id
        return (
          <button
            key={item.id}
            type="button"
            title={item.title}
            onClick={() => toggleSidebar(item.id)}
            className="flex items-center justify-center w-10 h-10 rounded"
            style={{
              background: active ? 'color-mix(in srgb, var(--vos-accent-primary) 20%, transparent)' : 'transparent',
              color: active ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s'
            }}
          >
            {item.icon}
          </button>
        )
      })}
    </div>
  )
}
