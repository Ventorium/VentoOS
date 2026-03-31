/**
 * Notification Service
 *
 * Creates notifications and listens to backend-pushed notifications.
 */

import { createLogger } from '@/infra/logger'
import type { NotificationPayload } from '@/infra/ws'
import { wsClient } from '@/infra/ws'
import { systemChannel } from '@/kernel/channel'
import type { NotificationItem } from './store'
import { generateNotifId, useNotificationStore } from './store'

const logger = createLogger('services/notification')

export const notificationService = {
  /** Add a notification programmatically. */
  add(n: Omit<NotificationItem, 'id' | 'read' | 'createdAt'>): string {
    const id = generateNotifId()
    const item: NotificationItem = {
      ...n,
      id,
      read: false,
      createdAt: Date.now()
    }
    useNotificationStore.getState()._addNotification(item)
    systemChannel.notify('notification:added', { notificationId: id })
    logger.debug('Notification added', { id, title: n.title, level: n.level })
    return id
  },

  /** Shorthand helpers */
  info(title: string, message: string, source?: string): string {
    return notificationService.add({ title, message, level: 'info', source })
  },
  success(title: string, message: string, source?: string): string {
    return notificationService.add({ title, message, level: 'success', source })
  },
  warn(title: string, message: string, source?: string): string {
    return notificationService.add({ title, message, level: 'warning', source })
  },
  error(title: string, message: string, source?: string): string {
    return notificationService.add({ title, message, level: 'error', source })
  },

  /**
   * Subscribe to backend-pushed notifications via WebSocket.
   * Returns cleanup function.
   */
  listenToBackendNotifications(): () => void {
    return wsClient.on('Notification', (data: NotificationPayload) => {
      const item: NotificationItem = {
        id: data.id,
        title: data.title,
        message: data.message,
        level: data.level,
        source: data.source,
        read: false,
        createdAt: Date.now()
      }
      useNotificationStore.getState()._addNotification(item)
      systemChannel.notify('notification:added', { notificationId: item.id })
    })
  }
}
