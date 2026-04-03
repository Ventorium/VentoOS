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

import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import type { ContextMenuItems } from '@/shell/ContextMenu/store'

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

function ActivityButton({
  item,
  isActive,
  onClick,
}: {
  item: ActivityItem
  isActive: boolean
  onClick: () => void
}) {
  const showCtxMenu = useContextMenuStore(s => s.show)

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!item.contextMenu?.length) return
    e.preventDefault()
    e.stopPropagation()
    showCtxMenu(e.clientX, e.clientY, item.contextMenu)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className={`vos-activity-item ${isActive ? 'vos-activity-item-active' : ''}`}
        title={item.label}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        style={{
          position: 'relative',
        }}
      >
        {item.icon}

        {/* Active indicator — left border */}
        {isActive && (
          <motion.div
            layoutId="activity-indicator"
            style={{
              position: 'absolute',
              left: 0,
              top: '20%',
              bottom: '20%',
              width: 2,
              borderRadius: 1,
              background: 'var(--vos-accent-primary)',
            }}
          />
        )}

        {/* Badge */}
        {item.badge != null && item.badge > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              background: 'var(--vos-accent-primary)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              lineHeight: 1,
            }}
          >
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
  activeId,
  onSelect,
  panelContent,
  panelWidth = 200,
  panelCollapsed = false,
  activityBarHeader,
  activityBarFooter,
  panelHeader,
}: AppSidebarProps) {
  const showPanel = !panelCollapsed && activeId != null && panelContent != null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {/* Activity Bar */}
      <div className="vos-activity-bar" style={{ width: 40 }}>
        {activityBarHeader && (
          <div style={{ marginBottom: 4 }}>{activityBarHeader}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, paddingTop: 4 }}>
          {activities.map(item => (
            <ActivityButton
              key={item.id}
              item={item}
              isActive={activeId === item.id}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </div>

        {activityBarFooter && (
          <div style={{ marginTop: 4 }}>{activityBarFooter}</div>
        )}
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
            style={{
              overflow: 'hidden',
              flexShrink: 0,
              borderRight: '0.5px solid var(--vos-border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            <div
              style={{
                width: panelWidth,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {panelHeader && (
                <div className="vos-panel-header">{panelHeader}</div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {panelContent}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Convenience re-exports ─────────────────────────────────────────────────

export type { ContextMenuItems }
