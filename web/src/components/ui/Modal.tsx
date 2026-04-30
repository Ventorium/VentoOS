import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number | string
  /** When provided, modal is anchored to this top offset (px) instead of being vertically centered */
  top?: number | string
  /** Override max-height for the modal container (default: 90vh) */
  maxHeight?: string
}

export function Modal({ open, onClose, title, icon, children, footer, width = 420, top, maxHeight }: ModalProps) {
  const overlayStyle: React.CSSProperties =
    top !== undefined ? { alignItems: 'flex-start', paddingTop: typeof top === 'number' ? `${top}px` : top } : {}

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50 bg-[rgba(0,0,0,0.45)] backdrop-blur-[4px]"
          style={overlayStyle}
          onClick={onClose}
        >
          <motion.div
            className="vos-modal"
            style={{ maxWidth: width, maxHeight: maxHeight ?? '90vh' }}
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
                <button type="button" className="vos-icon-btn ml-auto" onClick={onClose}>
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
