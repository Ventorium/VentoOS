import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, X } from 'lucide-react'
import { type NotificationItem, useNotificationStore } from '@/store/notification'
import { tokens } from '@/theme'

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
      className="flex gap-3 p-3 rounded-lg"
      style={{
        background: n.read ? 'transparent' : 'var(--vos-bg-input)',
        borderBottom: '0.5px solid var(--vos-border-subtle)'
      }}
    >
      <div className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ background: levelColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium truncate">{n.title}</span>
          <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: 'var(--vos-text-tertiary)' }}>
            {timeStr}
          </span>
        </div>
        <p className="text-xs mt-0.5 opacity-70">{n.message}</p>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        {!n.read && (
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0"
            style={{ color: 'var(--vos-text-tertiary)' }}
            onClick={() => markAsRead(n.id)}
          >
            <Check size={12} />
          </button>
        )}
        <button
          type="button"
          className="bg-transparent border-none cursor-pointer p-0"
          style={{ color: 'var(--vos-text-tertiary)' }}
          onClick={() => removeNotification(n.id)}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

export default function NotificationCenter() {
  const panelOpen = useNotificationStore(s => s.panelOpen)
  const notifications = useNotificationStore(s => s.notifications)
  const setPanel = useNotificationStore(s => s.setPanel)
  const markAllAsRead = useNotificationStore(s => s.markAllAsRead)
  const clearAll = useNotificationStore(s => s.clearAll)

  return (
    <AnimatePresence>
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div role="presentation" className="fixed inset-0" style={{ zIndex: 2999 }} onClick={() => setPanel(false)} />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="vos-glass-heavy fixed flex flex-col"
            style={{
              top: tokens.topBar.height + 8,
              right: 8,
              width: 340,
              maxHeight: 'calc(100vh - 100px)',
              borderRadius: tokens.radius.panel,
              background: 'var(--vos-bg-overlay)',
              border: '0.5px solid var(--vos-border-default)',
              boxShadow: tokens.shadow.overlay,
              zIndex: 3000,
              color: 'var(--vos-text-primary)'
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--vos-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Bell size={14} />
                <span className="text-sm font-medium">Notifications</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[11px] bg-transparent border-none cursor-pointer"
                  style={{ color: 'var(--vos-accent-primary)' }}
                  onClick={markAllAsRead}
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  className="text-[11px] bg-transparent border-none cursor-pointer"
                  style={{ color: 'var(--vos-text-tertiary)' }}
                  onClick={clearAll}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto">
              {notifications.length === 0 ? (
                <div
                  className="flex items-center justify-center py-12 text-xs"
                  style={{ color: 'var(--vos-text-tertiary)' }}
                >
                  No notifications
                </div>
              ) : (
                notifications.map(n => <NotifItem key={n.id} n={n} />)
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
