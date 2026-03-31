/**
 * Services Layer — Public API
 *
 * Layer 2 (Services): Frontend service proxies.
 * Each service pairs a Zustand store (local cache/state) with a service object
 * (API calls, WS subscriptions, business logic).
 */

export { authService, useAuthStore } from './auth'
export type { ConnectionItem, ConnectionType } from './connection'
export { connectionService, useConnectionStore } from './connection'
export type { Shortcut } from './keyboard'
export { useKeyboardStore, useShortcut } from './keyboard'
export type { NotificationItem } from './notification'
export { notificationService, useNotificationStore } from './notification'
export { processService } from './process'
export type { ThemeMode } from './settings'
export { settingsService, useSettingsStore } from './settings'
export { useSystemStore } from './system'
export type { TaskItem } from './task'
export { taskService, useTaskStore } from './task'
export type { VfsClipboard } from './vfs'
export { useVfsClipboardStore } from './vfs'
