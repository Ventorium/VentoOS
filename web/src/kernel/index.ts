/**
 * Kernel Layer — Public API
 *
 * Layer 1: Window management, application registry, system notification channel.
 * This is what shell components and apps import from the kernel.
 */

// ── SystemChannel ──────────────────────────────────────────────────────────
export { systemChannel } from './channel'
export type { SystemNotifications } from './channel'

// ── App registry ───────────────────────────────────────────────────────────
export { useAppStore } from './apps/store'
export { registerApp, registerApps, getApp, getAllApps, getAppComponent } from './apps/manager'
export { useApp, useAppList, useAppComponent } from './apps/hooks'
export type { AppManifest, AppComponentProps, AppLifecycle, AppPermission } from './apps/manifest'

// ── Window management ──────────────────────────────────────────────────────
export { useWindowStore } from './window/store'
export {
  openWindow,
  closeWindow,
  focusWindow,
  minimizeWindow,
  restoreWindow,
  toggleMaximize,
  closeAllWindows,
} from './window/manager'
export {
  useWindow,
  useWindowList,
  useFocusedWindow,
  useAppWindows,
  useWindowActions,
} from './window/hooks'
export type { WindowInstance, WindowOpenOptions } from './window/types'

// ── Bootstrap ──────────────────────────────────────────────────────────────
export { bootKernel } from './bootstrap'
