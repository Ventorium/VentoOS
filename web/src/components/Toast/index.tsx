/**
 * Global Toast Container
 *
 * Renders ephemeral feedback toasts at the top-center of the screen.
 * Lightweight, auto-dismiss, no persistence.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle, Info, X, XCircle } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useToastStore } from './store'
import { tokens } from '@/theme'

const TYPE_CONFIG = {
  info: { icon: Info, color: 'var(--vos-accent-info)' },
  success: { icon: CheckCircle, color: 'var(--vos-accent-success)' },
  warning: { icon: AlertCircle, color: 'var(--vos-accent-warning)' },
  error: { icon: XCircle, color: 'var(--vos-accent-danger)' }
}

function ToastItem({ id, message, type }: { id: string; message: string; type: keyof typeof TYPE_CONFIG }) {
  const remove = useToastStore(s => s.removeToast)
  const config = TYPE_CONFIG[type]
  const Icon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.92 }}
      transition={{
        duration: tokens.animation.notification.duration,
        ease: tokens.animation.notification.ease
      }}
      className="vos-toast-center"
    >
      <div className="vos-toast-center-bar" style={{ background: config.color }} />
      <div className="vos-toast-center-body">
        <div className="vos-toast-center-icon" style={{ color: config.color }}>
          <Icon size={16} />
        </div>
        <p className="vos-toast-center-message">{message}</p>
        <button
          type="button"
          className="vos-toast-center-close"
          onClick={() => remove(id)}
        >
          <X size={12} />
        </button>
      </div>
    </motion.div>
  )
}

export default function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)

  return createPortal(
    <div className="vos-toast-center-container">
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <ToastItem key={t.id} id={t.id} message={t.message} type={t.type} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}

export { toast } from './store'
