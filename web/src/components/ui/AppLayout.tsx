import type { ReactNode } from 'react'

export interface AppLayoutProps {
  sidebar: ReactNode
  children: ReactNode
  overlay?: ReactNode
}

export function AppLayout({ sidebar, children, overlay }: AppLayoutProps) {
  return (
    <div className="flex h-full relative">
      {overlay}
      {sidebar}
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
    </div>
  )
}

export interface AppSidebarProps {
  width?: number
  children: ReactNode
}

export function AppSidebar({ width = 220, children }: AppSidebarProps) {
  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-auto border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)]"
      style={{ width }}
    >
      {children}
    </div>
  )
}
