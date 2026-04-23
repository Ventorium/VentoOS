/**
 * AppSidebar UIKit — VSCode-style Activity Bar + Panel Sidebar
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │ [Activity Bar 40px] │ [Panel Sidebar variable] │
 *   └────────────────────────────────────────────────┘
 *
 * - Activity Bar: narrow icon-only navigation (like VSCode left sidebar)
 * - Panel Sidebar: expandable content area for the active section
 * - Right-click on activity items for extended context menu options
 *
 * Designed for multi-source apps: Explorer, K8s, Redis, Database
 */

import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { ContextMenuItems } from '@/shell/ContextMenu/store'
import { useContextMenuStore } from '@/shell/ContextMenu/store'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ActivityItem {
  /** Unique key for the section */
  id: string
  /** Tooltip label shown on hover */
  label: string
  /** Icon to display (Lucide component or any ReactNode) */
  icon: ReactNode
  /** Optional badge count (e.g. connected sources) */
  badge?: number
  /** Right-click context menu items for this activity section */
  contextMenu?: ContextMenuItems
}

export interface AppSidebarProps {
  /** List of activity bar items */
  activities: ActivityItem[]
  /** Optional bottom-aligned activities */
  bottomActivities?: ActivityItem[]
  /** Currently active activity id */
  activeId: string | null
  /** Called when user clicks an activity item */
  onSelect: (id: string) => void
  /** Content to render inside the panel sidebar for the active activity */
  panelContent?: ReactNode
  /** Width of the panel sidebar in pixels (default: 200) */
  panelWidth?: number
  /** Whether the panel sidebar is collapsed */
  panelCollapsed?: boolean
  /** Header content for top of activity bar (e.g. logo/brand) */
  activityBarHeader?: ReactNode
  /** Footer content for bottom of activity bar (e.g. settings icon) */
  activityBarFooter?: ReactNode
  /** Optional panel sidebar title/header */
  panelHeader?: ReactNode
}

// ─── ActivityButton ─────────────────────────────────────────────────────────

function ActivityButton({ item, isActive, onClick }: { item: ActivityItem; isActive: boolean; onClick: () => void }) {
  const showCtxMenu = useContextMenuStore(s => s.show)

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!item.contextMenu?.length) return
    e.preventDefault()
    e.stopPropagation()
    showCtxMenu(e.clientX, e.clientY, item.contextMenu)
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={`vos-activity-item relative ${isActive ? 'vos-activity-item-active' : ''}`}
        title={item.label}
        aria-label={item.label}
        aria-pressed={isActive}
        onClick={onClick}
        onContextMenu={handleContextMenu}
      >
        <span className="flex items-center justify-center w-full h-full">{item.icon}</span>

        {/* Active indicator — left border */}
        {isActive && (
          <motion.div
            layoutId="activity-indicator"
            className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-[1px] bg-[var(--vos-accent-primary)]"
          />
        )}

        {/* Badge */}
        {item.badge != null && item.badge > 0 && (
          <div className="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full bg-[var(--vos-accent-primary)] text-white text-[9px] font-bold flex items-center justify-center px-[3px] leading-[1]">
            {item.badge > 99 ? '99+' : item.badge}
          </div>
        )}
      </button>
    </div>
  )
}

// ─── AppSidebar ─────────────────────────────────────────────────────────────

export function AppSidebar({
  activities,
  bottomActivities = [],
  activeId,
  onSelect,
  panelContent,
  panelWidth = 200,
  panelCollapsed = false,
  activityBarHeader,
  activityBarFooter,
  panelHeader
}: AppSidebarProps) {
  const showPanel = !panelCollapsed && activeId != null && panelContent != null

  return (
    <div className="flex flex-row h-full shrink-0">
      {/* Activity Bar */}
      <div className="vos-activity-bar w-[40px]">
        {activityBarHeader && <div className="mb-1">{activityBarHeader}</div>}

        <div className="flex flex-col gap-[2px] flex-1 pt-1">
          {activities.map(item => (
            <ActivityButton
              key={item.id}
              item={item}
              isActive={activeId === item.id}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </div>

        {bottomActivities.length > 0 && (
          <div className="mt-1 flex flex-col gap-[2px]">
            {bottomActivities.map(item => (
              <ActivityButton
                key={item.id}
                item={item}
                isActive={activeId === item.id}
                onClick={() => onSelect(item.id)}
              />
            ))}
          </div>
        )}

        {activityBarFooter && <div className="mt-1">{activityBarFooter}</div>}
      </div>

      {/* Panel Sidebar */}
      <AnimatePresence initial={false}>
        {showPanel && (
          <motion.div
            key="panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden shrink-0 border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)] flex flex-col h-full"
          >
            <div className="h-full flex flex-col overflow-hidden" style={{ width: panelWidth }}>
              {panelHeader && <div className="vos-panel-header">{panelHeader}</div>}
              <div className="flex-1 overflow-y-auto min-h-0">{panelContent}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Convenience re-exports ─────────────────────────────────────────────────

export type { ContextMenuItems }
