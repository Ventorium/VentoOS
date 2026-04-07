import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number | string
}

export function Modal({ open, onClose, title, icon, children, footer, width = 420 }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            className="vos-modal"
            style={{ maxWidth: width }}
            initial={{ scale: 0.93, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.93, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
          >
            {title && (
              <div className="vos-modal-header">
                {icon}
                <span>{title}</span>
                <button type="button" className="vos-icon-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="vos-modal-body">{children}</div>
            {footer && <div className="vos-modal-footer">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
