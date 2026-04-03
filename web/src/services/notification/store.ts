/**
 * Notification Store
 */

import { create } from 'zustand'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'
export type NotificationSource = 'k8s' | 'db' | 'redis' | 'vfs' | 'ai' | 'system'

export interface NotificationItem {
  id: string
  title: string
  message: string
  level: NotificationLevel
  source?: NotificationSource
  read: boolean
  createdAt: number
  /** Dedup key — if set, newer notifications with same key replace older ones */
  dedupKey?: string
}

export interface NotificationFilter {
  levels: NotificationLevel[]
  sources: NotificationSource[]
  dateRange: { start: number; end: number } | null
}

interface NotificationStore {
  notifications: NotificationItem[]
  panelOpen: boolean
  doNotDisturb: boolean
  nativeNotificationsEnabled: boolean
  filter: NotificationFilter

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
  setNativeNotificationsEnabled: (val: boolean) => void
  setFilter: (filter: Partial<NotificationFilter>) => void
  resetFilter: () => void
  getFilteredNotifications: () => NotificationItem[]
}

let _notifCounter = 0

const EMPTY_FILTER: NotificationFilter = {
  levels: [],
  sources: [],
  dateRange: null,
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  panelOpen: false,
  doNotDisturb: false,
  nativeNotificationsEnabled: false,
  filter: { ...EMPTY_FILTER },

  _addNotification(item) {
    set(s => {
      let list = s.notifications
      // Dedup: remove existing notification with same dedupKey
      if (item.dedupKey) {
        list = list.filter(n => n.dedupKey !== item.dedupKey)
      }
      return { notifications: [item, ...list] }
    })
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
  },

  setNativeNotificationsEnabled(val) {
    set({ nativeNotificationsEnabled: val })
  },

  setFilter(partial) {
    set(s => ({ filter: { ...s.filter, ...partial } }))
  },

  resetFilter() {
    set({ filter: { ...EMPTY_FILTER } })
  },

  getFilteredNotifications() {
    const { notifications, filter } = get()
    return filterNotifications(notifications, filter)
  },
}))

export function filterNotifications(
  notifications: NotificationItem[],
  filter: NotificationFilter
): NotificationItem[] {
  return notifications.filter(n => {
    if (filter.levels.length > 0 && !filter.levels.includes(n.level)) return false
    if (filter.sources.length > 0 && (!n.source || !filter.sources.includes(n.source))) return false
    if (filter.dateRange) {
      if (n.createdAt < filter.dateRange.start || n.createdAt > filter.dateRange.end) return false
    }
    return true
  })
}

export function generateNotifId(): string {
  return `notif-${Date.now()}-${++_notifCounter}`
}
