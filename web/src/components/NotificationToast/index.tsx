/**
 * Notification Toast System
 *
 * Renders pop-up banners from the top-right of the screen.
 * Auto-dismisses after 5 seconds. Stacks vertically.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle, Info, X, XCircle } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNotificationStore, type NotificationItem } from '@/store/notification'
import { tokens } from '@/theme'

const LEVEL_CONFIG = {
  info: { icon: Info, color: 'var(--vos-accent-info)', bg: 'var(--vos-accent-info)' },
  success: { icon: CheckCircle, color: 'var(--vos-accent-success)', bg: 'var(--vos-accent-success)' },
  warning: { icon: AlertCircle, color: 'var(--vos-accent-warning)', bg: 'var(--vos-accent-warning)' },
  error: { icon: XCircle, color: 'var(--vos-accent-danger)', bg: 'var(--vos-accent-danger)' }
}

const AUTO_DISMISS_MS = 5000

function Toast({ notification }: { notification: NotificationItem }) {
  const remove = useNotificationStore(s => s.removeNotification)
  const config = LEVEL_CONFIG[notification.level]
  const Icon = config.icon

  // Auto-dismiss
  useEffect(() => {
    const timer = setTimeout(() => remove(notification.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notification.id, remove])

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
      <div
        className="vos-toast-bar"
        style={{ background: config.color }}
      />

      <div className="vos-toast-body">
        <div className="vos-toast-icon" style={{ color: config.color }}>
          <Icon size={16} />
        </div>
        <div className="vos-toast-content">
          <p className="vos-toast-title">{notification.title}</p>
          {notification.message && (
            <p className="vos-toast-message">{notification.message}</p>
          )}
        </div>
        <button
          type="button"
          className="vos-toast-close"
          onClick={() => remove(notification.id)}
        >
          <X size={12} />
        </button>
      </div>
    </motion.div>
  )
}

export default function NotificationToast() {
  // Show only the most recent 3 unread toasts
  const notifications = useNotificationStore(s =>
    s.notifications.filter(n => !n.read).slice(0, 3)
  )

  return createPortal(
    <div className="vos-toast-container">
      <AnimatePresence mode="popLayout">
        {notifications.map(n => (
          <Toast key={n.id} notification={n} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}
