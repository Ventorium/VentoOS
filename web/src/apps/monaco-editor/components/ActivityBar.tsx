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
      className="flex flex-col items-center gap-1 py-2 flex-shrink-0 w-[48px] border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]"
    >
      {ITEMS.map(item => {
        const active = sidebarOpen && sidebarView === item.id
        return (
          <button
            key={item.id}
            type="button"
            title={item.title}
            onClick={() => toggleSidebar(item.id)}
            className="flex items-center justify-center w-10 h-10 rounded border-none cursor-pointer transition-[color,background] duration-150"
            style={{
              background: active ? 'color-mix(in srgb, var(--vos-accent-primary) 20%, transparent)' : 'transparent',
              color: active ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)'
            }}
          >
            {item.icon}
          </button>
        )
      })}
    </div>
  )
}
