/**
 * Notification Service
 *
 * Creates notifications in the backend database and keeps the local store in sync.
 * Supports task completion notifications, AI agent result notifications,
 * and browser native Notification API.
 */

import { apiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'
import type { NotificationPayload } from '@/infra/ws'
import { wsClient } from '@/infra/ws'
import { systemChannel } from '@/kernel/channel'
import type { NotificationItem, NotificationSource } from './store'
import { generateNotifId, sourceToBackend, useNotificationStore } from './store'

const logger = createLogger('services/notification')

/** Send a browser native notification if enabled and page is not focused. */
function maybeSendNativeNotification(item: NotificationItem): void {
  const store = useNotificationStore.getState()
  if (!store.nativeNotificationsEnabled) return
  if (document.hasFocus()) return
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  try {
    const nativeNotif = new Notification(item.title, {
      body: item.message,
      tag: item.id
    })
    nativeNotif.onclick = () => {
      window.focus()
      useNotificationStore.getState().markAsRead(item.id)
      nativeNotif.close()
    }
  } catch {
    // Silently fail — some environments don't support Notification constructor
  }
}

export const notificationService = {
  /** Add a notification — persists to backend and updates local store. */
  add(n: Omit<NotificationItem, 'id' | 'read' | 'createdAt'>): string {
    const id = generateNotifId()
    const item: NotificationItem = {
      ...n,
      id,
      read: false,
      createdAt: Date.now()
    }
    // Update local store immediately (optimistic)
    useNotificationStore.getState()._addNotification(item)
    systemChannel.notify('notification:added', { notificationId: id })
    maybeSendNativeNotification(item)

    // Persist to backend
    apiClient
      .createNotification({
        title: n.title,
        message: n.message,
        level: n.level,
        source: sourceToBackend(n.source),
        dedup_key: n.dedupKey
      })
      .then(res => {
        if (res.data?.id) {
          logger.debug('Notification persisted to backend', { id: res.data.id })
        }
      })
      .catch(err => {
        logger.warn('Failed to persist notification to backend', err)
      })

    logger.debug('Notification added', { id, title: n.title, level: n.level })
    return id
  },

  /** Shorthand helpers */
  info(title: string, message: string, source?: NotificationSource): string {
    return notificationService.add({ title, message, level: 'info', source })
  },
  success(title: string, message: string, source?: NotificationSource): string {
    return notificationService.add({ title, message, level: 'success', source })
  },
  warn(title: string, message: string, source?: NotificationSource): string {
    return notificationService.add({ title, message, level: 'warning', source })
  },
  error(title: string, message: string, source?: NotificationSource): string {
    return notificationService.add({ title, message, level: 'error', source })
  },

  /** Notify task completion (file transfer, SQL export, etc.) */
  notifyTaskCompletion(opts: {
    taskName: string
    success: boolean
    source: NotificationSource
    detail?: string
  }): string {
    const { taskName, success, source, detail } = opts
    const level = success ? 'success' : 'error'
    const title = success ? `${taskName} 完成` : `${taskName} 失败`
    const message = detail ?? (success ? '操作已成功完成' : '操作执行失败')
    return notificationService.add({
      title,
      message,
      level,
      source,
      dedupKey: `task-${taskName}-${source}`
    })
  },

  /** Notify AI agent tool execution result */
  notifyAIResult(opts: { toolName: string; resultSummary: string; success: boolean }): string {
    const { toolName, resultSummary, success } = opts
    return notificationService.add({
      title: `AI 工具: ${toolName}`,
      message: resultSummary,
      level: success ? 'info' : 'warning',
      source: 'ai',
      dedupKey: `ai-tool-${toolName}`
    })
  },

  /** Request browser native Notification permission */
  async requestNativePermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    try {
      const result = await Notification.requestPermission()
      return result === 'granted'
    } catch {
      return false
    }
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
        source: (data.source as NotificationSource) ?? undefined,
        read: false,
        createdAt: Date.now()
      }
      useNotificationStore.getState()._addNotification(item)
      systemChannel.notify('notification:added', { notificationId: item.id })
      maybeSendNativeNotification(item)
    })
  }
}
