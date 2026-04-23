/**
 * Global Toast Store
 *
 * Lightweight ephemeral toasts for user feedback.
 * Not persisted to backend — purely UI-level.
 */

import { create } from 'zustand'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
}

interface ToastStore {
  toasts: ToastItem[]
  addToast: (item: ToastItem) => void
  removeToast: (id: string) => void
}

let _toastCounter = 0
export function generateToastId(): string {
  return `toast-${Date.now()}-${++_toastCounter}`
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast(item) {
    set(s => ({ toasts: [...s.toasts, item] }))

    // Auto-remove after duration
    if (item.duration > 0) {
      setTimeout(() => {
        get().removeToast(item.id)
      }, item.duration)
    }
  },

  removeToast(id) {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
  }
}))

export function toast(message: string, type: ToastType = 'info', duration = 2000) {
  useToastStore.getState().addToast({
    id: generateToastId(),
    message,
    type,
    duration
  })
}

toast.success = (message: string, duration = 2000) => toast(message, 'success', duration)
toast.error = (message: string, duration = 3000) => toast(message, 'error', duration)
toast.warning = (message: string, duration = 2500) => toast(message, 'warning', duration)
toast.info = (message: string, duration = 2000) => toast(message, 'info', duration)
