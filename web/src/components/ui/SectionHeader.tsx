import type { ReactNode } from 'react'

export interface SectionHeaderProps {
  title: string
  actions?: ReactNode
}

export function SectionHeader({ title, actions }: SectionHeaderProps) {
  return (
    <div className="px-3 pt-3 pb-2 flex items-center justify-between">
      <span className="text-[10px] font-semibold tracking-wider text-[var(--vos-text-tertiary)]">{title}</span>
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  )
}

export interface ToolbarProps {
  children: ReactNode
}

export function Toolbar({ children }: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 h-9 px-3 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]">
      {children}
    </div>
  )
}
