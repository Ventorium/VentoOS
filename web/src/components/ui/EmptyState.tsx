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
        <div className="text-[var(--vos-text-tertiary)] mx-auto mb-3 flex justify-center">
          {icon}
        </div>
        <div className="text-sm text-[var(--vos-text-secondary)]">
          {title}
        </div>
        {description && (
          <div className="text-xs mt-1 text-[var(--vos-text-tertiary)]">
            {description}
          </div>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}
