/**
 * Services Layer — Public API
 *
 * Layer 2 (Services): Frontend service proxies.
 * Each service pairs a Zustand store (local cache/state) with a service object
 * (API calls, WS subscriptions, business logic).
 */

export { useAuthStore, authService } from './auth'
export { processService } from './process'
export { useConnectionStore, connectionService } from './connection'
export type { ConnectionItem, ConnectionType } from './connection'
export { useTaskStore, taskService } from './task'
export type { TaskItem } from './task'
export { useNotificationStore, notificationService } from './notification'
export type { NotificationItem } from './notification'
export { useSettingsStore, settingsService } from './settings'
export type { ThemeMode } from './settings'
export { useKeyboardStore, useShortcut } from './keyboard'
export type { Shortcut } from './keyboard'
export { useSystemStore } from './system'
