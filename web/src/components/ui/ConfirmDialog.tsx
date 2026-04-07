import type { ReactNode } from 'react'
import { Modal } from './Modal'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  icon?: ReactNode
  children: ReactNode
  confirmText?: string
  danger?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  icon,
  children,
  confirmText = '确认',
  danger = false,
  loading = false
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={icon}
      width={380}
      footer={
        <>
          <button type="button" className="vos-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={`vos-btn ${danger ? 'vos-btn-danger' : 'vos-btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '处理中…' : confirmText}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
