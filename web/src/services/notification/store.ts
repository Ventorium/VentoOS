/**
 * Notification Store
 *
 * Notifications are persisted to the backend database via REST API.
 * The store loads notifications from the server on boot and syncs
 * all mutations (mark read, delete, clear) back to the server.
 */

import { create } from 'zustand'
import { apiClient } from '@/infra/api'
import type { NotificationDTO } from '@/infra/api'
import { createLogger } from '@/infra/logger'

const logger = createLogger('services/notification/store')

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
  loaded: boolean

  /** Load notifications from backend (call once on boot) */
  loadFromBackend: () => Promise<void>
  _addNotification: (item: NotificationItem) => void
  _setNotifications: (items: NotificationItem[]) => void

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

const MAX_NOTIFICATIONS = 100

const EMPTY_FILTER: NotificationFilter = {
  levels: [],
  sources: [],
  dateRange: null
}

/** Convert backend DTO to frontend model */
function dtoToItem(dto: NotificationDTO): NotificationItem {
  return {
    id: dto.id,
    title: dto.title,
    message: dto.message,
    level: dto.level,
    source: mapSource(dto.source),
    read: dto.read,
    createdAt: new Date(dto.created_at).getTime()
  }
}

/** Map backend source enum to frontend source type */
function mapSource(s: string): NotificationSource | undefined {
  const map: Record<string, NotificationSource> = {
    system: 'system',
    connection: 'system',
    task: 'system',
    agent: 'ai',
    app: 'system'
  }
  return map[s] ?? undefined
}

/** Map frontend source to backend source string */
function sourceToBackend(s?: NotificationSource): string {
  const map: Record<string, string> = {
    ai: 'agent',
    k8s: 'app',
    db: 'app',
    redis: 'app',
    vfs: 'app',
    system: 'system'
  }
  return s ? (map[s] ?? 'system') : 'system'
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  panelOpen: false,
  doNotDisturb: false,
  nativeNotificationsEnabled: false,
  filter: { ...EMPTY_FILTER },
  loaded: false,

  async loadFromBackend() {
    try {
      const res = await apiClient.getNotifications()
      if (res.data) {
        const items = res.data.map(dtoToItem)
        set({ notifications: items, loaded: true })
        logger.debug('Loaded notifications from backend', { count: items.length })
      }
    } catch (err) {
      logger.warn('Failed to load notifications from backend', err)
      set({ loaded: true })
    }
  },

  _addNotification(item) {
    set(s => {
      let list = s.notifications
      if (item.dedupKey) {
        list = list.filter(n => n.dedupKey !== item.dedupKey)
      }
      const updated = [item, ...list]
      return { notifications: updated.length > MAX_NOTIFICATIONS ? updated.slice(0, MAX_NOTIFICATIONS) : updated }
    })
  },

  _setNotifications(items) {
    set({ notifications: items })
  },

  markAsRead(id) {
    // Optimistic update
    set(s => ({
      notifications: s.notifications.map(n => (n.id === id ? { ...n, read: true } : n))
    }))
    // Sync to backend
    apiClient.markNotificationRead(id).catch(err => {
      logger.warn('Failed to mark notification as read on backend', err)
    })
  },

  markAllAsRead() {
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, read: true }))
    }))
    apiClient.markAllNotificationsRead().catch(err => {
      logger.warn('Failed to mark all as read on backend', err)
    })
  },

  removeNotification(id) {
    set(s => ({
      notifications: s.notifications.filter(n => n.id !== id)
    }))
    apiClient.deleteNotification(id).catch(err => {
      logger.warn('Failed to delete notification on backend', err)
    })
  },

  clearAll() {
    set({ notifications: [] })
    apiClient.clearAllNotifications().catch(err => {
      logger.warn('Failed to clear notifications on backend', err)
    })
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
  }
}))

export function filterNotifications(notifications: NotificationItem[], filter: NotificationFilter): NotificationItem[] {
  return notifications.filter(n => {
    if (filter.levels.length > 0 && !filter.levels.includes(n.level)) return false
    if (filter.sources.length > 0 && (!n.source || !filter.sources.includes(n.source))) return false
    if (filter.dateRange) {
      if (n.createdAt < filter.dateRange.start || n.createdAt > filter.dateRange.end) return false
    }
    return true
  })
}

/** Generate a local ID (used as fallback before backend response) */
let _notifCounter = 0
export function generateNotifId(): string {
  return `notif-${Date.now()}-${++_notifCounter}`
}

/** Export source mapping for the service layer */
export { sourceToBackend }
