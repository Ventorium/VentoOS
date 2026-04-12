/**
 * Notification Toast System
 *
 * Renders pop-up banners from the top-right of the screen.
 * Only shown when do-not-disturb is OFF.
 * Toasts auto-dismiss after 5 seconds (vanish from screen) but do NOT mark as read.
 * The notification stays unread in the notification center — only explicit user
 * action (click, mark-as-read, clear) changes the read state / tray badge count.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle, Info, X, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type NotificationItem, useNotificationStore } from '@/services/notification'
import { tokens } from '@/theme'

const LEVEL_CONFIG = {
  info: { icon: Info, color: 'var(--vos-accent-info)' },
  success: { icon: CheckCircle, color: 'var(--vos-accent-success)' },
  warning: { icon: AlertCircle, color: 'var(--vos-accent-warning)' },
  error: { icon: XCircle, color: 'var(--vos-accent-danger)' }
}

const AUTO_DISMISS_MS = 5000

function Toast({ notification, onDismiss }: { notification: NotificationItem; onDismiss: (id: string) => void }) {
  const remove = useNotificationStore(s => s.removeNotification)
  const config = LEVEL_CONFIG[notification.level]
  const Icon = config.icon

  // Auto-dismiss after delay — just hide the toast, don't mark as read
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notification.id, onDismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.96 }}
      transition={{
        duration: tokens.animation.notification.duration,
        ease: tokens.animation.notification.ease
      }}
      className="vos-toast"
    >
      {/* Level bar */}
      <div className="vos-toast-bar" style={{ background: config.color }} />

      <div className="vos-toast-body">
        <div className="vos-toast-icon" style={{ color: config.color }}>
          <Icon size={16} />
        </div>
        <div className="vos-toast-content">
          <p className="vos-toast-title">{notification.title}</p>
          {notification.message && <p className="vos-toast-message">{notification.message}</p>}
        </div>
        <button type="button" className="vos-toast-close" onClick={() => remove(notification.id)}>
          <X size={12} />
        </button>
      </div>
    </motion.div>
  )
}

export default function NotificationToast() {
  // Respect do-not-disturb mode — don't show toast banners
  const doNotDisturb = useNotificationStore(s => s.doNotDisturb)
  const notifications = useNotificationStore(s => s.notifications)

  // Track which toast IDs have been auto-dismissed (still unread, just hidden from toast area)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // Clean stale entries (notifications that were read or removed) from dismissed set
  useEffect(() => {
    const currentIds = new Set(notifications.map(n => n.id))
    setDismissedIds(prev => {
      const next = new Set<string>()
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [notifications])

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // Compute unread, then subtract already-dismissed toasts
  const unread = notifications.filter(n => !n.read)
  const visible = doNotDisturb ? [] : unread.filter(n => !dismissedIds.has(n.id)).slice(0, 3)

  return createPortal(
    <div className="vos-toast-container">
      <AnimatePresence mode="popLayout">
        {visible.map(n => (
          <Toast key={n.id} notification={n} onDismiss={handleDismiss} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}
