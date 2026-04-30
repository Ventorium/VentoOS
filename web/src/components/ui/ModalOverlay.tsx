import type { ReactNode } from 'react'

/**
 * System-level modal overlay with ESC-to-close support.
 * Renders a div with vos-modal-overlay class and handles Escape key.
 */
export function ModalOverlay({
  onClose,
  className,
  style,
  children
}: {
  onClose: () => void
  className?: string
  style?: React.CSSProperties
  children: ReactNode
}) {
  return (
    <div
      className={className ?? 'vos-modal-overlay'}
      style={style}
      onClick={onClose}
      onKeyDown={e => {
        if (e.key === 'Escape') onClose()
      }}
    >
      {children}
    </div>
  )
}
