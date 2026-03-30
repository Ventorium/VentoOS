/**
 * Kernel Layer — Public API
 *
 * Layer 1: Window management, application registry, system notification channel.
 * This is what shell components and apps import from the kernel.
 */

export { useApp, useAppComponent, useAppList } from './apps/hooks'
export { getAllApps, getApp, getAppComponent, registerApp, registerApps } from './apps/manager'
export type { AppComponentProps, AppLifecycle, AppManifest, AppPermission } from './apps/manifest'
// ── App registry ───────────────────────────────────────────────────────────
export { useAppStore } from './apps/store'
// ── Bootstrap ──────────────────────────────────────────────────────────────
export { bootKernel } from './bootstrap'
export type { SystemNotifications } from './channel'
// ── SystemChannel ──────────────────────────────────────────────────────────
export { systemChannel } from './channel'
export {
  useAppWindows,
  useFocusedWindow,
  useWindow,
  useWindowActions,
  useWindowList
} from './window/hooks'
export {
  closeAllWindows,
  closeWindow,
  focusWindow,
  minimizeWindow,
  openWindow,
  restoreWindow,
  toggleMaximize
} from './window/manager'
// ── Window management ──────────────────────────────────────────────────────
export { useWindowStore } from './window/store'
export type { WindowInstance, WindowOpenOptions } from './window/types'
