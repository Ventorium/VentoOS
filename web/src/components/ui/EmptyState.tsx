import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div
          style={{
            color: 'var(--vos-text-tertiary)',
            margin: '0 auto 12px',
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          {icon}
        </div>
        <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
          {title}
        </div>
        {description && (
          <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
            {description}
          </div>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}
