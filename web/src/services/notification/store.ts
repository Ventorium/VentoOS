/**
 * Notification Store
 */

import { create } from 'zustand'

export interface NotificationItem {
  id: string
  title: string
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
  source?: string
  read: boolean
  createdAt: number
}

interface NotificationStore {
  notifications: NotificationItem[]
  panelOpen: boolean
  doNotDisturb: boolean

  _addNotification: (item: NotificationItem) => void

  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
  clearAll: () => void
  togglePanel: () => void
  setPanel: (open: boolean) => void
  getUnreadCount: () => number
  toggleDoNotDisturb: () => void
  setDoNotDisturb: (val: boolean) => void
}

let _notifCounter = 0

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  panelOpen: false,
  doNotDisturb: false,

  _addNotification(item) {
    set(s => ({ notifications: [item, ...s.notifications] }))
  },

  markAsRead(id) {
    set(s => ({
      notifications: s.notifications.map(n => (n.id === id ? { ...n, read: true } : n))
    }))
  },

  markAllAsRead() {
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, read: true }))
    }))
  },

  removeNotification(id) {
    set(s => ({
      notifications: s.notifications.filter(n => n.id !== id)
    }))
  },

  clearAll() {
    set({ notifications: [] })
  },

  togglePanel() {
    set(s => ({ panelOpen: !s.panelOpen }))
  },

  setPanel(open) {
    set({ panelOpen: open })
  },

  getUnreadCount() {
    return get().notifications.filter(n => !n.read).length
  },

  toggleDoNotDisturb() {
    set(s => ({ doNotDisturb: !s.doNotDisturb }))
  },

  setDoNotDisturb(val) {
    set({ doNotDisturb: val })
  }
}))

export function generateNotifId(): string {
  return `notif-${Date.now()}-${++_notifCounter}`
}
