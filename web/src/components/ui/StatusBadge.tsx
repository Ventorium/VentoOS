import type { ReactNode } from 'react'

const STATUS_MAP: Record<string, { color: string; label?: string }> = {
  connected: { color: 'var(--vos-accent-success)' },
  active: { color: 'var(--vos-accent-success)' },
  running: { color: 'var(--vos-accent-success)' },
  connecting: { color: 'var(--vos-accent-warning)' },
  starting: { color: 'var(--vos-accent-warning)' },
  disconnected: { color: 'var(--vos-text-tertiary)' },
  stopped: { color: 'var(--vos-text-tertiary)' },
  error: { color: 'var(--vos-accent-danger)' }
}

export interface StatusBadgeProps {
  status: string
  icon?: ReactNode
}

export function StatusBadge({ status, icon }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.disconnected
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color: cfg.color }}>
      {icon} {status}
    </span>
  )
}
