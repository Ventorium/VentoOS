/**
 * Kernel Layer — Public API
 *
 * Layer 1: Window management, application registry, system notification channel.
 * This is what shell components and apps import from the kernel.
 */

export { useApp, useAppComponent, useAppList } from './apps/hooks'
export { getAllApps, getAllAppsForFile, getApp, getAppComponent, getAppsForFile, getOpenAppsForFile, getPreviewAppsForFile, registerApp, registerApps } from './apps/manager'
export type { AppComponentProps, AppLifecycle, AppManifest, AppPermission } from './apps/manifest'
export type { AppMenuEntry, AppMenuGroup, AppMenuItem, AppTrayConfig } from './apps/menu'
export { useActiveAppMenus, useAllTrays, useAppMenus, useAppTray } from './apps/menu-hooks'
export {
  registerAppMenus,
  registerAppTray,
  unregisterAppMenus,
  unregisterAppTray,
  useMenuStore
} from './apps/menu-store'
// ── App registry ───────────────────────────────────────────────────────────
export { useAppStore } from './apps/store'
// ── File defaults ──────────────────────────────────────────────────────────
export { useFileDefaultsStore } from './apps/file-defaults'
// ── File icons ─────────────────────────────────────────────────────────────
export { getFileIcon, getFileIconByName } from './apps/file-icons'
// ── Bootstrap ──────────────────────────────────────────────────────────────
export { bootKernel } from './bootstrap'
export type { SystemNotifications } from './channel'
// ── SystemChannel ──────────────────────────────────────────────────────────
export { systemChannel } from './channel'
export type { AppStorageAPI } from './storage'
// ── Storage SDK ────────────────────────────────────────────────────────────
export { createAppStorage, useAppStorage } from './storage'
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
