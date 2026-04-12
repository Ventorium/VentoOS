import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type NotificationItem, useNotificationStore } from '@/services/notification'
import { tokens } from '@/theme'

// ─── Constants ──────────────────────────────────────────────────────────────

const COLLAPSED_COUNT = 5
const ITEM_HEIGHT = 68

// ─── NotifItem ──────────────────────────────────────────────────────────────

function NotifItem({ n }: { n: NotificationItem }) {
  const markAsRead = useNotificationStore(s => s.markAsRead)
  const removeNotification = useNotificationStore(s => s.removeNotification)
  const levelColor = {
    info: 'var(--vos-accent-info)',
    success: 'var(--vos-accent-success)',
    warning: 'var(--vos-accent-warning)',
    error: 'var(--vos-accent-danger)'
  }[n.level]

  const time = new Date(n.createdAt)
  const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`

  return (
    <div
      className={n.read
        ? 'flex gap-3 p-3 rounded-lg border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] cursor-pointer bg-transparent'
        : 'flex gap-3 p-3 rounded-lg border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] cursor-pointer bg-[var(--vos-bg-input)]'}
      onClick={() => {
        if (!n.read) markAsRead(n.id)
      }}
    >
      <div className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ background: levelColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium truncate">{n.title}</span>
          <span className="text-[10px] flex-shrink-0 ml-2 text-[var(--vos-text-tertiary)]">
            {timeStr}
          </span>
        </div>
        <p className="text-xs mt-0.5 opacity-70">{n.message}</p>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        {!n.read && (
          <button
            type="button"
            className="vos-btn-reset text-[var(--vos-text-tertiary)]"
            onClick={e => {
              e.stopPropagation()
              markAsRead(n.id)
            }}
          >
            <Check size={12} />
          </button>
        )}
        <button
          type="button"
          className="vos-btn-reset text-[var(--vos-text-tertiary)]"
          onClick={e => {
            e.stopPropagation()
            removeNotification(n.id)
          }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Virtualized List ───────────────────────────────────────────────────────

function VirtualizedNotifList({ items }: { items: NotificationItem[] }) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportHeight = Math.min(items.length * ITEM_HEIGHT, 400)

  const startIdx = Math.floor(scrollTop / ITEM_HEIGHT)
  const endIdx = Math.min(startIdx + Math.ceil(viewportHeight / ITEM_HEIGHT) + 1, items.length)
  const visibleItems = items.slice(startIdx, endIdx)
  const totalHeight = items.length * ITEM_HEIGHT
  const offsetY = startIdx * ITEM_HEIGHT

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-auto"
      style={{ height: viewportHeight }}
    >
      <div className="relative" style={{ height: totalHeight }}>
        <div className="absolute left-0 right-0" style={{ top: offsetY }}>
          {visibleItems.map(n => (
            <div key={n.id} className="h-[68px]">
              <NotifItem n={n} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── NotificationCenter ─────────────────────────────────────────────────────

export default function NotificationCenter() {
  const panelOpen = useNotificationStore(s => s.panelOpen)
  const notifications = useNotificationStore(s => s.notifications)
  const setPanel = useNotificationStore(s => s.setPanel)
  const markAllAsRead = useNotificationStore(s => s.markAllAsRead)
  const clearAll = useNotificationStore(s => s.clearAll)
  const [expanded, setExpanded] = useState(false)

  const unreadCount = notifications.filter(n => !n.read).length
  const displayList = expanded ? notifications : notifications.slice(0, COLLAPSED_COUNT)
  const hasMore = notifications.length > COLLAPSED_COUNT

  // Reset expanded state when panel closes
  useEffect(() => {
    if (!panelOpen) setExpanded(false)
  }, [panelOpen])

  return (
    <AnimatePresence>
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div role="presentation" className="fixed inset-0 z-[2999]" onClick={() => setPanel(false)} />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="vos-glass-heavy fixed flex flex-col right-2 w-[340px] max-h-[calc(100vh-100px)] bg-[var(--vos-bg-overlay)] border-[0.5px] border-solid border-[var(--vos-border-default)] z-[3000] text-[var(--vos-text-primary)]"
            style={{
              top: tokens.topBar.height + 8,
              borderRadius: tokens.radius.panel,
              boxShadow: tokens.shadow.overlay
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-b-[var(--vos-border-subtle)]">
              <div className="flex items-center gap-2">
                <Bell size={14} />
                <span className="text-sm font-medium">通知</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--vos-accent-primary)] text-white font-medium">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="text-[11px] bg-transparent border-none cursor-pointer text-[var(--vos-accent-primary)]"
                    onClick={markAllAsRead}
                  >
                    全部已读
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    className="text-[11px] bg-transparent border-none cursor-pointer text-[var(--vos-text-tertiary)]"
                    onClick={clearAll}
                  >
                    清空
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto">
              {notifications.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-xs text-[var(--vos-text-tertiary)]">
                  暂无通知
                </div>
              ) : expanded ? (
                <VirtualizedNotifList items={notifications} />
              ) : (
                displayList.map(n => <NotifItem key={n.id} n={n} />)
              )}
            </div>

            {/* Expand / Collapse */}
            {hasMore && (
              <div
                className="flex items-center justify-center gap-1 py-2 border-t border-t-[var(--vos-border-subtle)] text-[11px] text-[var(--vos-accent-primary)] cursor-pointer hover:bg-[var(--vos-bg-item-hover)]"
                onClick={() => setExpanded(v => !v)}
              >
                {expanded ? (
                  <>
                    <ChevronUp size={12} />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} />
                    展开全部 ({notifications.length})
                  </>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
