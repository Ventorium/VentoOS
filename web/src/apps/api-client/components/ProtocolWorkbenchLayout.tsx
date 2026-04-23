import type { ReactNode } from 'react'
import { Button, Spinner, StatusBadge } from '@/components/ui'

interface ConnectionListItem {
  id: string
  title: string
  primary?: string
  secondary?: string
  status: 'connected' | 'connecting' | 'disconnected'
}

interface ConnectionSidebarProps {
  items: ConnectionListItem[]
  activeId: string | null
  onSelect: (connectionId: string) => void
  onAdd: () => void
  onItemContextMenu?: (connectionId: string, event: React.MouseEvent<HTMLButtonElement>) => void
  addLabel?: string
}

export function ConnectionSidebar({
  items,
  activeId,
  onSelect,
  onAdd,
  onItemContextMenu,
  addLabel = 'New connection'
}: ConnectionSidebarProps) {
  return (
    <aside
      className="w-[260px] min-w-[260px] border-r flex flex-col"
      style={{
        borderColor: 'var(--vos-border-subtle)',
        background: 'color-mix(in srgb, var(--vos-bg-secondary) 98%, rgba(255, 255, 255, 0.02))'
      }}
    >
      <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--vos-border-subtle)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[15px] font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
            Connections
          </div>
          <Button variant="ghost" size="xs" onClick={onAdd} aria-label={addLabel}>
            +
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 py-3 space-y-1.5">
        {items.map(item => {
          const selected = item.id === activeId

          return (
            <button
              key={item.id}
              type="button"
              className="w-full rounded-xl px-3 py-2.5 text-left transition-colors"
              style={{
                background: selected ? 'color-mix(in srgb, var(--vos-accent-primary) 8%, var(--vos-bg-surface))' : 'transparent',
                boxShadow: selected ? 'inset 0 0 0 1px color-mix(in srgb, var(--vos-accent-primary) 22%, transparent)' : 'none'
              }}
              onClick={() => onSelect(item.id)}
              onContextMenu={event => onItemContextMenu?.(item.id, event)}
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    background:
                      item.status === 'connected'
                        ? 'var(--vos-success)'
                        : item.status === 'connecting'
                          ? 'var(--vos-warning)'
                          : 'color-mix(in srgb, var(--vos-text-tertiary) 65%, transparent)'
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-medium" style={{ color: 'var(--vos-text-primary)' }}>
                      {item.title}
                    </div>
                    {item.status === 'connecting' ? <Spinner size={10} color="currentColor" /> : null}
                  </div>
                  {item.primary ? (
                    <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
                      {item.primary}
                    </div>
                  ) : null}
                  {item.secondary ? (
                    <div className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                      {item.secondary}
                    </div>
                  ) : null}
                </div>
                <StatusBadge
                  status={item.status}
                  icon={item.status === 'connecting' ? <Spinner size={10} color="currentColor" /> : undefined}
                />
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

interface WorkbenchSectionProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function WorkbenchSection({ title, description, actions, children, className }: WorkbenchSectionProps) {
  return (
    <section
      className={`rounded-[18px] border p-4 ${className ?? ''}`.trim()}
      style={{
        borderColor: 'var(--vos-border-subtle)',
        background: 'color-mix(in srgb, var(--vos-bg-surface) 98%, rgba(255, 255, 255, 0.02))'
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
            {title}
          </div>
          {description ? (
            <div className="mt-1 text-xs leading-5" style={{ color: 'var(--vos-text-tertiary)' }}>
              {description}
            </div>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}